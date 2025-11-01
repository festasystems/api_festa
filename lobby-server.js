// lobby-server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

const hosts = new Map(); // roomCode → { ip, port, socketId }

io.on('connection', (socket) => {
  console.log('Ulandi:', socket.id);

  socket.on('create-host', (data) => {
    const { roomCode, publicIp, port } = data;
    hosts.set(roomCode, { publicIp, port, socketId: socket.id });
    socket.join(roomCode);
    console.log(`HOST: ${roomCode} → ${publicIp}:${port}`);
  });

  socket.on('join-request', (roomCode) => {
    const host = hosts.get(roomCode);
    if (host) {
      socket.emit('host-info', { ip: host.publicIp, port: host.port });
      io.to(host.socketId).emit('player-joined', socket.id);
    } else {
      socket.emit('error', 'Xona topilmadi!');
    }
  });

  socket.on('disconnect', () => {
    for (let [code, h] of hosts.entries()) {
      if (h.socketId === socket.id) {
        hosts.delete(code);
        console.log(`Host o'chdi: ${code}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Lobby server ishlayapti: ${PORT}`);
});
