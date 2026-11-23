// Popup script for OS Browser Bridge extension

// DOM elements
const serverUrlInput = document.getElementById('serverUrl');
const connectionToggle = document.getElementById('connectionToggle');
const saveButton = document.getElementById('saveButton');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const urlError = document.getElementById('serverUrl-error');
const serverUrlWrapper = document.getElementById('serverUrlWrapper');
const settingsForm = document.getElementById('settingsForm');

/**
 * Error state of the URL field in the way gcp-css expects it:
 * data-error attribute on the wrapper (shows .error element), aria attributes on the input.
 */
function showUrlError(message) {
  urlError.textContent = message;
  serverUrlWrapper.toggleAttribute('data-error', true);
  serverUrlInput.setAttribute('aria-invalid', 'true');
  serverUrlInput.setAttribute('aria-describedby', 'serverUrl-helper serverUrl-error');
}

function hideUrlError() {
  serverUrlWrapper.toggleAttribute('data-error', false);
  serverUrlInput.removeAttribute('aria-invalid');
  serverUrlInput.setAttribute('aria-describedby', 'serverUrl-helper');
}

// Flag to prevent recursive updates
let isUpdating = false;

// Load saved settings and current status
async function loadSettings() {
  try {
    // Get saved settings from storage
    const settings = await chrome.storage.local.get(['serverUrl', 'connectionEnabled']);
    
    // Set input values - no default URL
    serverUrlInput.value = settings.serverUrl || '';
    
    // Get current connection status from background
    const response = await chrome.runtime.sendMessage({ type: 'get_popup_status' });
    
    // Use the actual state from background script as source of truth
    isUpdating = true;
    // Connection should be disabled by default if no URL is set
    const hasValidUrl = !!settings.serverUrl;
    connectionToggle.checked = response ? response.connectionEnabled : (hasValidUrl && settings.connectionEnabled);
    isUpdating = false;
    
    // Disable toggle if no URL is set
    connectionToggle.disabled = !settings.serverUrl;
    
    updateStatusDisplay(response);
    
  } catch (error) {
    console.error('Error loading settings:', error);
    statusText.textContent = 'Error loading settings';
  }
}

// Save settings
async function saveSettings() {
  try {
    // Empty field: remove the URL (that also turns the connection off)
    if (!serverUrlInput.value.trim()) {
      hideUrlError();

      isUpdating = true;
      connectionToggle.checked = false;
      connectionToggle.disabled = true;
      isUpdating = false;

      await chrome.storage.local.set({
        serverUrl: '',
        connectionEnabled: false
      });

      const response = await chrome.runtime.sendMessage({
        type: 'update_settings',
        serverUrl: '',
        connectionEnabled: false
      });

      updateStatusDisplay(response);

      return;
    }

    // Normalize and validate URL
    const normalizedUrl = normalizeWebSocketUrl(serverUrlInput.value);
    if (!normalizedUrl) {
      showUrlError('Please enter a valid WebSocket URL (e.g., localhost:8080 or ws://localhost:8080)');
      return;
    }
    hideUrlError();
    
    // Update input with normalized URL
    serverUrlInput.value = normalizedUrl;
    
    // Disable save button during save
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    
    // Save to storage
    await chrome.storage.local.set({
      serverUrl: normalizedUrl,
      connectionEnabled: connectionToggle.checked
    });
    
    // Enable toggle now that we have a valid URL
    connectionToggle.disabled = false;
    
    // Notify background script of changes
    const response = await chrome.runtime.sendMessage({
      type: 'update_settings',
      serverUrl: normalizedUrl,
      connectionEnabled: connectionToggle.checked
    });
    
    // Update status display
    updateStatusDisplay(response);
    
    // Show success feedback
    saveButton.textContent = 'Saved!';
    setTimeout(() => {
      saveButton.textContent = 'Save Settings';
      saveButton.disabled = false;
    }, 1500);
    
  } catch (error) {
    console.error('Error saving settings:', error);
    saveButton.textContent = 'Error!';
    setTimeout(() => {
      saveButton.textContent = 'Save Settings';
      saveButton.disabled = false;
    }, 2000);
  }
}

// Normalize and validate WebSocket URL
function normalizeWebSocketUrl(url) {
  if (!url || !url.trim()) return null;
  
  url = url.trim();
  
  // Auto-prepend ws:// if no protocol is specified
  if (!url.includes('://')) {
    url = 'ws://' + url;
  }
  
  // Validate the URL
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'ws:' && urlObj.protocol !== 'wss:') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

// Update status display based on connection state
function updateStatusDisplay(status) {
  if (!status) {
    statusIndicator.className = 'status-indicator disconnected';
    statusText.className = 'status-text disconnected';
    statusText.textContent = 'Unable to get status';
    return;
  }
  
  const { connectionEnabled, isConnected, connectionState, serverUrl } = status;
  
  // Remove all status classes
  statusIndicator.className = 'status-indicator';
  statusText.className = 'status-text';
  
  if (!serverUrl) {
    // No URL configured
    statusIndicator.classList.add('disconnected');
    statusText.classList.add('disconnected');
    statusText.textContent = 'No server URL configured';
    serverUrlInput.disabled = false;
  } else if (!connectionEnabled) {
    // Connection disabled
    statusIndicator.classList.add('disconnected');
    statusText.classList.add('disconnected');
    statusText.textContent = 'Connection disabled';
    serverUrlInput.disabled = false;
  } else if (isConnected) {
    // Connected
    statusIndicator.classList.add('connected');
    statusText.classList.add('connected');
    statusText.textContent = `Connected to ${serverUrl}`;
    serverUrlInput.disabled = true; // Don't allow URL changes while connected
  } else if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    // Connecting
    statusIndicator.classList.add('connecting');
    statusText.classList.add('connecting');
    statusText.textContent = `Connecting to ${serverUrl}...`;
    serverUrlInput.disabled = true;
  } else {
    // Disconnected but trying to connect
    statusIndicator.classList.add('disconnected');
    statusText.classList.add('disconnected');
    statusText.textContent = `Disconnected from ${serverUrl}`;
    serverUrlInput.disabled = false;
  }
}

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'status_update') {
    updateStatusDisplay(message);
  }
});

// Handle connection toggle change - save immediately
connectionToggle.addEventListener('change', async () => {
  if (isUpdating) return; // Prevent recursive updates
  
  try {
    const newState = connectionToggle.checked;
    
    // If trying to enable, ensure we have a valid URL
    if (newState) {
      const currentUrl = serverUrlInput.value.trim();
      if (!currentUrl) {
        // Revert toggle and show error
        isUpdating = true;
        connectionToggle.checked = false;
        isUpdating = false;
        showUrlError('Please enter a server URL before enabling connection');
        return;
      }
      
      // Validate URL
      const normalizedUrl = normalizeWebSocketUrl(currentUrl);
      if (!normalizedUrl) {
        // Revert toggle and show error
        isUpdating = true;
        connectionToggle.checked = false;
        isUpdating = false;
        showUrlError('Please enter a valid WebSocket URL (e.g., localhost:8080)');
        return;
      }
      
      // Update input with normalized URL if needed
      if (currentUrl !== normalizedUrl) {
        serverUrlInput.value = normalizedUrl;
      }
    }
    
    // Save to storage immediately
    await chrome.storage.local.set({
      connectionEnabled: newState
    });
    
    // Notify background script of changes
    const response = await chrome.runtime.sendMessage({
      type: 'update_settings',
      serverUrl: normalizeWebSocketUrl(serverUrlInput.value) || serverUrlInput.value.trim(),
      connectionEnabled: newState
    });
    
    // Update display based on response
    if (response) {
      // Use response state as source of truth
      isUpdating = true;
      connectionToggle.checked = response.connectionEnabled;
      isUpdating = false;
      updateStatusDisplay(response);
    }
  } catch (error) {
    console.error('Error toggling connection:', error);
    // Revert toggle on error
    isUpdating = true;
    connectionToggle.checked = !connectionToggle.checked;
    isUpdating = false;
    statusText.textContent = 'Error updating connection state';
  }
});

// Handle URL input change
serverUrlInput.addEventListener('input', () => {
  // Hide error message when user types
  hideUrlError();
  // Enable save button when settings change
  saveButton.disabled = false;
  
  // Check if we have a potentially valid URL to enable/disable the toggle
  const currentUrl = serverUrlInput.value.trim();
  if (currentUrl) {
    // We have some text, check if it could be valid
    const normalizedUrl = normalizeWebSocketUrl(currentUrl);
    connectionToggle.disabled = !normalizedUrl;
  } else {
    // No URL, disable the toggle
    connectionToggle.disabled = true;
    // Also turn off the toggle if it's on
    if (connectionToggle.checked) {
      isUpdating = true;
      connectionToggle.checked = false;
      isUpdating = false;
    }
  }
});

// Handle save button click and Enter key in URL input (both submit the form)
settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings();
});

// Initialize popup
loadSettings();
