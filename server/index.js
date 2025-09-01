
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server is running');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log('Client connected');

    // Send a message every 3 seconds to the connected client
    const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            const eventData = {
                type: 'myevent',
                timestamp: new Date().toISOString(),
                message: 'Hello from server!'
            };
            ws.send(JSON.stringify(eventData));
        }
    }, 3000);

    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(interval);
    });
});

server.listen(8080, () => {
    console.log('Server listening on port http://localhost:8080');
});
