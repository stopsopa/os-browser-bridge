const WS_SERVER_URL = 'ws://localhost:8080';
let ws;

function connectWebSocket() {
    ws = new WebSocket(WS_SERVER_URL);

    ws.onopen = () => {
        console.log('Connected to WebSocket server');
    };

    ws.onmessage = (event) => {
        console.log('Message from server:', event.data);
        // Forward the message to all tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: 'FROM_SERVER', payload: event.data });
            });
        });
    };

    ws.onclose = () => {
        console.log('Disconnected from WebSocket server. Attempting to reconnect...');
        setTimeout(connectWebSocket, 1000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
    };
}

connectWebSocket();
