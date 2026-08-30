const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.static(path.join(__dirname)));
app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); next(); });

const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'history.json');
const MAX_SESSIONS = 5000;

// ===== PERSISTENCE HELPERS =====
let lichSu = [];

function loadHistory() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      lichSu = JSON.parse(raw);
      console.log(`[💾] Đã tải ${lichSu.length} phiên từ history.json`);
    }
  } catch (e) {
    console.error('[⚠️] Không thể tải history.json:', e.message);
    lichSu = [];
  }
}

function saveHistory() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(lichSu, null, 2), 'utf8');
  } catch (e) {
    console.error('[⚠️] Lỗi lưu history.json:', e.message);
  }
}

loadHistory();

// ===== WEBSOCKET & DATA STORAGE =====
let currentSessionId = null;
let ws = null, pingInterval = null, reconnectTimeout = null, staleTimer = null;

const WS_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Origin": "https://play.sun.win"
};

const INIT_MSGS = [
  [1,"MiniGame","GM_apivopnha","WangLin",{"info":"{\"ipAddress\":\"14.249.227.107\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiI5ODE5YW5zc3MiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMjMyODExNTEsImFmZklkIjoic3VuLndpbiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzYzMDMyOTI4NzcwLCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjE0LjI0OS4yMjcuMTA3IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8wNS5wbmciLCJwbGF0Zm9ybUlkIjo0LCJ1c2VySWQiOiI4ODM4NTMzZS1kZTQzLTRiOGQtOTUwMy02MjFmNDA1MDUzNGUiLCJyZWdUaW1lIjoxNzYxNjMyMzAwNTc2LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IkdNX2FwaXZvcG5oYSJ9.guH6ztJSPXUL1cU8QdMz8O1Sdy_SbxjSM-CDzWPTr-0\",\"locale\":\"vi\",\"userId\":\"8838533e-de43-4b8d-9503-621f4050534e\",\"username\":\"GM_apivopnha\",\"timestamp\":1763032928770,\"refreshToken\":\"e576b43a64e84f789548bfc7c4c8d1e5.7d4244a361e345908af95ee2e8ab2895\"}","signature":"45EF4B318C883862C36E1B189A1DF5465EBB60CB602BA05FAD8FCBFCD6E0DA8CB3CE65333EDD79A2BB4ABFCE326ED5525C7D971D9DEDB5A17A72764287FFE6F62CBC2DF8A04CD8EFF8D0D5AE27046947ADE45E62E644111EFDE96A74FEC635A97861A425FF2B5732D74F41176703CA10CFEED67D0745FF15EAC1065E1C8BCBFA"}],
  [6,"MiniGame","taixiuPlugin",{cmd:1005}],
  [6,"MiniGame","lobbyPlugin",{cmd:10001}]
];

function connectWS() {
  if (ws) { ws.removeAllListeners(); try { ws.close(); } catch(e){} }
  ws = new WebSocket(WS_URL, { headers: WS_HEADERS });

  ws.on('open', () => {
    console.log('[✅] WebSocket connected');
    INIT_MSGS.forEach((msg, i) => setTimeout(() => { if (ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }, i*600));
    clearInterval(pingInterval);
    pingInterval = setInterval(() => { if (ws.readyState===WebSocket.OPEN) ws.ping(); }, 10000);
    clearTimeout(staleTimer);
    staleTimer = setTimeout(() => { console.log('[⚠️] Stale - reconnect'); ws.close(); }, 90000);
  });

  ws.on('pong', () => console.log('[📶] Ping OK'));

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || typeof data[1] !== 'object') return;
      const { cmd, sid, d1, d2, d3 } = data[1];

      // Initial history bulk load (cmd: 1005)
      if (cmd === 1005 && data[1].htr) {
        const newData = data[1].htr.map(p => {
          const t = p.d1 + p.d2 + p.d3;
          return { Phien: p.sid, Xuc_xac_1: p.d1, Xuc_xac_2: p.d2, Xuc_xac_3: p.d3, Tong: t, Ket_qua: t > 10 ? 'Tài' : 'Xỉu' };
        }).reverse();
        const existingPhiens = new Set(lichSu.map(x => x.Phien));
        const toAdd = newData.filter(x => !existingPhiens.has(x.Phien));
        if (toAdd.length > 0) {
          lichSu = [...lichSu, ...toAdd].sort((a,b) => b.Phien - a.Phien).slice(0, MAX_SESSIONS);
          saveHistory();
        }
        console.log(`[📋] Lịch sử tổng hợp: ${lichSu.length} phiên (tối đa ${MAX_SESSIONS})`);
      }

      // Session ID update (cmd: 1008)
      if (cmd === 1008 && sid) currentSessionId = sid;

      // Real-time result payout (cmd: 1003)
      if (cmd === 1003 && d1 && d2 && d3) {
        clearTimeout(staleTimer);
        staleTimer = setTimeout(() => ws.close(), 90000);
        const t = d1 + d2 + d3;
        const entry = { Phien: currentSessionId, Xuc_xac_1: d1, Xuc_xac_2: d2, Xuc_xac_3: d3, Tong: t, Ket_qua: t > 10 ? 'Tài' : 'Xỉu' };
        
        // Prevent duplicate
        if (!lichSu.some(x => x.Phien === entry.Phien)) {
          lichSu.unshift(entry);
          if (lichSu.length > MAX_SESSIONS) lichSu.pop();
          saveHistory();
        }
        console.log(`[🎲] Phiên #${currentSessionId}: ${d1}-${d2}-${d3} = ${t} (${entry.Ket_qua}) | Tổng: ${lichSu.length} phiên`);
        currentSessionId = null;
      }
    } catch(e) { console.error('[❌] WS parse error:', e.message); }
  });

  ws.on('close', (code) => {
    console.log(`[🔌] Closed: ${code}`);
    clearInterval(pingInterval); clearTimeout(staleTimer); clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connectWS, 2500);
  });

  ws.on('error', (e) => { console.error('[❌] WS error:', e.message); try { ws.close(); } catch(_){} });
}

// ===== API ENDPOINTS =====
app.get('/api/lichsu', (req, res) => res.json(lichSu));
app.get('/api/sunwin/history', (req, res) => res.json(lichSu));

app.get('/api/latest', (req, res) => {
  res.json({
    latestSession: lichSu[0] || null,
    totalSessions: lichSu.length,
    maxLimit: MAX_SESSIONS
  });
});

app.get('/', (req, res) => {
  res.json({
    service: '🎲 SunWin Realtime Data Fetcher',
    status: 'online',
    totalSessions: lichSu.length,
    maxLimit: MAX_SESSIONS,
    latestSession: lichSu[0] || null
  });
});

// ===== START SERVER =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎲 Data Fetcher API đang chạy tại http://0.0.0.0:${PORT}`);
  connectWS();
});
