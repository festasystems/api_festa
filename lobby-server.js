const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const hosts = new Map();

io.on('connection', (socket) => {
  console.log('Ulandi:', socket.id);

  socket.on('create-host', (data) => {
    hosts.set(data.roomCode, { ...data, socketId: socket.id });
    socket.join(data.roomCode);
    io.emit('host-updated', { roomCode: data.roomCode, ip: data.publicIp, port: data.port });
  });

  socket.on('join-request', (roomCode) => {
    const host = hosts.get(roomCode);
    if (host) {
      socket.emit('host-info', { ip: host.publicIp, port: host.port });
    } else {
      socket.emit('error', 'Host topilmadi!');
    }
  });

  socket.on('disconnect', () => {
    for (let [code, h] of hosts) {
      if (h.socketId === socket.id) hosts.delete(code);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server: ${PORT}`));
