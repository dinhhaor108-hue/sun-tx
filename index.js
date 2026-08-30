const WebSocket = require('ws');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== BỘ LƯU TRỮ DỮ LIỆU (TỐI ĐA 5000 PHIÊN) =====
const MAX_LIMIT = 5000;
let lichSu = [];
let currentSessionId = null;
let ws = null, pingInterval = null, reconnectTimeout = null;

const WS_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";

const WS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Origin": "https://play.sun.win"
};

const INIT_MSGS = [
  [1, "MiniGame", "GM_apivopnha", "WangLin", {
    "info": "{\"ipAddress\":\"14.249.227.107\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiI5ODE5YW5zc3MiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMjMyODExNTEsImFmZklkIjoic3VuLndpbiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzYzMDMyOTI4NzcwLCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjE0LjI0OS4yMjcuMTA3IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8wNS5wbmciLCJwbGF0Zm9ybUlkIjo4LCJ1c2VySWQiOiI4ODM4NTMzZS1kZTQzLTRiOGQtOTUwMy02MjFmNDA1MDUzNGUiLCJyZWdUaW1lIjoxNzYxNjMyMzAwNTc2LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IkdNX2FwaXZvcG5oYSJ9.guH6ztJSPXUL1cU8QdMz8O1Sdy_SbxjSM-CDzWPTr-0\",\"locale\":\"vi\",\"userId\":\"8838533e-de43-4b8d-9503-621f4050534e\",\"username\":\"GM_apivopnha\",\"timestamp\":1763032928770,\"refreshToken\":\"e576b43a64e84f789548bfc7c4c8d1e5.7d4244a361e345908af95ee2e8ab2895\"}",
    "signature": "45EF4B318C883862C36E1B189A1DF5465EBB60CB602BA05FAD8FCBFCD6E0DA8CB3CE65333EDD79A2BB4ABFCE326ED5525C7D971D9DEDB5A17A72764287FFE6F62CBC2DF8A04CD8EFF8D0D5AE27046947ADE45E62E644111EFDE96A74FEC635A97861A425FF2B5732D74F41176703CA10CFEED67D0745FF15EAC1065E1C8BCBFA"
  }],
  [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
  [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

function connectWS() {
  if (ws) {
    ws.removeAllListeners();
    try { ws.close(); } catch (e) {}
  }

  ws = new WebSocket(WS_URL, { headers: WS_HEADERS });

  ws.on('open', () => {
    console.log('[✅] WebSocket đã kết nối tới Server Sunwin!');
    
    INIT_MSGS.forEach((msg, i) => {
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      }, i * 600);
    });

    clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 10000);
  });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || typeof data[1] !== 'object') return;
      
      const payload = data[1];
      const cmd = payload.cmd;
      const timeStr = new Date().toLocaleTimeString('vi-VN');

      // 1. NẠP LỊCH SỬ BAN ĐẦU (cmd: 1005)
      if (cmd === 1005 && payload.htr) {
        const newData = payload.htr.map(p => {
          const t = p.d1 + p.d2 + p.d3;
          return {
            Phien: p.sid,
            d1: p.d1, d2: p.d2, d3: p.d3,
            Tong: t,
            KetQua: t > 10 ? 'Tài' : 'Xỉu',
            ThoiGian: timeStr
          };
        }).reverse();

        const existingPhiens = new Set(lichSu.map(x => x.Phien));
        const toAdd = newData.filter(x => !existingPhiens.has(x.Phien));

        if (toAdd.length > 0) {
          lichSu = [...toAdd, ...lichSu].sort((a, b) => b.Phien - a.Phien).slice(0, MAX_LIMIT);
        }
        console.log(`[📋] Đã nạp thành công ${lichSu.length} phiên lịch sử!`);
      }

      // 2. MÃ PHIÊN HIỆN TẠI (cmd: 1008)
      if (cmd === 1008 && payload.sid) {
        currentSessionId = payload.sid;
      }

      // 3. KẾT QUẢ PHIÊN MỚI NỔ (cmd: 1003)
      if (cmd === 1003 && payload.d1 && payload.d2 && payload.d3) {
        const t = payload.d1 + payload.d2 + payload.d3;
        const res = t > 10 ? 'Tài' : 'Xỉu';
        const session = currentSessionId || payload.sid;

        const entry = {
          Phien: session,
          d1: payload.d1, d2: payload.d2, d3: payload.d3,
          Tong: t,
          KetQua: res,
          ThoiGian: timeStr
        };

        lichSu.unshift(entry);
        if (lichSu.length > MAX_LIMIT) lichSu.pop();

        console.log(`[🎲] Phiên #${session}: ${payload.d1}-${payload.d2}-${payload.d3} = ${t} (${res})`);
        currentSessionId = null;
      }
    } catch (e) {}
  });

  ws.on('close', (code) => {
    console.log(`[🔌] Kết nối bị đóng (${code}). Thử lại sau 3 giây...`);
    clearInterval(pingInterval);
    clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connectWS, 3000);
  });

  ws.on('error', () => {
    try { ws.close(); } catch (_) {}
  });
}

// ===== REST API =====
app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || MAX_LIMIT;
  res.json(lichSu.slice(0, limit));
});

// ===== GIAO DIỆN WEB DASHBOARD CHUẨN ĐỄ NHÌN =====
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thu Thập Kết Quả Tài Xỉu Sunwin</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background-color: #0d1117; color: #c9d1d9; padding: 20px; text-align: center; }
        .container { max-width: 950px; margin: 0 auto; }
        h1 { color: #58a6ff; margin-bottom: 8px; font-size: 26px; font-weight: 700; }
        .subtitle { color: #8b949e; font-size: 14px; margin-bottom: 20px; }
        
        .stats-bar { display: flex; justify-content: space-around; background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 15px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        .stat-item { text-align: center; }
        .stat-val { font-size: 22px; font-weight: bold; margin-top: 4px; }
        .val-total { color: #58a6ff; }
        .val-tai { color: #ff7b72; }
        .val-xiu { color: #79c0ff; }

        .search-box { width: 100%; padding: 10px 15px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; color: #c9d1d9; font-size: 14px; margin-bottom: 15px; outline: none; }
        .search-box:focus { border-color: #58a6ff; }

        .table-container { background: #161b22; border: 1px solid #30363d; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.4); }
        table { width: 100%; border-collapse: collapse; text-align: center; }
        th, td { padding: 12px 15px; border-bottom: 1px solid #21262d; font-size: 14px; }
        th { background-color: #21262d; color: #8b949e; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
        tr:hover { background-color: #1f242c; }
        
        .badge-tai { background: rgba(255, 123, 114, 0.15); color: #ff7b72; border: 1px solid rgba(255, 123, 114, 0.4); padding: 4px 14px; border-radius: 20px; font-weight: bold; font-size: 13px; display: inline-block; }
        .badge-xiu { background: rgba(121, 192, 255, 0.15); color: #79c0ff; border: 1px solid rgba(121, 192, 255, 0.4); padding: 4px 14px; border-radius: 20px; font-weight: bold; font-size: 13px; display: inline-block; }
        .dice { background: #21262d; border: 1px solid #30363d; color: #f0f6fc; padding: 3px 8px; border-radius: 6px; margin: 0 2px; font-weight: 600; font-size: 13px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎲 THU THẬP KẾT QUẢ TÀI XỈU SUNWIN</h1>
        <p class="subtitle">Hệ thống thu thập dữ liệu tự động 24/7 | Giới hạn tối đa 5,000 phiên</p>

        <div class="stats-bar">
            <div class="stat-item">
                <div>TỔNG PHIÊN LƯU KHỎI</div>
                <div class="stat-val val-total" id="totalCount">0 / 5,000</div>
            </div>
            <div class="stat-item">
                <div>TỔNG PHIÊN TÀI</div>
                <div class="stat-val val-tai" id="taiCount">0</div>
            </div>
            <div class="stat-item">
                <div>TỔNG PHIÊN XỈU</div>
                <div class="stat-val val-xiu" id="xiuCount">0</div>
            </div>
        </div>

        <input type="text" id="searchInput" class="search-box" placeholder="🔍 Tìm kiếm theo Mã phiên (VD: 3232200) hoặc gõ Tài / Xỉu..." onkeyup="filterTable()">

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>MÃ PHIÊN</th>
                        <th>XÚC XẮC (D1 - D2 - D3)</th>
                        <th>TỔNG ĐIỂM</th>
                        <th>KẾT QUẢ</th>
                        <th>THỜI GIAN</th>
                    </tr>
                </thead>
                <tbody id="tableBody">
                    <tr><td colspan="5" style="padding: 30px; color: #8b949e;">Đang kết nối Server và nạp dữ liệu...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        let allData = [];

        async function fetchHistory() {
            try {
                const res = await fetch('/api/history?limit=5000');
                allData = await res.json();
                
                let tai = 0, xiu = 0;
                allData.forEach(item => {
                    if (item.KetQua === 'Tài') tai++;
                    else if (item.KetQua === 'Xỉu') xiu++;
                });

                document.getElementById('totalCount').innerText = `${allData.length.toLocaleString()} / 5,000`;
                document.getElementById('taiCount').innerText = `${tai.toLocaleString()} (${allData.length ? ((tai/allData.length)*100).toFixed(1) : 0}%)`;
                document.getElementById('xiuCount').innerText = `${xiu.toLocaleString()} (${allData.length ? ((xiu/allData.length)*100).toFixed(1) : 0}%)`;

                renderTable(allData);
            } catch (e) {}
        }

        function renderTable(data) {
            if (!data || data.length === 0) {
                document.getElementById('tableBody').innerHTML = '<tr><td colspan="5" style="padding: 30px;">Chưa có dữ liệu phiên.</td></tr>';
                return;
            }

            let html = '';
            data.forEach(item => {
                const isTai = item.KetQua === 'Tài';
                const badgeClass = isTai ? 'badge-tai' : 'badge-xiu';
                html += \`
                    <tr>
                        <td><strong>#\${item.Phien}</strong></td>
                        <td>
                            <span class="dice">\${item.d1}</span>
                            <span class="dice">\${item.d2}</span>
                            <span class="dice">\${item.d3}</span>
                        </td>
                        <td><strong>\${item.Tong}</strong></td>
                        <td><span class="\${badgeClass}">\${item.KetQua.toUpperCase()}</span></td>
                        <td style="color: #8b949e; font-size: 13px;">\${item.ThoiGian || '---'}</td>
                    </tr>
                \`;
            });
            document.getElementById('tableBody').innerHTML = html;
        }

        function filterTable() {
            const query = document.getElementById('searchInput').value.toLowerCase().trim();
            if (!query) {
                renderTable(allData);
                return;
            }

            const filtered = allData.filter(item => 
                item.Phien.toString().includes(query) ||
                item.KetQua.toLowerCase().includes(query) ||
                item.Tong.toString() === query
            );
            renderTable(filtered);
        }

        fetchHistory();
        setInterval(fetchHistory, 5000); // Tự động làm mới mỗi 5 giây
    </script>
</body>
</html>
  `);
});

// ===== KHỞI CHẠY APP & WEBSOCKET =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[🚀] Node.js Server đang chạy tại cổng ${PORT}`);
  connectWS();
});
