// PROBLEM: Hozirgi kod faqat simulate qiladi
// YECHIM: Haqiqiy server management qo'shish

const activeGameServers = new Map();

// Haqiqiy game serverlarni ro'yxatdan o'tkazish
app.post('/api/servers/register', (req, res) => {
    const { server_id, address, port, region, max_players, current_players } = req.body;
    
    const gameServer = {
        id: server_id,
        address: address,
        port: port,
        region: region,
        maxPlayers: max_players,
        currentPlayers: current_players,
        status: 'online',
        lastHeartbeat: Date.now(),
        matchId: null
    };
    
    gameServers.set(server_id, gameServer);
    console.log(`🎮 Game server registered: ${server_id} (${address}:${port})`);
    
    res.json({ status: 'success', message: 'Server registered' });
});

// Heartbeat system
app.post('/api/servers/heartbeat', (req, res) => {
    const { server_id, current_players, match_id } = req.body;
    
    const server = gameServers.get(server_id);
    if (server) {
        server.lastHeartbeat = Date.now();
        server.currentPlayers = current_players;
        server.matchId = match_id;
    }
    
    res.json({ status: 'success' });
});

// O'lik serverlarni tozalash
setInterval(() => {
    const now = Date.now();
    for (const [serverId, server] of gameServers) {
        if (now - server.lastHeartbeat > 30000) { // 30 soniya
            gameServers.delete(serverId);
            console.log(`🧹 Removed dead server: ${serverId}`);
        }
    }
}, 10000);
