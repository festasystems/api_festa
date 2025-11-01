// lobby-server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

let hosts = new Map();

io.on('connection', (socket) => {
    socket.on('create-host', (data) => {
        hosts.set(data.roomCode, { ...data, socketId: socket.id });
        socket.join(data.roomCode);
    });

    socket.on('join-request', (roomCode) => {
        const host = hosts.get(roomCode);
        if (host) {
            socket.emit('host-info', { ip: host.publicIp, port: host.port });
        } else {
            socket.emit('error', 'Xona topilmadi!');
        }
    });

    socket.on('disconnect', () => {
        for (let [code, h] of hosts.entries()) {
            if (h.socketId === socket.id) hosts.delete(code);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Lobby running on ${PORT}`));
