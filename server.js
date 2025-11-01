const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const nodeCron = require('node-cron');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Data Structures
const activeMatches = new Map();
const waitingPlayers = [];
const gameServers = new Map();
const playerStats = new Map();

// Available Game Servers
const defaultServers = [
  {
    id: 'server-eu-1',
    name: 'Europe #1',
    address: '127.0.0.1',
    port: 7777,
    region: 'europe',
    maxPlayers: 10,
    currentPlayers: 0,
    status: 'online',
    ping: 45
  },
  {
    id: 'server-us-1', 
    name: 'USA #1',
    address: '127.0.0.1',
    port: 7778,
    region: 'usa',
    maxPlayers: 10,
    currentPlayers: 0,
    status: 'online',
    ping: 120
  }
];

// Serverlarni initialize qilish
defaultServers.forEach(server => {
  gameServers.set(server.id, server);
});

// Health Check Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Festa Matchmaking API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Matchmaking ni boshlash
app.post('/api/matchmaking/start', (req, res) => {
  const { player_name, game_mode = '5v5', region = 'auto' } = req.body;
  
  if (!player_name) {
    return res.status(400).json({
      status: 'error',
      message: 'player_name is required'
    });
  }

  console.log(`🎮 Matchmaking started for: ${player_name}`);

  const player = {
    id: uuidv4(),
    name: player_name,
    region: region,
    game_mode: game_mode,
    joined_at: new Date(),
    socket_id: null
  };

  waitingPlayers.push(player);

  // 3 soniyadan keyin match topildi deb simulate qilamiz
  setTimeout(() => {
    const availableServer = defaultServers[0]; // Birinchi serverni tanlaymiz
    
    res.json({
      status: 'match_found',
      match_id: `match_${uuidv4().substring(0, 8)}`,
      server: availableServer,
      players_in_match: 8,
      estimated_wait_time: 2.5
    });
  }, 3000);
});

// Matchmaking ni bekor qilish
app.post('/api/matchmaking/cancel', (req, res) => {
  const { player_name, player_id } = req.body;

  const playerIndex = waitingPlayers.findIndex(p => 
    p.id === player_id || p.name === player_name
  );

  if (playerIndex !== -1) {
    waitingPlayers.splice(playerIndex, 1);
    res.json({
      status: 'cancelled',
      message: 'Matchmaking cancelled'
    });
  } else {
    res.json({
      status: 'cancelled', 
      message: 'No active matchmaking found'
    });
  }
});

// Serverlar ro'yxatini olish
app.get('/api/servers', (req, res) => {
  res.json({
    status: 'success',
    servers: defaultServers,
    total_players: waitingPlayers.length
  });
});

// Server statusini tekshirish
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    active_matches: activeMatches.size,
    waiting_players: waitingPlayers.length,
    total_players: waitingPlayers.length,
    available_servers: defaultServers.length,
    server_region: 'global',
    uptime: process.uptime()
  });
});

// Player statistikasini yuborish
app.post('/api/stats', (req, res) => {
  const { player_name, kills, deaths, score, match_id } = req.body;
  
  console.log(`📊 Stats from ${player_name}: K:${kills} D:${deaths} S:${score}`);
  
  res.json({
    status: 'success',
    message: 'Stats received'
  });
});

// Socket.IO Handlers
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);

  socket.on('join_matchmaking', (playerData) => {
    console.log(`🎮 Player joined: ${playerData.name}`);
    socket.emit('matchmaking_status', { status: 'searching' });
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Festa Matchmaking API running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/`);
  console.log(`🎮 Matchmaking: http://localhost:${PORT}/api/matchmaking/start`);
});
