
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const serveIndex = require('serve-index');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'public' directory with index: false to prevent auto-serving index.html
app.use(express.static(path.join(__dirname, 'public'), {
    index: false, // stop automatically serve index.html if present. instead list content of directory
    maxAge: '356 days', // in milliseconds max-age=30758400
    setHeaders: (res, path) => {
        if (/\.bmp$/i.test(path)) { // for some reason by default express.static sets here Content-Type: image/x-ms-bmp
            res.setHeader('Content-type', 'image/bmp')
        }
    }
}));

// Serve directory listing for the root path
app.use('/', serveIndex(path.join(__dirname, 'public'), {
    icons: true,
    view: 'details',
    hidden: false, // Display hidden (dot) files. Defaults to false.
}));

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
