chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FROM_SERVER') {
        try {
            const eventData = JSON.parse(message.payload);
            const customEvent = new CustomEvent('myevent', { detail: eventData });
            window.dispatchEvent(customEvent);
            console.log('Dispatched myevent:', eventData);
        } catch (e) {
            console.error('Error parsing message payload:', e);
        }
    }
});
