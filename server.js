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

// Available Game Servers (Siz o'zingizning serverlaringizni qo'shasiz)
const defaultServers = [
  {
    id: 'server-eu-1',
    name: 'Europe #1',
    address: '127.0.0.1', // Haqiqiy server IP si
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
    address: '127.0.0.1', // Haqiqiy server IP si
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

// REST API Endpoints

// 1. Matchmaking ni boshlash
app.post('/api/matchmaking/start', (req, res) => {
  const { player_name, game_mode = '5v5', region = 'auto' } = req.body;
  
  if (!player_name) {
    return res.status(400).json({
      status: 'error',
      message: 'player_name is required'
    });
  }

  console.log(`🎮 Matchmaking started for: ${player_name}`);

  // Player ni waiting ro'yxatiga qo'shish
  const player = {
    id: uuidv4(),
    name: player_name,
    region: region,
    game_mode: game_mode,
    joined_at: new Date(),
    socket_id: null
  };

  waitingPlayers.push(player);

  // Match yasashni tekshirish
  checkForMatchCreation();

  res.json({
    status: 'searching',
    message: 'Looking for players...',
    player_id: player.id,
    estimated_wait_time: 30
  });
});

// 2. Matchmaking ni bekor qilish
app.post('/api/matchmaking/cancel', (req, res) => {
  const { player_name, player_id } = req.body;

  const playerIndex = waitingPlayers.findIndex(p => 
    p.id === player_id || p.name === player_name
  );

  if (playerIndex !== -1) {
    const player = waitingPlayers[playerIndex];
    waitingPlayers.splice(playerIndex, 1);
    
    console.log(`❌ Matchmaking cancelled for: ${player.name}`);
    
    res.json({
      status: 'cancelled',
      message: 'Matchmaking cancelled'
    });
  } else {
    res.status(404).json({
      status: 'error',
      message: 'Player not found in matchmaking'
    });
  }
});

// 3. Serverlar ro'yxatini olish
app.get('/api/servers', (req, res) => {
  const servers = Array.from(gameServers.values());
  
  res.json({
    status: 'success',
    servers: servers,
    total_servers: servers.length,
    total_players: waitingPlayers.length + getTotalPlayersInMatches()
  });
});

// 4. Server statusini tekshirish
app.get('/api/status', (req, res) => {
  const totalPlayers = waitingPlayers.length + getTotalPlayersInMatches();
  const activeMatchesCount = activeMatches.size;
  
  res.json({
    status: 'online',
    active_matches: activeMatchesCount,
    waiting_players: waitingPlayers.length,
    total_players: totalPlayers,
    available_servers: gameServers.size,
    server_region: 'global',
    uptime: process.uptime()
  });
});

// 5. Player statistikasini yuborish
app.post('/api/stats', (req, res) => {
  const { player_name, kills, deaths, score, match_id } = req.body;
  
  if (!player_name) {
    return res.status(400).json({
      status: 'error',
      message: 'player_name is required'
    });
  }

  console.log(`📊 Stats received from ${player_name}: K:${kills} D:${deaths} S:${score}`);
  
  // Statistikani saqlash
  if (!playerStats.has(player_name)) {
    playerStats.set(player_name, []);
  }
  
  const stats = playerStats.get(player_name);
  stats.push({
    match_id: match_id || uuidv4(),
    kills: kills || 0,
    deaths: deaths || 0,
    score: score || 0,
    timestamp: new Date()
  });

  // Faqat oxirgi 100 ta statistikani saqlash
  if (stats.length > 100) {
    stats.splice(0, stats.length - 100);
  }

  res.json({
    status: 'success',
    message: 'Stats saved successfully'
  });
});

// 6. Player statistikasini olish
app.get('/api/stats/:player_name', (req, res) => {
  const { player_name } = req.params;
  
  if (playerStats.has(player_name)) {
    const stats = playerStats.get(player_name);
    res.json({
      status: 'success',
      player_name: player_name,
      total_matches: stats.length,
      total_kills: stats.reduce((sum, s) => sum + s.kills, 0),
      total_deaths: stats.reduce((sum, s) => sum + s.deaths, 0),
      total_score: stats.reduce((sum, s) => sum + s.score, 0),
      matches: stats.slice(-10) // Oxirgi 10 ta match
    });
  } else {
    res.status(404).json({
      status: 'error',
      message: 'Player stats not found'
    });
  }
});

// Socket.IO Handlers
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);

  // Player matchmaking ga qo'shilganda
  socket.on('join_matchmaking', (playerData) => {
    const player = {
      id: uuidv4(),
      name: playerData.name,
      region: playerData.region || 'auto',
      game_mode: playerData.game_mode || '5v5',
      joined_at: new Date(),
      socket_id: socket.id
    };

    waitingPlayers.push(player);
    socket.join('matchmaking');
    
    console.log(`🎮 Player joined matchmaking: ${player.name}`);
    
    // Match yasashni tekshirish
    checkForMatchCreation();
  });

  // Matchmaking ni bekor qilish
  socket.on('cancel_matchmaking', (playerData) => {
    const playerIndex = waitingPlayers.findIndex(p => 
      p.socket_id === socket.id || p.name === playerData.name
    );

    if (playerIndex !== -1) {
      const player = waitingPlayers[playerIndex];
      waitingPlayers.splice(playerIndex, 1);
      socket.leave('matchmaking');
      
      console.log(`❌ Matchmaking cancelled: ${player.name}`);
      socket.emit('matchmaking_cancelled');
    }
  });

  // Player disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    // Player ni waiting ro'yxatidan o'chirish
    const playerIndex = waitingPlayers.findIndex(p => p.socket_id === socket.id);
    if (playerIndex !== -1) {
      const player = waitingPlayers[playerIndex];
      waitingPlayers.splice(playerIndex, 1);
      console.log(`🗑️ Player removed from matchmaking: ${player.name}`);
    }
  });
});

// Helper Functions

// Match yaratishni tekshirish
function checkForMatchCreation() {
  const playersNeeded = 10; // 5v5 uchun
  
  if (waitingPlayers.length >= playersNeeded) {
    createMatch();
  }
}

// Yangi match yaratish
function createMatch() {
  const matchId = `match_${uuidv4().substring(0, 8)}`;
  const players = waitingPlayers.splice(0, 10); // 10 ta player olish
  
  // Available server topish
  const availableServer = findAvailableServer();
  
  if (!availableServer) {
    console.log('❌ No available servers for match');
    // Playerlarni qayta waiting ga qo'shish
    waitingPlayers.unshift(...players);
    return;
  }

  // Server player count ni yangilash
  availableServer.currentPlayers += players.length;
  gameServers.set(availableServer.id, availableServer);

  const match = {
    id: matchId,
    players: players,
    server: availableServer,
    created_at: new Date(),
    status: 'waiting',
    game_mode: '5v5'
  };

  activeMatches.set(matchId, match);

  console.log(`✅ Match created: ${matchId} with ${players.length} players`);
  console.log(`🎯 Server: ${availableServer.name} (${availableServer.address}:${availableServer.port})`);

  // Barcha playerlarga match topilgani haqida xabar berish
  players.forEach(player => {
    if (player.socket_id) {
      io.to(player.socket_id).emit('match_found', {
        match_id: matchId,
        server: availableServer,
        players: players.map(p => ({ name: p.name })),
        team_assignment: assignTeams(players)
      });
    }
  });

  // Matchni 2 daqiqadan keyin boshlash
  setTimeout(() => {
    startMatch(matchId);
  }, 120000); // 2 daqiqa
}

// Available server topish
function findAvailableServer() {
  for (let server of gameServers.values()) {
    if (server.status === 'online' && server.currentPlayers < server.maxPlayers) {
      return server;
    }
  }
  return null;
}

// Team assignment (5v5)
function assignTeams(players) {
  const shuffled = [...players].sort(() => 0.5 - Math.random());
  return {
    team_a: shuffled.slice(0, 5).map(p => p.name),
    team_b: shuffled.slice(5, 10).map(p => p.name)
  };
}

// Matchni boshlash
function startMatch(matchId) {
  const match = activeMatches.get(matchId);
  if (match && match.status === 'waiting') {
    match.status = 'in_progress';
    match.started_at = new Date();
    
    console.log(`🚀 Match started: ${matchId}`);
    
    // Playerlarga match boshlanganini xabar berish
    match.players.forEach(player => {
      if (player.socket_id) {
        io.to(player.socket_id).emit('match_started', {
          match_id: matchId,
          server: match.server
        });
      }
    });
  }
}

// Matchni tugatish
function endMatch(matchId) {
  const match = activeMatches.get(matchId);
  if (match) {
    // Server player count ni yangilash
    const server = gameServers.get(match.server.id);
    if (server) {
      server.currentPlayers = Math.max(0, server.currentPlayers - match.players.length);
      gameServers.set(server.id, server);
    }
    
    activeMatches.delete(matchId);
    console.log(`🏁 Match ended: ${matchId}`);
  }
}

// Total players in matches hisoblash
function getTotalPlayersInMatches() {
  let total = 0;
  for (let match of activeMatches.values()) {
    total += match.players.length;
  }
  return total;
}

// Cleanup task - har 5 daqiqada ishga tushadi
nodeCron.schedule('*/5 * * * *', () => {
  const now = new Date();
  
  // 30 daqiqadan oldingi matchlarni o'chirish
  for (let [matchId, match] of activeMatches.entries()) {
    const matchAge = (now - match.created_at) / (1000 * 60); // daqiqalarda
    if (matchAge > 30) {
      endMatch(matchId);
    }
  }
  
  // 10 daqiqadan oldingi waiting playerlarni o'chirish
  for (let i = waitingPlayers.length - 1; i >= 0; i--) {
    const playerAge = (now - waitingPlayers[i].joined_at) / (1000 * 60);
    if (playerAge > 10) {
      console.log(`🧹 Removing stale player: ${waitingPlayers[i].name}`);
      waitingPlayers.splice(i, 1);
    }
  }
  
  console.log(`🧹 Cleanup completed. Active matches: ${activeMatches.size}, Waiting players: ${waitingPlayers.length}`);
});

// Server ishga tushganda
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Festa Matchmaking API running on port ${PORT}`);
  console.log(`🎮 Game Servers: ${gameServers.size}`);
  console.log(`👥 Waiting for players...`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});
