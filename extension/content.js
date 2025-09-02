chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'os_browser_bridge_event') {
        try {
            const eventData = JSON.parse(message.payload);
            const customEvent = new CustomEvent('os_browser_bridge_event', { detail: eventData });
            window.dispatchEvent(customEvent);
            console.log('Dispatched os_browser_bridge_event:', eventData);
        } catch (e) {
            console.error('Error parsing message payload:', e);
        }
    }
});
