// Popup script for OS Browser Bridge extension

// DOM elements
const serverUrlInput = document.getElementById('serverUrl');
const connectionToggle = document.getElementById('connectionToggle');
const saveButton = document.getElementById('saveButton');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const urlError = document.getElementById('urlError');

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
    // Normalize and validate URL
    const normalizedUrl = normalizeWebSocketUrl(serverUrlInput.value);
    if (!normalizedUrl) {
      urlError.textContent = 'Please enter a valid WebSocket URL (e.g., localhost:8080 or ws://localhost:8080)';
      urlError.classList.add('show');
      return;
    }
    urlError.classList.remove('show');
    
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
        urlError.textContent = 'Please enter a server URL before enabling connection';
        urlError.classList.add('show');
        return;
      }
      
      // Validate URL
      const normalizedUrl = normalizeWebSocketUrl(currentUrl);
      if (!normalizedUrl) {
        // Revert toggle and show error
        isUpdating = true;
        connectionToggle.checked = false;
        isUpdating = false;
        urlError.textContent = 'Please enter a valid WebSocket URL (e.g., localhost:8080)';
        urlError.classList.add('show');
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
  urlError.classList.remove('show');
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

// Handle save button click
saveButton.addEventListener('click', saveSettings);

// Handle Enter key in URL input
serverUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

// Initialize popup
loadSettings();
