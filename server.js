const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// HTTP endpointlar
const hosts = new Map();

app.get('/', (req, res) => {
  res.send('Festa Lobby Server ishlayapti!');
});

app.post('/create-host', (req, res) => {
  const { roomCode, publicIp, port } = req.body;
  hosts.set(roomCode, { publicIp, port });
  io.emit('host-updated', { roomCode, publicIp, port });
  res.json({ success: true });
});

app.get('/host-info', (req, res) => {
  const { room } = req.query;
  const host = hosts.get(room);
  if (host) {
    res.json({ ip: host.publicIp, port: host.port });
  } else {
    res.status(404).json({ error: 'Host not found' });
  }
});

io.on('connection', (socket) => {
  console.log('Client ulandi:', socket.id);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server: ${PORT}`);
});
