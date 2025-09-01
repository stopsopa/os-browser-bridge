
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

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
    console.log('Server listening on http://localhost:8080');
});
