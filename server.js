/* ============================================================
   裂隙棋盘 局域网联机服务器 — v9
   新增：账号密码系统、防爆破、谷歌表格账号维度记录、后台看板统计
   ============================================================ */

const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const { google } = require('googleapis');
const UAParser = require('ua-parser-js');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json()); // 用于解析登录请求

// ================= 环境变量与全局配置 =================
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';
const ACCESS_COOKIE = 'rift_user'; // Cookie 存储账号名

// ★ 账号密码配置表（你可以随时在这里增删改，推送到 GitHub 即可生效）
const ACCOUNTS = {
  '100101': 'Vxt728!q', '100102': 'Hnb394#w', '100103': 'Mjk561@e', '100104': 'Pqz845$r', '100105': 'Fgh219%t',
  '100106': 'Wsr673&y', '100107': 'Klm482*u', '100108': 'Cvx931!i', '100109': 'Bnm547@o', '100110': 'Ztr618#p',
  '100111': 'Yui295$a', '100112': 'Hjk374%s', '100113': 'Mlo583&d', '100114': 'Poi642*f', '100115': 'Lkj819!g',
  '100116': 'Tyu457@h', '100117': 'Rty726#j', '100118': 'Ewr839$k', '100119': 'Qwe164%l', '100120': 'Asd275&z',
  '100121': 'Zxc386*x', '100122': 'Cvb497!c', '100123': 'Vbn518@v', '100124': 'Bnm629#b', '100125': 'Nji739$n',
  '100126': 'Mki841%m', '100127': 'Lok952&k', '100128': 'Plo163*f', '100129': 'Kij274!d', '100130': 'Uhy385@s',
  '100131': 'Ytr496#a', '100132': 'Tew517$p', '100133': 'Qas628%o', '100134': 'Wdx739&i', '100135': 'Ecv841*u',
  '100136': 'Rfv952!y', '100137': 'Tgb163@t', '100138': 'Yhn274#r', '100139': 'Ujm385$e', '100140': 'Ikl496%w',
  '100141': 'Opl517&q', '100142': 'Poi628*a', '100143': 'Kju739!s', '100144': 'Mhy841@d', '100145': 'Ntf952#f',
  '100146': 'Bgr163$g', '100147': 'Vde274%h', '100148': 'Cws385&j', '100149': 'Xaz496*k', '100150': 'Zqw517!l',
  '100151': 'Ert628@z', '100152': 'Rty739#x', '100153': 'Tui841$c', '100154': 'Iop952%v', '100155': 'Oas163&b',
  '100156': 'Pdf274*n', '100157': 'Jkl385!m', '100158': 'Hnm496@q', '100159': 'Gty517#w', '100160': 'Fgh628$e',
  '100161': 'Dsb739%r', '100162': 'Saf841&t', '100163': 'Agh952*y', '100164': 'Ygb163!u', '100165': 'Tgh274@i',
  '100166': 'Rgf385#o', '100167': 'Edf496$p', '100167': 'Edf496$p', '100168': 'Wsf517%a', '100169': 'Qdv628&s',
  '100170': 'Zcv739*d', '100171': 'Xbv841!f', '100172': 'Cnv952@g', '100173': 'Vmv163#h', '100174': 'Bmv274$j',
  '100175': 'Ncm385%k', '100176': 'Mcv496&l', '100177': 'Lcw517*z', '100178': 'Pcw628!x', '100179': 'Kcv739@c',
  '100180': 'Ucv841#v', '100181': 'Ycb952$b', '100182': 'Tvb163%n', '100183': 'Qvb274&m', '100184': 'Wbn385*q',
  '100185': 'Ebn496!w', '100186': 'Rnm517@e', '100187': 'Tnm628#r', '100188': 'Ymn739$t', '100189': 'Umn841%y',
  '100190': 'Imn952&u', '100191': 'Omn163*i', '100192': 'Pmn274!o', '100193': 'Kmb385@p', '100194': 'Mvn496#a',
  '100195': 'Nvb517$s', '100196': 'Bvb628%d', '100197': 'Vvb739&f', '100198': 'Cvb841*g', '100199': 'Xvb952!h',
  '100200': 'Zvb163@j'
};

const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

// 辅助提取账号
function getAccountFromReq(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)rift_user=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '游客';
}
function getAccountFromSocket(socket) {
  const cookie = socket.handshake.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)rift_user=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '游客';
}

// ================= 谷歌表格初始化 =================
let sheetsClient = null;
if (GOOGLE_SERVICE_ACCOUNT_KEY && GOOGLE_SHEET_ID) {
  try {
    let rawKey = GOOGLE_SERVICE_ACCOUNT_KEY.trim();
    rawKey = rawKey.replace(/\r/g, '');
    
    // 修复 private_key 里的真实换行
    rawKey = rawKey.replace(/"private_key"\s*:\s*"([\s\S]*?)"/g, (match, p1) => {
      const cleanedKey = p1.replace(/\n/g, '\\n').replace(/\t/g, '');
      return `"private_key": "${cleanedKey}"`;
    });

    rawKey = rawKey.replace(/\n/g, ' '); 

    const keyJson = JSON.parse(rawKey);
    const auth = new google.auth.GoogleAuth({
      credentials: keyJson,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('[系统] 谷歌表格写入已启用');
  } catch (e) {
    console.error('[系统] 谷歌表格初始化失败，请检查环境变量:', e.message);
    console.error('[系统] 出错片段预览:', GOOGLE_SERVICE_ACCOUNT_KEY.substring(150, 200));
  }
}

// ================= 访客记录系统 =================
const visits = [];
const VISITS_MAX = 500;

function getClientIpReq(req) {
  const ipStr = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  return ipStr.split(',')[0].trim();
}
function getClientIpSocket(socket) {
  const ipStr = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || '';
  return ipStr.split(',')[0].trim();
}
function maskIp(ip) {
  if (!ip) return '';
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts[0] + ':' + parts[1] + ':*';
  }
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return ip;
}
function getDeviceInfo(uaStr) {
  if (!uaStr) return '未知设备';
  const parser = new UAParser(uaStr);
  const res = parser.getResult();
  let device = res.device.type === 'mobile' ? '手机' : res.device.type === 'tablet' ? '平板' : '电脑';
  if (uaStr.includes('MicroMessenger')) device = '微信';
  return `${device}-${res.browser.name || '未知浏览器'}`;
}

async function recordVisit(type, ip, name, room, ua, account = '') {
  const masked = maskIp(ip);
  const device = getDeviceInfo(ua);
  let location = '未知';

  if (masked && !masked.startsWith('127.') && !masked.startsWith('192.168.') && masked !== '::1') {
    try {
      const res = await axios.get(`http://ip-api.com/json/${ip}?lang=zh-CN`, { timeout: 2000 });
      if (res.data && res.data.status === 'success') {
        location = res.data.city || res.data.regionName || res.data.country || '未知';
      }
    } catch (e) {}
  }

  const record = { t: Date.now(), type, ip: masked, location, device, name: name || '-', room: room || '-', account: account || '游客' };
  
  // 存内存
  visits.push(record);
  if (visits.length > VISITS_MAX) visits.shift();

  // 存谷歌表格 (多加了一列 account)
  if (sheetsClient && GOOGLE_SHEET_ID) {
    const timeStr = new Date(record.t).toLocaleString('zh-CN', { hour12: false });
    sheetsClient.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[timeStr, type, record.account, record.name, record.location, record.ip, record.device, record.room]] }
    }).catch(err => console.error('[Google Sheets] 写入失败:', err.message));
  }
}

// ================= 页面路由与安全校验 =================
const LOGIN_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0"><title>裂隙棋盘 · 进入</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f0f4f8;font-family:system-ui;padding:20px}
.card{background:#fff;border-radius:14px;padding:28px 26px;max-width:360px;width:100%;box-shadow:0 6px 24px rgba(0,0,0,.08);text-align:center}
h1{margin:0 0 6px;font-size:24px;color:#0f172a}.sub{color:#64748b;font-size:13px;margin-bottom:20px}
input{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:16px;text-align:center;outline:none;box-sizing:border-box;margin-bottom:10px}
input:focus{border-color:#3b82f6}button{margin-top:12px;width:100%;padding:12px;background:#3b82f6;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#2563eb}button:disabled{background:#94a3b8;cursor:not-allowed}.msg{margin-top:12px;font-size:13px;color:#dc2626;min-height:18px}</style></head><body>
<div class="card"><h1>裂隙棋盘</h1><div class="sub">请输入专属账号密码</div>
<input id="user" type="text" placeholder="账号" autocomplete="off">
<input id="pwd" type="password" placeholder="密码" autocomplete="off">
<button id="btn">进入游戏</button><div class="msg" id="msg"></div></div>
<script>const user=document.getElementById('user'),pwd=document.getElementById('pwd'),btn=document.getElementById('btn'),msg=document.getElementById('msg');
async function submit(){const u=user.value.trim(),p=pwd.value.trim();if(!u||!p){msg.textContent='请填写账号和密码';return;}btn.disabled=true;msg.textContent='';
try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:u,password:p})});
if(r.ok){location.href='/';}else{const d=await r.json();msg.textContent=d.error||'账号或密码错误';btn.disabled=false;}}catch(e){msg.textContent='网络错误，请重试';btn.disabled=false;}}
btn.onclick=submit;pwd.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});</script></body></html>`;

const ADMIN_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0"><title>裂隙棋盘 · 后台</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;margin:0;padding:20px;color:#1e293b}
  h1{margin:0 0 8px;font-size:22px;color:#0f172a}.sub{color:#64748b;font-size:13px;margin-bottom:16px}
  .dashboard{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
  .stat-card{background:#fff;border-radius:12px;padding:16px 20px;flex:1;min-width:120px;box-shadow:0 4px 12px rgba(0,0,0,0.03);border:1px solid #e2e8f0}
  .stat-card .label{font-size:12px;color:#64748b;font-weight:600;margin-bottom:6px}
  .stat-card .value{font-size:28px;font-weight:800;color:#3b82f6}
  .grid-layout{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
  .table-wrap{flex:2;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);border:1px solid #e2e8f0;min-width:400px}
  table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}
  th,td{padding:10px 14px;border-bottom:1px solid #f1f5f9}
  th{background:#f8fafc;color:#475569;font-weight:600;position:sticky;top:0}
  tr:hover td{background:#f8fafc}
  .tag{display:inline-block;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600}
  .t-visit{background:#dbeafe;color:#1e40af}.t-connect{background:#dcfce7;color:#166534}.t-join{background:#fef3c7;color:#92400e}.t-leave{background:#fee2e2;color:#991b1b}.t-create{background:#ede9fe;color:#6d28d9}
  .player-wrap{flex:1;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);border:1px solid #e2e8f0;min-width:250px}
</style></head><body>

<h1>裂隙棋盘 · 账号运营大盘</h1>
<div class="sub">每 3 秒自动刷新 · 当前显示最近 <span id="cnt">0</span> 条流水</div>

<div class="dashboard">
  <div class="stat-card"><div class="label">去重活跃账号</div><div class="value" id="stat-accounts">0</div></div>
  <div class="stat-card"><div class="label">总开局次数</div><div class="value" id="stat-games">0</div></div>
  <div class="stat-card"><div class="label">总请求次数</div><div class="value" id="stat-visits">0</div></div>
</div>

<div class="grid-layout">
  <div class="table-wrap">
    <table><thead><tr><th>时间</th><th>事件</th><th>账号</th><th>游戏内昵称</th><th>城市</th><th>设备</th><th>IP段</th><th>房间</th></tr></thead><tbody id="tb"></tbody></table>
  </div>
  <div class="player-wrap">
    <table><thead><tr><th>登录账号</th><th>上线次数</th><th>参与局数</th></tr></thead><tbody id="ptb"></tbody></table>
  </div>
</div>

<script>
const token = new URLSearchParams(location.search).get('token') || '';
const names = {visit:'打开网页',connect:'建立连接',join:'加入房间',leave:'离开房间',create:'创建房间'};
const cls = {visit:'t-visit',connect:'t-connect',join:'t-join',leave:'t-leave',create:'t-create'};
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmt(t){const d=new Date(t);return d.toLocaleString('zh-CN',{hour12:false});}

async function tick(){
  try{
    const r = await fetch('/admin/data?token='+encodeURIComponent(token));
    if(!r.ok){document.getElementById('tb').innerHTML='<tr><td colspan="8" style="color:#dc2626">密码错误或无权限</td></tr>';return;}
    const list = await r.json();
    
    document.getElementById('cnt').textContent = list.length;
    document.getElementById('tb').innerHTML = list.map(v=>
      '<tr><td>'+fmt(v.t)+'</td><td><span class="tag '+cls[v.type]+'">'+(names[v.type]||v.type)+'</span></td>'
      +'<td style="font-weight:600;color:#4f46e5">'+esc(v.account||'-')+'</td>'
      +'<td>'+esc(v.name)+'</td><td>'+esc(v.location)+'</td><td>'+esc(v.device)+'</td><td>'+esc(v.ip)+'</td><td>'+esc(v.room)+'</td></tr>'
    ).join('') || '<tr><td colspan="8" style="color:#94a3b8">暂无记录</td></tr>';

    let totalGames = 0, totalVisits = list.length, accMap = new Map(), uniqueAccs = new Set();
    list.forEach(v => {
      if(v.type === 'create') totalGames++;
      if(v.account && v.account !== '-' && v.account !== '游客') {
        uniqueAccs.add(v.account);
        if(!accMap.has(v.account)) accMap.set(v.account, { connections: 0, games: 0 });
        const p = accMap.get(v.account);
        if(v.type === 'connect') p.connections++;
        if(v.type === 'create' || v.type === 'join') p.games++;
      }
    });
    document.getElementById('stat-accounts').textContent = uniqueAccs.size;
    document.getElementById('stat-games').textContent = totalGames;
    document.getElementById('stat-visits').textContent = totalVisits;

    const arr = Array.from(accMap.entries()).map(([account, data]) => ({ account, ...data })).sort((a,b) => b.games - a.games);
    document.getElementById('ptb').innerHTML = arr.map(p => 
      '<tr><td style="font-weight:600;color:#4f46e5">'+esc(p.account)+'</td><td>'+p.connections+' 次</td><td><span style="font-weight:700;color:#d97706">'+p.games+'</span> 次</td></tr>'
    ).join('') || '<tr><td colspan="3" style="color:#94a3b8">暂无玩家数据</td></tr>';
  }catch(e){}
}
tick();setInterval(tick,3000);
</script></body></html>`;

app.get('/login', (req, res) => res.send(LOGIN_HTML));

// 记录尝试次数：{ IP: { count: 失败次数, lastAttempt: 最后尝试时间 } }
const loginAttempts = new Map();

app.post('/api/login', (req, res) => {
  const ip = getClientIpReq(req);
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };

  // 如果距离上次尝试超过 1 分钟，重置计数
  if (now - record.lastAttempt > 60000) {
    record.count = 0;
  }

  // 如果失败次数超过 5 次，直接拒绝
  if (record.count >= 5) {
    return res.status(429).json({ ok: false, error: '密码错误次数过多，请 1 分钟后再试' });
  }

  const u = req.body.user;
  const p = req.body.password;

  // 校验账号和密码
  if (!u || !p || ACCOUNTS[u] !== p) {
    record.count += 1;
    record.lastAttempt = now;
    loginAttempts.set(ip, record);
    return res.status(401).json({ ok: false, error: '账号或密码错误' });
  }

  // 登录成功，清空失败记录，种下包含账号名的 Cookie
  loginAttempts.delete(ip);
  res.setHeader('Set-Cookie', `${ACCESS_COOKIE}=${encodeURIComponent(u)}; Path=/; Max-Age=2592000; SameSite=Lax`);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).send('无权限');
  res.send(ADMIN_HTML);
});
app.get('/admin/data', (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });
  res.json(visits.slice().reverse());
});

// 网页请求拦截
app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/api/login') return next();
  const account = getAccountFromReq(req);
  if (ACCOUNTS[account]) return next(); // 账号在名单里，放行
  
  if (req.path === '/') {
    recordVisit('visit', getClientIpReq(req), '', '', req.headers['user-agent'], '未登录');
    res.redirect('/login');
  } else {
    res.status(401).send('unauthorized');
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Socket 连接拦截
io.use((socket, next) => {
  const account = getAccountFromSocket(socket);
  if (ACCOUNTS[account]) return next();
  next(new Error('unauthorized'));
});


// ================= 游戏核心配置 =================
const CONFIG = {
  SIZE: 16, MAX_PLAYERS: 8, HP: 3, ACTION_CD: 3000,
  OBSTACLE_RATE: 0.15, RESOURCE_RATE: 0.06, TRANSPORT_RATE: 0.03,
  ITEM_CAP: 3, COLLAPSE_DELAY: 30000, COLLAPSE_INTERVAL: 2000, COLLAPSE_WARN: 1000,
  DANGER_DMG: 10000, ROADBLOCK_DURATION: 15000, RESOURCE_SUPPLY_INTERVAL: 30000,
  RESOURCE_SUPPLY_RANGE: 3, RIFT_COUNT: 3, RIFT_WAIT: 15000, RIFT_COOLDOWN: 30000,
  RIFT_BCAST: 7, SMALL_SIZE: 7, SMALL_CD: 3000, SMALL_DURATION: 60000,
  SMALL_SCORE_WIN: 10, SMALL_ITEM_CAP: 2, SMALL_OBSERVE: 6000, FATIGUE_EXTRA: 1000,
  FINAL_PHASE_STANDABLE: 4, MAX_LOGS: 50, VIEW: 2, VIEW_BUFF: 3,
  SCAN_RADIUS: 5, SCAN_DURATION: 10000, DECOY_RADIUS: 7, DECOY_DURATION: 5000,
  VISION_BUFF_DURATION: 120000, AI_TICK: 250, DISORIENT_DURATION: 15000
};

const TILE = { NORMAL: 0, OBSTACLE: 1, RESOURCE: 2, TRANSPORT: 3, DANGER: 4, RUIN: 5, RIFT: 6 };
const COLORS = ['#2563eb', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#4f46e5', '#9333ea'];
const AI_COLORS = ['#0ea5e9', '#f43f5e', '#fb923c', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7'];
const NAMES = ['蓝', '红', '橙', '黄', '绿', '青', '靛', '紫'];

const ITEM_IDS = ['item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'item_6', 'item_7', 'item_8'];
const ITEM_SELECT_TARGET = ['item_0', 'item_1', 'item_4'];
const SMALL_ITEM_TYPES = ['push', 'block', 'trap', 'steal', 'swap'];

const BLESSINGS = [
  { id: 'swift', name: '疾风祝福', desc: '立即获得1个随机信物（信物栏满则给普通道具）' },
  { id: 'vision', name: '视野祝福', desc: '视野提升到≤3持续120秒' },
  { id: 'shield', name: '双护盾祝福', desc: '获得2层护盾' },
  { id: 'harvest', name: '资源丰收祝福', desc: '下次资源拾取额外+1道具' },
  { id: 'rift', name: '裂隙主宰祝福', desc: '下次裂隙等待减半，小棋盘开局+2分' },
  { id: 'purify', name: '净化祝福', desc: '驱散疲惫、失控，行动冷却清零' },
  { id: 'dash', name: '疾行祝福', desc: '获得2个疾行符' },
  { id: 'heal', name: '生命复苏祝福', desc: '恢复1点生命并获得1层护盾' }
];

const rooms = new Map();

function genRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let t = 0; t < 100; t++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(code)) return code;
  }
  return null;
}
function ring(x, y, s) { return Math.min(x, y, s - 1 - x, s - 1 - y); }
function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dirOf(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? '东' : '西';
  return dy > 0 ? '南' : '北';
}
function ts() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
}
function addLog(room, text) {
  if (!room || !text) return;
  room.logs.push('[' + ts() + '] ' + text);
  if (room.logs.length > CONFIG.MAX_LOGS) room.logs.shift();
}

/* ---------- 房间列表 ---------- */
function getRoomList() {
  const list = [];
  for (const room of rooms.values()) {
    if (room.locked || room.gameOver) continue;
    const humans = [...room.players.values()].filter(p => !p.isAI).length;
    if (humans === 0) continue;
    const ai = [...room.players.values()].filter(p => p.isAI).length;
    const total = room.players.size;
    if (total >= CONFIG.MAX_PLAYERS) continue;
    list.push({ code: room.code, mode: room.mode, humans, ai, total, max: CONFIG.MAX_PLAYERS, createdAt: room.createdAt });
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  return list;
}
function broadcastRoomList() { io.emit('rooms_list', getRoomList()); }

/* ---------- 视野 ---------- */
function hasLOS(room, x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (true) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && room.tiles[y][x] === TILE.OBSTACLE) return false;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function computeVisibility(room, player) {
  if (!player || !player.alive) { if (player) player.visible = new Set(); return; }
  const now = Date.now();
  player.visible = new Set();
  let r = CONFIG.VIEW;
  if (player.visionBuffUntil && player.visionBuffUntil > now) r = CONFIG.VIEW_BUFF;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const tx = player.x + dx, ty = player.y + dy;
      if (tx < 0 || ty < 0 || tx >= CONFIG.SIZE || ty >= CONFIG.SIZE) continue;
      if (hasLOS(room, player.x, player.y, tx, ty)) player.visible.add(tx + ',' + ty);
    }
  }
  if (player.scanUntil && player.scanUntil > now) {
    const sr = CONFIG.SCAN_RADIUS;
    for (let dy = -sr; dy <= sr; dy++) {
      for (let dx = -sr; dx <= sr; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > sr) continue;
        const tx = player.x + dx, ty = player.y + dy;
        if (tx < 0 || ty < 0 || tx >= CONFIG.SIZE || ty >= CONFIG.SIZE) continue;
        player.visible.add(tx + ',' + ty);
      }
    }
  }
  for (const k of player.visible) {
    const parts = k.split(',');
    player.tileMemory[k] = room.tiles[+parts[1]][+parts[0]];
  }
}

/* ---------- 房间与基础逻辑 ---------- */
function createRoom(mode) {
  const code = genRoomCode();
  if (!code) return null;
  const tiles = [];
  for (let y = 0; y < CONFIG.SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < CONFIG.SIZE; x++) tiles[y][x] = Math.random() < CONFIG.OBSTACLE_RATE ? TILE.OBSTACLE : TILE.NORMAL;
  }
  for (let y = 0; y < CONFIG.SIZE; y++) for (let x = 0; x < CONFIG.SIZE; x++) if (tiles[y][x] === TILE.NORMAL && Math.random() < CONFIG.RESOURCE_RATE) tiles[y][x] = TILE.RESOURCE;
  for (let y = 0; y < CONFIG.SIZE; y++) for (let x = 0; x < CONFIG.SIZE; x++) if (tiles[y][x] === TILE.NORMAL && Math.random() < CONFIG.TRANSPORT_RATE) tiles[y][x] = TILE.TRANSPORT;
  const room = {
    code, mode: mode === 'FOG' ? 'FOG' : 'CLASSIC', players: new Map(), tiles, roadblocks: [], rifts: [], small: null, logs: [],
    locked: false, playerCounter: 0, aiCounter: 0, peakPlayers: 0, createdAt: Date.now(), lastResourceSupply: Date.now(),
    gameOver: false, winnerId: null, finalPhaseTriggered: false, pendingFinalPhase: false, rankings: null, aiFilled: false,
    collapse: { started: false, done: false, ring: 0, cells: [], warnCell: null, warnUntil: 0, nextAt: 0 }
  };
  initRifts(room);
  rooms.set(code, room);
  console.log(`[${code}] 房间创建（${room.mode}）`);
  return room;
}

function isWalkable(room, x, y, ignorePlayerId) {
  if (x < 0 || y < 0 || x >= CONFIG.SIZE || y >= CONFIG.SIZE) return false;
  const t = room.tiles[y][x];
  if (t === TILE.OBSTACLE || t === TILE.RUIN) return false;
  if (room.roadblocks.some(r => r.x === x && r.y === y && r.until > Date.now())) return false;
  if (t === TILE.RIFT) return true;
  for (const p of room.players.values()) if (p.id !== ignorePlayerId && p.alive && p.x === x && p.y === y) return false;
  return true;
}
function isValidRoadblockTarget(room, x, y) {
  if (x < 0 || y < 0 || x >= CONFIG.SIZE || y >= CONFIG.SIZE) return false;
  const t = room.tiles[y][x];
  if (t === TILE.OBSTACLE || t === TILE.RUIN || t === TILE.RIFT) return false;
  if (room.roadblocks.some(r => r.x === x && r.y === y && r.until > Date.now())) return false;
  for (const p of room.players.values()) if (p.alive && p.x === x && p.y === y) return false;
  return true;
}
function findSpawn(room) {
  const existing = Array.from(room.players.values());
  for (let t = 0; t < 500; t++) {
    const x = Math.floor(Math.random() * CONFIG.SIZE), y = Math.floor(Math.random() * CONFIG.SIZE);
    const r = ring(x, y, CONFIG.SIZE);
    if (r < 1 || r > 3 || room.tiles[y][x] !== TILE.NORMAL) continue;
    if (existing.some(p => p.x === x && p.y === y)) continue;
    if (existing.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < 2)) continue;
    return { x, y };
  }
  return { x: 7, y: 7 };
}
function findSafeCell(room) {
  for (let r = 0; r < CONFIG.SIZE; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        const x = Math.floor(CONFIG.SIZE / 2) + dx, y = Math.floor(CONFIG.SIZE / 2) + dy;
        if (x < 0 || y < 0 || x >= CONFIG.SIZE || y >= CONFIG.SIZE) continue;
        const t = room.tiles[y][x];
        if (t === TILE.NORMAL || t === TILE.RESOURCE || t === TILE.RIFT) return { x, y };
      }
    }
  }
  return null;
}

function applyTileEffectOnMove(room, player, now) {
  const t = room.tiles[player.y][player.x];
  if (t === TILE.RESOURCE) {
    const bonus = player.harvestBuff ? 1 : 0;
    const cap = CONFIG.ITEM_CAP + bonus;
    let added = 0;
    while (added < 1 + bonus && player.items.length < cap) { player.items.push(pick(ITEM_IDS)); added++; }
    if (added > 0) {
      room.tiles[player.y][player.x] = TILE.NORMAL;
      player.stats.pickups = (player.stats.pickups || 0) + added;
      addLog(room, player.name + ' 拾取 ' + added + ' 个道具');
    }
    if (bonus > 0 && added > 0) player.harvestBuff = false;
  } else if (t === TILE.RIFT) {
    tryEnterRift(room, player);
  } else if (t === TILE.TRANSPORT) {
    for (let i = 0; i < 50; i++) {
      const tx = Math.floor(Math.random() * CONFIG.SIZE), ty = Math.floor(Math.random() * CONFIG.SIZE);
      if (room.tiles[ty][tx] === TILE.NORMAL && isWalkable(room, tx, ty, player.id)) {
        player.x = tx; player.y = ty; addLog(room, player.name + ' 触发传送'); break;
      }
    }
  }
}

/* ---------- 裂隙 ---------- */
function initRifts(room) {
  room.rifts = [];
  for (let i = 0; i < CONFIG.RIFT_COUNT; i++) {
    for (let t = 0; t < 200; t++) {
      const x = Math.floor(Math.random() * CONFIG.SIZE), y = Math.floor(Math.random() * CONFIG.SIZE);
      if (room.tiles[y][x] !== TILE.NORMAL) continue;
      if (room.rifts.some(r => r.x === x && r.y === y)) continue;
      if ([...room.players.values()].some(p => p.alive && p.x === x && p.y === y)) continue;
      room.rifts.push({ id: i, x, y, state: 'OPEN', waitingId: null, waitStartAt: 0, waitDuration: CONFIG.RIFT_WAIT, cooldownUntil: 0 });
      room.tiles[y][x] = TILE.RIFT;
      break;
    }
  }
}
function findRiftSpot(room) {
  for (let t = 0; t < 200; t++) {
    const x = Math.floor(Math.random() * CONFIG.SIZE), y = Math.floor(Math.random() * CONFIG.SIZE);
    if (room.tiles[y][x] !== TILE.NORMAL) continue;
    if (room.rifts.some(r => r.x === x && r.y === y)) continue;
    if ([...room.players.values()].some(p => p.alive && p.x === x && p.y === y)) continue;
    return { x, y };
  }
  return null;
}
function broadcastRift(room, rift) {
  const waiting = room.players.get(rift.waitingId);
  const strong = waiting && (waiting.winStreak || 0) >= 2;
  const radius = strong ? 10 : CONFIG.RIFT_BCAST;
  for (const p of room.players.values()) {
    if (!p.alive || p.id === rift.waitingId) continue;
    if (dist(p, rift) <= radius) p.riftHints.push({ dir: dirOf(p, rift), until: Date.now() + 5000, strong });
  }
}
function tryEnterRift(room, player) {
  const now = Date.now();
  if (now - (player.lastRiftAt || 0) < 10000) return { ok: false, error: '胜利后10秒内不可进裂隙' };
  const r = room.rifts.find(r => r.x === player.x && r.y === player.y);
  if (!r || r.state === 'BUSY') return null;
  if (r.state === 'COOLDOWN') return { ok: false, error: '裂隙冷却中' };
  if (r.state === 'OPEN') {
    let waitTime = CONFIG.RIFT_WAIT;
    if (player.riftRushBuff) { waitTime = CONFIG.RIFT_WAIT / 2; player.riftRushBuff = false; player.riftRushPendingScore = true; }
    if (player.riftKeyBuff && waitTime === CONFIG.RIFT_WAIT) { waitTime = CONFIG.RIFT_WAIT / 2; player.riftKeyBuff = false; player.riftKeyPendingItem = true; }
    r.state = 'WAITING'; r.waitingId = player.id; r.waitStartAt = now; r.waitDuration = waitTime;
    player.waitingRiftId = r.id; player.nextActionAt = now + waitTime;
    player.stats.riftEnters = (player.stats.riftEnters || 0) + 1;
    addLog(room, player.name + ' 进入裂隙等待匹配');
    broadcastRift(room, r);
    return { ok: true, waiting: true, waitTime };
  }
  if (r.state === 'WAITING' && r.waitingId !== player.id) {
    const other = room.players.get(r.waitingId);
    if (!other || !other.alive) { r.state = 'OPEN'; r.waitingId = null; return null; }
    r.state = 'BUSY'; other.waitingRiftId = null; player.waitingRiftId = null;
    startSmallBoard(room, other, player, r);
    return { ok: true, matched: true };
  }
  return null;
}
function riftTick(room, now) {
  let changed = false;
  for (const r of room.rifts) {
    if (r.state === 'WAITING' && now - r.waitStartAt >= r.waitDuration) {
      const wp = room.players.get(r.waitingId);
      if (wp) { wp.fragments = (wp.fragments || 0) + 2; wp.waitingRiftId = null; wp.nextActionAt = now; addLog(room, wp.name + ' 裂隙等待超时，获得 2 残片'); }
      r.state = 'COOLDOWN'; r.waitingId = null; r.cooldownUntil = now + CONFIG.RIFT_COOLDOWN; changed = true;
    }
    if (r.state === 'COOLDOWN' && now >= r.cooldownUntil) {
      const t = room.tiles[r.y][r.x];
      if (t === TILE.NORMAL || t === TILE.RESOURCE || t === TILE.RIFT) {
        if (t !== TILE.RIFT) room.tiles[r.y][r.x] = TILE.RIFT;
        r.state = 'OPEN';
      } else {
        const spot = findRiftSpot(room);
        if (spot) { r.x = spot.x; r.y = spot.y; room.tiles[r.y][r.x] = TILE.RIFT; r.state = 'OPEN'; }
        else r.state = 'CLOSED';
      }
      changed = true;
    }
  }
  return changed;
}

/* ---------- 小棋盘（略缩，保留原样） ---------- */
function genSmallControlPoints() {
  const center = { x: 3, y: 3 }, candidates = [];
  for (let x = 1; x <= 5; x++) for (let y = 1; y <= 5; y++) {
    if (x === 3 && y === 3) continue;
    if (Math.abs(x) + Math.abs(y) < 4) continue;
    if (Math.abs(x - 6) + Math.abs(y - 6) < 4) continue;
    candidates.push({ x, y });
  }
  for (let t = 0; t < 100; t++) {
    const a = pick(candidates), b = pick(candidates);
    if (a.x === b.x && a.y === b.y || dist(a, b) < 3) continue;
    return [center, a, b];
  }
  return [center, { x: 1, y: 5 }, { x: 5, y: 1 }];
}
function genSmallItems(cps) {
  const cells = [];
  for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) {
    if (x === 0 && y === 0 || x === 6 && y === 6) continue;
    if (cps.some(c => c.x === x && c.y === y)) continue;
    cells.push({ x, y });
  }
  const items = [];
  for (let i = 0; i < 3; i++) {
    if (cells.length === 0) break;
    const c = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
    items.push({ x: c.x, y: c.y, type: pick(SMALL_ITEM_TYPES) });
  }
  return items;
}
function startSmallBoard(room, a, b, rift) {
  const cps = genSmallControlPoints().map(c => ({ x: c.x, y: c.y, owner: 'neutral' }));
  const sm = {
    aId: a.id, bId: b.id, riftId: rift.id, aPos: { x: 0, y: 0 }, bPos: { x: 6, y: 6 }, aScore: 0, bScore: 0,
    controlPoints: cps, items: genSmallItems(cps), aItems: [], bItems: [], aTrap: null, bTrap: null,
    aStunned: false, bStunned: false, aDashPenalty: false, bDashPenalty: false, aHoldPenalty: false, bHoldPenalty: false,
    aStunnedNext: false, bStunnedNext: false, aDashPenaltyNext: false, bDashPenaltyNext: false, aHoldPenaltyNext: false, bHoldPenaltyNext: false,
    blockades: [], blockedCp: [], startAt: Date.now(), endsAt: Date.now() + CONFIG.SMALL_DURATION,
    nextTurnAt: Date.now() + CONFIG.SMALL_OBSERVE, aInput: null, bInput: null, turnCount: 0, aLastScoreAt: 0, bLastScoreAt: 0
  };
  if (a.riftRushPendingScore) { a.riftRushPendingScore = false; sm.aScore += 2; }
  if (b.riftRushPendingScore) { b.riftRushPendingScore = false; sm.bScore += 2; }
  if (a.riftKeyPendingItem) { a.riftKeyPendingItem = false; sm.aItems.push(pick(SMALL_ITEM_TYPES)); }
  if (b.riftKeyPendingItem) { b.riftKeyPendingItem = false; sm.bItems.push(pick(SMALL_ITEM_TYPES)); }
  if (a.relic) { sm.aItems.push(a.relic); a.relic = null; }
  if (b.relic) { sm.bItems.push(b.relic); b.relic = null; }
  room.small = sm;
  addLog(room, a.name + ' 与 ' + b.name + ' 开始小棋盘对决');
}
function smallSamePos(a, b) { return a && b && a.x === b.x && a.y === b.y; }
function applySmallMove(sm, side, act) {
  const posKey = side === 'a' ? 'aPos' : 'bPos', target = act.target;
  if (!target) return;
  const from = sm[posKey], d = Math.abs(target.x - from.x) + Math.abs(target.y - from.y);
  if (act.type === 'move' && d !== 1 || act.type === 'dash' && (d < 1 || d > 2) || target.x < 0 || target.x > 6 || target.y < 0 || target.y > 6) return;
  if (sm.blockades.some(bd => bd.x === target.x && bd.y === target.y)) return;
  const otherKey = side === 'a' ? 'bPos' : 'aPos';
  if (sm[otherKey].x === target.x && sm[otherKey].y === target.y) return;
  sm[posKey] = { x: target.x, y: target.y };
  const itemIdx = sm.items.findIndex(it => it.x === target.x && it.y === target.y);
  if (itemIdx >= 0) {
    const itemsKey = side === 'a' ? 'aItems' : 'bItems';
    if (sm[itemsKey].length < CONFIG.SMALL_ITEM_CAP) { sm[itemsKey].push(sm.items[itemIdx].type); sm.items.splice(itemIdx, 1); }
  }
}
function applySmallItem(sm, side, act) {
  const idx = act.itemIdx, itemsKey = side === 'a' ? 'aItems' : 'bItems';
  if (typeof idx !== 'number' || idx < 0 || idx >= sm[itemsKey].length) return;
  const item = sm[itemsKey][idx], selfPosKey = side === 'a' ? 'aPos' : 'bPos', oppPosKey = side === 'a' ? 'bPos' : 'aPos';
  const self = sm[selfPosKey], opp = sm[oppPosKey], inBoard = (p) => p && p.x >= 0 && p.x <= 6 && p.y >= 0 && p.y <= 6;
  if (item === 'push') {
    let refCp = null, minD = Infinity;
    for (const cp of sm.controlPoints) {
      if (smallSamePos(cp, opp)) continue;
      const d = dist(opp, cp);
      if (d < minD) { minD = d; refCp = cp; }
    }
    if (!refCp) return;
    const dx = Math.sign(opp.x - refCp.x), dy = Math.sign(opp.y - refCp.y);
    if (dx === 0 && dy === 0) return;
    const nx = opp.x - dx, ny = opp.y - dy;
    if (!inBoard({ x: nx, y: ny }) || sm.blockades.some(bd => bd.x === nx && bd.y === ny) || sm[selfPosKey].x === nx && sm[selfPosKey].y === ny) return;
    sm[oppPosKey] = { x: nx, y: ny }; sm[itemsKey].splice(idx, 1);
  } else if (item === 'block') {
    const cps = sm.controlPoints.filter(cp => !smallSamePos(cp, sm.aPos) && !smallSamePos(cp, sm.bPos) && !sm.blockedCp.some(bc => smallSamePos(bc.cp, cp) && bc.until > sm.turnCount));
    if (cps.length === 0) return;
    sm.blockedCp.push({ cp: pick(cps), owner: side, until: sm.turnCount + 2 }); sm[itemsKey].splice(idx, 1);
  } else if (item === 'steal') {
    const selfScoreKey = side === 'a' ? 'aScore' : 'bScore', oppScoreKey = side === 'a' ? 'bScore' : 'aScore';
    if (sm[oppScoreKey] <= 0) return;
    sm[oppScoreKey] -= 1; sm[selfScoreKey] += 1; sm[itemsKey].splice(idx, 1);
  } else if (item === 'swap') {
    const tmp = { ...sm[selfPosKey] }; sm[selfPosKey] = { ...sm[oppPosKey] }; sm[oppPosKey] = tmp; sm[itemsKey].splice(idx, 1);
  } else if (item === 'trap') {
    const cp = pick(sm.controlPoints), candidates = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const tx = cp.x + dx, ty = cp.y + dy;
      if (tx < 0 || tx > 6 || ty < 0 || ty > 6 || sm.blockades.some(bd => bd.x === tx && bd.y === ty)) continue;
      candidates.push({ x: tx, y: ty });
    }
    if (candidates.length === 0) return;
    sm[side === 'a' ? 'aTrap' : 'bTrap'] = { pos: pick(candidates), owner: side }; sm[itemsKey].splice(idx, 1);
  }
}
function resolveSmallTurn(room) {
  const sm = room.small, aP = room.players.get(sm.aId), bP = room.players.get(sm.bId);
  const oldA = sm.aScore, oldB = sm.bScore, a = sm.aInput || { type: 'hold' }, b = sm.bInput || { type: 'hold' };
  if (a.type === 'item') applySmallItem(sm, 'a', a);
  if (b.type === 'item') applySmallItem(sm, 'b', b);
  const aCanMove = !sm.aStunned && !sm.aDashPenalty && !sm.aHoldPenalty, bCanMove = !sm.bStunned && !sm.bDashPenalty && !sm.bHoldPenalty;
  if ((a.type === 'move' || a.type === 'dash') && aCanMove) applySmallMove(sm, 'a', a);
  if ((b.type === 'move' || b.type === 'dash') && bCanMove) applySmallMove(sm, 'b', b);
  if (sm.aTrap && smallSamePos(sm.bPos, sm.aTrap.pos)) { sm.bStunnedNext = true; sm.aTrap = null; }
  if (sm.bTrap && smallSamePos(sm.aPos, sm.bTrap.pos)) { sm.aStunnedNext = true; sm.bTrap = null; }
  for (const cp of sm.controlPoints) {
    if (smallSamePos(sm.aPos, cp)) cp.owner = 'a'; else if (smallSamePos(sm.bPos, cp)) cp.owner = 'b';
  }
  for (const cp of sm.controlPoints) {
    if (cp.owner === 'a') sm.aScore += 1; else if (cp.owner === 'b') sm.bScore += 1;
  }
  if (a.type === 'hold' && !sm.aStunned && !sm.aDashPenalty && sm.controlPoints.find(cp => smallSamePos(sm.aPos, cp) && cp.owner === 'a')) { sm.aScore += 1; sm.aHoldPenaltyNext = true; }
  if (b.type === 'hold' && !sm.bStunned && !sm.bDashPenalty && sm.controlPoints.find(cp => smallSamePos(sm.bPos, cp) && cp.owner === 'b')) { sm.bScore += 1; sm.bHoldPenaltyNext = true; }
  if (a.type === 'dash' && aCanMove) sm.aDashPenaltyNext = true;
  if (b.type === 'dash' && bCanMove) sm.bDashPenaltyNext = true;
  if (sm.aScore > oldA) { aP.lastScoreAt = Date.now(); sm.aLastScoreAt = Date.now(); }
  if (sm.bScore > oldB) { bP.lastScoreAt = Date.now(); sm.bLastScoreAt = Date.now(); }
  sm.aInput = null; sm.bInput = null;
  if (sm.turnCount % 2 === 1) {
    const empty = [];
    for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) {
      if (x === 0 && y === 0 || x === 6 && y === 6) continue;
      if (sm.controlPoints.some(c => c.x === x && c.y === y) || sm.items.some(i => i.x === x && i.y === y) || smallSamePos(sm.aPos, { x, y }) || smallSamePos(sm.bPos, { x, y })) continue;
      empty.push({ x, y });
    }
    if (empty.length > 0) { const c = pick(empty); sm.items.push({ x: c.x, y: c.y, type: pick(SMALL_ITEM_TYPES) }); }
  }
  if (sm.aScore >= CONFIG.SMALL_SCORE_WIN || sm.bScore >= CONFIG.SMALL_SCORE_WIN || Date.now() >= sm.endsAt) { endSmallBoard(room); return; }
  sm.blockades = sm.blockades.filter(bd => bd.until > sm.turnCount);
  sm.blockedCp = sm.blockedCp.filter(bc => bc.until > sm.turnCount);
  sm.aStunned = sm.aStunnedNext; sm.aStunnedNext = false;
  sm.bStunned = sm.bStunnedNext; sm.bStunnedNext = false;
  sm.aDashPenalty = sm.aDashPenaltyNext; sm.aDashPenaltyNext = false;
  sm.bDashPenalty = sm.bDashPenaltyNext; sm.bDashPenaltyNext = false;
  sm.aHoldPenalty = sm.aHoldPenaltyNext; sm.aHoldPenaltyNext = false;
  sm.bHoldPenalty = sm.bHoldPenaltyNext; sm.bHoldPenaltyNext = false;
  sm.turnCount += 1; sm.nextTurnAt = Date.now() + CONFIG.SMALL_CD;
}
function smallTick(room, now) {
  const sm = room.small;
  if (!sm) return false;
  if (now >= sm.endsAt) { endSmallBoard(room); return true; }
  if (now >= sm.nextTurnAt) {
    const aP = room.players.get(sm.aId), bP = room.players.get(sm.bId);
    if (aP && aP.isAI && !sm.aInput) sm.aInput = smallAI(sm, 'a');
    if (bP && bP.isAI && !sm.bInput) sm.bInput = smallAI(sm, 'b');
    resolveSmallTurn(room); return true;
  }
  return false;
}
function smallAI(sm, side) {
  const selfKey = side === 'a' ? 'aPos' : 'bPos', oppKey = side === 'a' ? 'bPos' : 'aPos';
  const selfItemsKey = side === 'a' ? 'aItems' : 'bItems', selfScoreKey = side === 'a' ? 'aScore' : 'bScore', oppScoreKey = side === 'a' ? 'bScore' : 'aScore';
  const self = sm[selfKey], opp = sm[oppKey], items = sm[selfItemsKey];
  const canMove = !(sm[side === 'a' ? 'aStunned' : 'bStunned'] || sm[side === 'a' ? 'aDashPenalty' : 'bDashPenalty'] || sm[side === 'a' ? 'aHoldPenalty' : 'bHoldPenalty']);
  const scoreDiff = sm[selfScoreKey] - sm[oppScoreKey];
  
  if (!canMove) {
    const stealIdx = items.indexOf('steal'); if (stealIdx >= 0 && sm[oppScoreKey] > 0) return { type: 'item', itemIdx: stealIdx };
    const blockIdx = items.indexOf('block'); if (blockIdx >= 0) return { type: 'item', itemIdx: blockIdx };
    const trapIdx = items.indexOf('trap'); if (trapIdx >= 0) return { type: 'item', itemIdx: trapIdx };
    return { type: 'idle' };
  }
  
  const onOwnCp = sm.controlPoints.find(cp => cp.owner === side && smallSamePos(cp, self));
  const isWinning = scoreDiff >= 3 || (sm[selfScoreKey] >= 8 && scoreDiff > 0);
  const isLosing = scoreDiff <= -2;
  
  if (isWinning && onOwnCp && !sm[side === 'a' ? 'aHoldPenalty' : 'bHoldPenalty'] && Math.random() < 0.8) {
    return { type: 'hold' };
  }
  
  const stealIdx = items.indexOf('steal');
  if (stealIdx >= 0 && sm[oppScoreKey] > 0) {
    if (isLosing || Math.random() < 0.3) return { type: 'item', itemIdx: stealIdx };
  }
  
  const targetCp = (() => {
    let best = null, bestD = 99;
    for (const cp of sm.controlPoints) {
      const blocked = sm.blockedCp.find(bc => smallSamePos(bc.cp, cp) && bc.until > sm.turnCount && bc.owner !== side);
      if (blocked || (cp.owner === side && !smallSamePos(cp, self))) continue;
      const d = dist(self, cp);
      if (d < bestD) { bestD = d; best = cp; }
    }
    return best;
  })();
  
  const target = targetCp || (isWinning ? self : opp);
  
  if (targetCp && smallSamePos(targetCp, opp)) {
    const pushIdx = items.indexOf('push'); if (pushIdx >= 0 && Math.random() < 0.5) return { type: 'item', itemIdx: pushIdx };
  }
  
  const dx = target.x - self.x, dy = target.y - self.y, options = [];
  const order = Math.abs(dx) >= Math.abs(dy) ? [['x', Math.sign(dx)], ['y', Math.sign(dy)]] : [['y', Math.sign(dy)], ['x', Math.sign(dx)]];
  
  for (const [axis, sign] of order) {
    if (sign === 0) continue;
    const step = { x: self.x + (axis === 'x' ? sign : 0), y: self.y + (axis === 'y' ? sign : 0) };
    if (step.x < 0 || step.x > 6 || step.y < 0 || step.y > 6 || smallSamePos(step, opp) || sm.blockades.some(bd => bd.x === step.x && bd.y === step.y)) continue;
    options.push(step);
    const step2 = { x: step.x + (axis === 'x' ? sign : 0), y: step.y + (axis === 'y' ? sign : 0) };
    if (step2.x >= 0 && step2.x <= 6 && step2.y >= 0 && step2.y <= 6 && !smallSamePos(step2, opp) && !sm.blockades.some(bd => bd.x === step2.x && bd.y === step2.y) && (step2.x === target.x && step2.y === target.y || dist(step2, target) < dist(step, target))) options.push(step2);
  }
  
  const dashPen = sm[side === 'a' ? 'aDashPenalty' : 'bDashPenalty'];
  if (!dashPen && dist(self, target) === 2 && options.some(o => o.x === target.x && o.y === target.y) && (target.x === self.x || target.y === self.y)) {
    return { type: 'dash', target };
  }
  
  const blockIdx = items.indexOf('block'); if (blockIdx >= 0 && Math.random() < 0.3) return { type: 'item', itemIdx: blockIdx };
  const trapIdx = items.indexOf('trap'); if (trapIdx >= 0 && Math.random() < 0.3) return { type: 'item', itemIdx: trapIdx };
  const swapIdx = items.indexOf('swap'); if (swapIdx >= 0 && dist(self, target) >= 3 && Math.random() < 0.2) return { type: 'item', itemIdx: swapIdx };
  
  if (options.length > 0) return { type: 'move', target: options[0] };
  
  if (onOwnCp) return { type: 'hold' };
  return { type: 'idle' };
}
function endSmallBoard(room) {
  const sm = room.small;
  if (!sm) return;
  const aP = room.players.get(sm.aId), bP = room.players.get(sm.bId);
  let winP, loseP, finalDiff;
  if (sm.aScore > sm.bScore) { winP = aP; loseP = bP; finalDiff = sm.aScore - sm.bScore; }
  else if (sm.bScore > sm.aScore) { winP = bP; loseP = aP; finalDiff = sm.bScore - sm.aScore; }
  else {
    const aOwned = sm.controlPoints.filter(c => c.owner === 'a').length, bOwned = sm.controlPoints.filter(c => c.owner === 'b').length;
    if (aOwned !== bOwned) winP = aOwned > bOwned ? aP : bP;
    else if (sm.aItems.length !== sm.bItems.length) winP = sm.aItems.length > sm.bItems.length ? aP : bP;
    else winP = sm.aLastScoreAt >= sm.bLastScoreAt ? aP : bP;
    loseP = winP === aP ? bP : aP; finalDiff = 1;
  }
  for (const p of [aP, bP]) {
    if (!p) continue;
    const safe = findSafeCell(room);
    if (safe) { p.x = safe.x; p.y = safe.y; }
    p.nextActionAt = Date.now() + 5000;
  }
  const rift = room.rifts.find(r => r.id === sm.riftId);
  if (rift) { rift.state = 'COOLDOWN'; rift.cooldownUntil = Date.now() + CONFIG.RIFT_COOLDOWN; }
  if (winP) {
    winP.winStreak = (winP.winStreak || 0) + 1; winP.lossStreak = 0; winP.lastRiftAt = Date.now();
    winP.stats.smallWins = (winP.stats.smallWins || 0) + 1;
    const ws = winP.winStreak, blessingCount = ws === 1 ? 3 : ws === 2 ? 2 : 0;
    if (blessingCount > 0) {
      if (winP.isAI) applyBlessing(room, winP, pick(BLESSINGS).id);
      else {
        const pool = BLESSINGS.slice(), options = [];
        for (let i = 0; i < blessingCount && pool.length > 0; i++) options.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        winP.pendingBlessing = { options };
      }
    } else if (winP.items.length < CONFIG.ITEM_CAP) winP.items.push(pick(ITEM_IDS));
    const srcItems = (sm.aId === winP.id ? sm.aItems : sm.bItems) || [];
    if (srcItems.length > 0 && !winP.relic) {
      if (winP.isAI) winP.relic = srcItems[0];
      else winP.pendingRelic = srcItems.slice();
    }
  }
  if (loseP) {
    loseP.lossStreak = (loseP.lossStreak || 0) + 1; loseP.winStreak = 0;
    loseP.stats.smallLosses = (loseP.stats.smallLosses || 0) + 1;
    applyPunishment(room, loseP, finalDiff, winP);
  }
  addLog(room, '对决结束：' + (winP ? winP.name : '?') + ' 胜出，分差 ' + finalDiff);
  room.small = null;
  if (room.pendingFinalPhase && !room.gameOver) checkFinalPhase(room);
}
function applyPunishment(room, loser, diff, winner) {
  const now = Date.now();
  let type = diff <= 2 ? '小败' : diff <= 4 ? '中败' : '大败', fragGain = 1;
  const lowHp = loser.hp <= 1, hasShield = (loser.shields || 0) > 0;
  if (type === '小败') { loser.fatigueUntil = now + 10000; fragGain = 1; }
  else if (type === '中败') {
    loser.fatigueUntil = now + (lowHp ? 20000 : 15000);
    if (hasShield || !lowHp) damagePlayer(room, loser, 1, '战败扣血');
    fragGain = 2;
  } else {
    loser.fatigueUntil = now + (lowHp ? 25000 : 20000);
    if (hasShield || !lowHp) damagePlayer(room, loser, 1, '惨败扣血');
    loser.exposedUntil = now + 5000; fragGain = 3;
  }
  if (winner && (winner.winStreak || 0) >= 2) fragGain += 1;
  loser.fragments = (loser.fragments || 0) + fragGain;
  addLog(room, loser.name + ' 战败（' + type + '），获得 ' + fragGain + ' 残片');
}
function applyBlessing(room, player, blessingId) {
  const now = Date.now();
  if (blessingId === 'swift') { if (!player.relic) player.relic = pick(SMALL_ITEM_TYPES); else if (player.items.length < CONFIG.ITEM_CAP) player.items.push(pick(ITEM_IDS)); }
  else if (blessingId === 'vision') player.visionBuffUntil = now + CONFIG.VISION_BUFF_DURATION;
  else if (blessingId === 'shield') player.shields = (player.shields || 0) + 2;
  else if (blessingId === 'harvest') player.harvestBuff = true;
  else if (blessingId === 'rift') player.riftRushBuff = true;
  else if (blessingId === 'purify') { player.fatigueUntil = 0; player.disoriented = false; player.disorientedUntil = 0; player.nextActionAt = now; }
  else if (blessingId === 'dash') { let added = 0; while (added < 2 && player.items.length < CONFIG.ITEM_CAP) { player.items.push('item_0'); added++; } }
  else if (blessingId === 'heal') { player.hp = Math.min(CONFIG.HP, player.hp + 1); player.shields = (player.shields || 0) + 1; }
}

/* ---------- 坍塌与伤害 ---------- */
function initRing(room, r) {
  const cells = [];
  for (let y = 0; y < CONFIG.SIZE; y++) for (let x = 0; x < CONFIG.SIZE; x++) {
    if (ring(x, y, CONFIG.SIZE) === r && room.tiles[y][x] !== TILE.RUIN) cells.push({ x, y });
  }
  room.collapse.cells = cells;
}
function startCollapse(room, now) {
  room.collapse.started = true; room.collapse.ring = 0;
  initRing(room, 0); room.collapse.nextAt = now + CONFIG.COLLAPSE_INTERVAL;
  addLog(room, '坍塌开始');
  fillWithAI(room);
}
function handleCellCollapse(room, x, y, now) {
  if (room.tiles[y][x] === TILE.RUIN) return;
  const rift = room.rifts.find(r => r.x === x && r.y === y);
  if (rift) {
    if (rift.waitingId) {
      const wp = room.players.get(rift.waitingId);
      if (wp) { wp.fragments = (wp.fragments || 0) + 2; wp.waitingRiftId = null; wp.nextActionAt = now; addLog(room, wp.name + ' 裂隙被坍塌，弹出，获得 2 残片'); }
    }
    rift.state = 'COOLDOWN'; rift.waitingId = null; rift.cooldownUntil = now + CONFIG.RIFT_COOLDOWN;
  }
  room.tiles[y][x] = TILE.DANGER;
}
function finalizeRing(room, r) {
  for (let y = 0; y < CONFIG.SIZE; y++) for (let x = 0; x < CONFIG.SIZE; x++) {
    if (ring(x, y, CONFIG.SIZE) === r && room.tiles[y][x] === TILE.DANGER) room.tiles[y][x] = TILE.RUIN;
  }
  for (const p of room.players.values()) {
    if (!p.alive || room.tiles[p.y][p.x] !== TILE.RUIN) continue;
    let found = false;
    outer: for (let step = 1; step < CONFIG.SIZE && !found; step++) {
      for (let dy = -step; dy <= step; dy++) for (let dx = -step; dx <= step; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== step) continue;
        const nx = p.x + dx, ny = p.y + dy;
        if (!isWalkable(room, nx, ny, p.id)) continue;
        p.x = nx; p.y = ny; found = true; break outer;
      }
    }
    damagePlayer(room, p, 1, '被废墟挤压');
  }
  addLog(room, '第 ' + (r + 1) + ' 层完全坍塌');
}
function collapseTick(room, now) {
  let changed = false;
  const c = room.collapse;
  if (c.warnCell && now >= c.warnUntil) { handleCellCollapse(room, c.warnCell.x, c.warnCell.y, now); c.warnCell = null; changed = true; }
  if (!c.warnCell && now >= c.nextAt) {
    if (c.cells.length === 0) {
      finalizeRing(room, c.ring); c.ring++;
      if (c.ring === 1 && !room.locked) { room.locked = true; addLog(room, '第一层坍塌完成，房间锁定，新玩家无法加入'); broadcastRoomList(); }
      if (c.ring > Math.floor(CONFIG.SIZE / 2) - 1) { c.done = true; changed = true; }
      else { initRing(room, c.ring); changed = true; }
    }
    if (!c.done && c.cells.length > 0) {
      const idx = Math.floor(Math.random() * c.cells.length);
      c.warnCell = c.cells.splice(idx, 1)[0]; c.warnUntil = now + CONFIG.COLLAPSE_WARN; c.nextAt = now + CONFIG.COLLAPSE_INTERVAL; changed = true;
    }
  }
  return changed;
}
function damagePlayer(room, player, amount, reason) {
  if (!player.alive || amount <= 0) return;
  if ((player.shields || 0) > 0) { player.shields -= 1; if (room) addLog(room, player.name + ' 护盾抵消 ' + reason); return; }
  player.hp -= amount; player.stats.damageTaken = (player.stats.damageTaken || 0) + 1;
  if (player.hp <= 0) killPlayer(player, reason, room);
}
function killPlayer(p, reason, room) {
  p.alive = false; p.hp = 0; p.stats.killReason = reason; p.stats.deadAt = Date.now();
  if (room) addLog(room, p.name + ' 被淘汰（' + reason + '）');
}

function tryDisorientAutoMove(room, player, now) {
  if (!player.alive || !player.disoriented || room.small && (room.small.aId === player.id || room.small.bId === player.id) || player.waitingRiftId || now < player.nextActionAt) return false;
  player.disoriented = false; player.disorientedUntil = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isWalkable(room, player.x + dx, player.y + dy, player.id));
  if (dirs.length === 0) { player.nextActionAt = now + CONFIG.ACTION_CD; addLog(room, player.name + ' 失控但四周不可走'); return true; }
  const [dx, dy] = pick(dirs);
  player.x += dx; player.y += dy; player.nextActionAt = now + CONFIG.ACTION_CD;
  applyTileEffectOnMove(room, player, now); computeVisibility(room, player);
  addLog(room, player.name + ' 失控自动移动');
  return true;
}

function checkFinalPhase(room) {
  if (room.finalPhaseTriggered || room.gameOver) return false;
  const alive = [...room.players.values()].filter(p => p.alive);
  if (alive.length <= 1) return false;
  let standable = 0;
  for (let y = 0; y < CONFIG.SIZE; y++) for (let x = 0; x < CONFIG.SIZE; x++) {
    const t = room.tiles[y][x];
    if (t === TILE.NORMAL || t === TILE.RESOURCE || t === TILE.RIFT || t === TILE.TRANSPORT) standable++;
  }
  if (standable > CONFIG.FINAL_PHASE_STANDABLE) return false;
  room.collapse.done = true;
  if (room.small) { room.pendingFinalPhase = true; return false; }
  room.finalPhaseTriggered = true; room.pendingFinalPhase = false;
  const winner = alive.slice().sort((a, b) => b.hp !== a.hp ? b.hp - a.hp : (b.fragments || 0) !== (a.fragments || 0) ? (b.fragments || 0) - (a.fragments || 0) : b.items.length !== a.items.length ? b.items.length - a.items.length : (b.lastScoreAt || 0) - (a.lastScoreAt || 0))[0];
  room.gameOver = true; room.winnerId = winner ? winner.id : null; room.rankings = computeRankings(room);
  addLog(room, '最终收束：' + (winner ? winner.name : '?') + ' 获胜');
  broadcastRoomList();
  return true;
}
function computeRankings(room) {
  const all = [...room.players.values()].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (b.hp !== a.hp) return b.hp - a.hp;
    if ((b.fragments || 0) !== (a.fragments || 0)) return (b.fragments || 0) - (a.fragments || 0);
    if (b.items.length !== a.items.length) return b.items.length - a.items.length;
    return (b.lastScoreAt || 0) - (a.lastScoreAt || 0);
  });
  const now = Date.now();
  return all.map((p, i) => ({
    rank: i + 1, id: p.id, name: p.name, color: p.color, isAI: !!p.isAI, alive: p.alive, hp: p.hp, fragments: p.fragments || 0, items: p.items.length,
    smallWins: p.stats.smallWins || 0, smallLosses: p.stats.smallLosses || 0, damageTaken: p.stats.damageTaken || 0, pickups: p.stats.pickups || 0,
    itemsUsed: p.stats.itemsUsed || 0, riftEnters: p.stats.riftEnters || 0, killReason: p.stats.killReason || null, 
    aliveTime: Math.max(0, Math.round(((p.alive ? now : (p.stats.deadAt || now)) - (p.joinAt || room.createdAt)) / 1000))
  }));
}

function createAIPlayer(room, aiIdx) {
  const spawn = findSpawn(room);
  
  // 动态计算当前房间还没被占用的颜色
  const usedColors = [...room.players.values()].map(p => p.color);
  const availableColors = COLORS.filter(c => !usedColors.includes(c));
  
  // 优先从没用过的颜色里挑，如果都被占满了（极罕见），用备用颜色
  const myColor = availableColors.length > 0 ? availableColors[0] : AI_COLORS[aiIdx % AI_COLORS.length];
  
  // 根据最终拿到的颜色，反查对应的名字，保证绝对匹配
  const nameIdx = COLORS.indexOf(myColor);
  const myName = nameIdx >= 0 ? NAMES[nameIdx] : ('AI-' + (aiIdx + 1));

  return {
    id: 'ai_' + aiIdx, 
    socketId: null, 
    isAI: true, 
    name: myName,
    color: myColor, 
    x: spawn.x, 
    y: spawn.y, 
    hp: CONFIG.HP, 
    shields: 0, 
    alive: true,
    joinAt: Date.now(),
    items: [], 
    fragments: 0, 
    relic: null, 
    winStreak: 0, 
    lossStreak: 0, 
    pendingBlessing: null, 
    pendingRelic: null, 
    riftHints: [], 
    waitingRiftId: null, 
    riftKeyBuff: false,
    riftKeyPendingItem: false, 
    riftRushBuff: false, 
    riftRushPendingScore: false, 
    harvestBuff: false, 
    insightUntil: 0, 
    scanUntil: 0, 
    visionBuffUntil: 0, 
    fatigueUntil: 0, 
    exposedUntil: 0,
    disoriented: false, 
    disorientedUntil: 0, 
    hpRestoredThisGame: false, 
    relicExchangedThisGame: false, 
    lastRiftAt: 0, 
    lastScoreAt: 0, 
    nextActionAt: 0, 
    lastDangerDmg: 0,
    visible: new Set(), 
    tileMemory: {}, 
    preferAngle: (aiIdx / CONFIG.MAX_PLAYERS) * Math.PI * 2,
    stats: { damageTaken: 0, killReason: null, deadAt: null, smallWins: 0, smallLosses: 0, pickups: 0, itemsUsed: 0, riftEnters: 0 }
  };
}
function fillWithAI(room) {
  if (room.aiFilled) return;
  room.aiFilled = true;
  if ([...room.players.values()].filter(p => !p.isAI).length === 0) return;
  let count = 0;
  while (room.players.size < CONFIG.MAX_PLAYERS) {
    const ai = createAIPlayer(room, room.aiCounter++);
    room.players.set(ai.id, ai); computeVisibility(room, ai); count++;
  }
  addLog(room, 'AI 补位完成，共 ' + count + ' 个 AI');
  broadcastRoomList();
}
function aiTryUseItem(room, ai, now) {
  if (ai.hp <= 1 && ai.items.includes('item_6')) {
    ai.items.splice(ai.items.indexOf('item_6'), 1);
    ai.hp = Math.min(CONFIG.HP, ai.hp + 1);
    ai.stats.itemsUsed = (ai.stats.itemsUsed || 0) + 1;
    ai.nextActionAt = now + CONFIG.ACTION_CD;
    return true;
  }
  if (ai.hp <= 2 && (ai.shields || 0) <= 0 && ai.items.includes('item_3')) {
    ai.items.splice(ai.items.indexOf('item_3'), 1);
    ai.shields = (ai.shields || 0) + 1;
    ai.stats.itemsUsed = (ai.stats.itemsUsed || 0) + 1;
    ai.nextActionAt = now + CONFIG.ACTION_CD;
    return true;
  }
  if (ai.items.includes('item_2') && Math.random() < 0.05) {
    ai.items.splice(ai.items.indexOf('item_2'), 1);
    ai.scanUntil = now + CONFIG.SCAN_DURATION;
    ai.stats.itemsUsed = (ai.stats.itemsUsed || 0) + 1;
    ai.nextActionAt = now + CONFIG.ACTION_CD;
    computeVisibility(room, ai);
    return true;
  }
  if (ai.items.includes('item_8') && Math.random() < 0.15) {
    const nearEnemy = [...room.players.values()].some(o => o !== ai && o.alive && Math.abs(o.x - ai.x) <= 1 && Math.abs(o.y - ai.y) <= 1);
    if (nearEnemy) {
      ai.items.splice(ai.items.indexOf('item_8'), 1);
      let count = 0;
      for (const other of room.players.values()) {
        if (other !== ai && other.alive && Math.abs(other.x - ai.x) <= 1 && Math.abs(other.y - ai.y) <= 1) {
          other.disoriented = true;
          other.disorientedUntil = now + CONFIG.DISORIENT_DURATION;
          count++;
        }
      }
      ai.stats.itemsUsed = (ai.stats.itemsUsed || 0) + 1;
      ai.nextActionAt = now + CONFIG.ACTION_CD;
      addLog(room, ai.name + ' 使用失控干扰器，影响 ' + count + ' 名玩家');
      return true;
    }
  }
  if (ai.items.includes('item_0')) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = ai.x + dx, ny = ai.y + dy;
      if (nx < 0 || ny < 0 || nx >= CONFIG.SIZE || ny >= CONFIG.SIZE) continue;
      if (!isWalkable(room, nx, ny, ai.id)) continue;
      const t = room.tiles[ny][nx];
      let useDash = false;
      if (t === TILE.RESOURCE && ai.items.length < CONFIG.ITEM_CAP) useDash = true;
      if (t === TILE.RIFT && room.rifts.find(r => r.x === nx && r.y === ny && r.state === 'OPEN') && ai.hp > 1 && now - ai.lastRiftAt > 10000) useDash = true;
      
      if (useDash) {
        ai.items.splice(ai.items.indexOf('item_0'), 1);
        ai.x = nx; ai.y = ny;
        ai.stats.itemsUsed = (ai.stats.itemsUsed || 0) + 1;
        ai.nextActionAt = now + CONFIG.ACTION_CD;
        applyTileEffectOnMove(room, ai, now);
        computeVisibility(room, ai);
        return true;
      }
    }
  }
  if (ai.items.includes('item_1')) {
    const inDanger = room.tiles[ai.y][ai.x] === TILE.DANGER || room.tiles[ai.y][ai.x] === TILE.RUIN;
    if (inDanger || Math.random() < 0.1) {
      let best = null;
      let bestDist = -1;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]].sort(() => Math.random() - 0.5);
      for (const [dx, dy] of dirs) {
        for (let d = 1; d <= 5; d++) {
          const tx = ai.x + dx * d, ty = ai.y + dy * d;
          if (tx < 0 || ty < 0 || tx >= CONFIG.SIZE || ty >= CONFIG.SIZE) break;
          const t = room.tiles[ty][tx];
          if (t === TILE.OBSTACLE || t === TILE.RUIN || t === TILE.RIFT) break;
          if (t === TILE.NORMAL || t === TILE.RESOURCE) {
            if (d > bestDist && isWalkable(room, tx, ty, ai.id)) {
              bestDist = d; best = { x: tx, y: ty };
            }
          }
        }
      }
      if (best) {
        ai.items.splice(ai.items.indexOf('item_1'), 1);
        ai.x = best.x; ai.y = best.y;
        ai.stats.itemsUsed = (ai.stats.itemsUsed || 0) + 1;
        ai.nextActionAt = now + CONFIG.ACTION_CD;
        applyTileEffectOnMove(room, ai, now);
        computeVisibility(room, ai);
        return true;
      }
    }
  }
  if (ai.items.includes('item_4')) {
    const nearEnemy = [...room.players.values()].find(o => o !== ai && o.alive && Math.abs(o.x - ai.x) + Math.abs(o.y - ai.y) === 1);
    if (nearEnemy && ai.hp <= 2) {
      if (isValidRoadblockTarget(room, nearEnemy.x, nearEnemy.y)) {
         room.roadblocks.push({ x: nearEnemy.x, y: nearEnemy.y, until: now + CONFIG.ROADBLOCK_DURATION });
         ai.items.splice(ai.items.indexOf('item_4'), 1);
         ai.stats.itemsUsed = (ai.stats.itemsUsed || 0) + 1;
         ai.nextActionAt = now + CONFIG.ACTION_CD;
         addLog(room, ai.name + ' 放置了路障');
         return true;
      }
    }
  }
  return false;
}
function aiBigBoardDecision(room, ai, now) {
  if (ai.waitingRiftId || (room.small && (room.small.aId === ai.id || room.small.bId === ai.id)) || !ai.alive || now < ai.nextActionAt || ai.disoriented) return;
  
  if (Math.random() < 0.3) {
    ai.riftHints = ai.riftHints.filter(h => !h.fake);
  }

  if (aiTryUseItem(room, ai, now)) return;

  computeVisibility(room, ai);
  
  const inDanger = room.tiles[ai.y][ai.x] === TILE.DANGER || room.tiles[ai.y][ai.x] === TILE.RUIN;
  const myRing = ring(ai.x, ai.y, CONFIG.SIZE);
  const inCollapsingRing = room.collapse.started && myRing <= room.collapse.ring;
  const preferDX = Math.cos(ai.preferAngle), preferDY = Math.sin(ai.preferAngle);
  
  // 新增：如果血量和冷却允许，AI 会主动寻找裂隙（包括有人等待的裂隙）
  let targetRift = null;
  let minRiftDist = 99;
  if (ai.hp > 1 && now - ai.lastRiftAt > 10000) {
    for (const r of room.rifts) {
      if (r.state === 'OPEN' || r.state === 'WAITING') {
        const d = dist(ai, r);
        // 如果是有人等待的裂隙，优先级更高（距离权重放大）
        const weightDist = r.state === 'WAITING' ? d - 2 : d; 
        if (weightDist < minRiftDist) {
          minRiftDist = weightDist;
          targetRift = r;
        }
      }
    }
  }
  
  let best = null, bestScore = -Infinity;
  
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = ai.x + dx, ny = ai.y + dy;
    if (!isWalkable(room, nx, ny, ai.id)) continue;
    
    const newRing = ring(nx, ny, CONFIG.SIZE), t = room.tiles[ny][nx];
    let score = newRing * 1.2;
    
    if (t === TILE.DANGER) score -= 40;
    if (inDanger) score += 30;
    if (inCollapsingRing && newRing > myRing) score += 20;
    if (t === TILE.RESOURCE && ai.items.length < CONFIG.ITEM_CAP) score += 10;
    
    // 修复：裂隙判定，加上 WAITING 状态
    if (t === TILE.RIFT && ai.hp > 1 && now - ai.lastRiftAt > 10000) {
      const r = room.rifts.find(rr => rr.x === nx && rr.y === ny);
      if (r && (r.state === 'OPEN' || r.state === 'WAITING')) {
        // 如果是有人等待的裂隙（直接开打），给极高的权重
        if (r.state === 'WAITING') score += 60; 
        else score += (ai.items.length >= 2 ? 30 : 15);
      }
    }
    
    // 新增：如果存在目标裂隙，计算这一步是否在靠近裂隙
    if (targetRift && t !== TILE.RIFT) {
      const distToRift = Math.abs(targetRift.x - nx) + Math.abs(targetRift.y - ny);
      if (distToRift < minRiftDist) {
        score += 15; // 向裂隙靠近的步数，每靠近一格加 15 分
      }
    }
    
    let crowd = 0;
    for (const other of room.players.values()) {
      if (other.id !== ai.id && other.alive && dist(other, { x: nx, y: ny }) <= 2) crowd++;
    }
    const hpPenalty = (ai.hp <= 1) ? 30 : 0;
    score -= crowd * (5 + hpPenalty);
    
    if (dx * preferDX + dy * preferDY > 0.5) score += 2.5;
    score += Math.random() * 4;
    
    if (score > bestScore) { 
      bestScore = score; 
      best = { nx, ny }; 
    }
  }
  
  if (best) {
    ai.x = best.nx; ai.y = best.ny; ai.nextActionAt = now + CONFIG.ACTION_CD;
    if (room.tiles[ai.y][ai.x] === TILE.RESOURCE && ai.items.length < CONFIG.ITEM_CAP) {
      room.tiles[ai.y][ai.x] = TILE.NORMAL;
      ai.items.push(pick(ITEM_IDS));
      ai.stats.pickups = (ai.stats.pickups || 0) + 1;
    }
    if (room.tiles[ai.y][ai.x] === TILE.RIFT) {
      const r = room.rifts.find(rr => rr.x === ai.x && rr.y === ai.y);
      if (r && (r.state === 'OPEN' || r.state === 'WAITING')) {
         tryEnterRift(room, ai);
      }
    }
    else if (room.tiles[ai.y][ai.x] === TILE.TRANSPORT) {
      for (let t = 0; t < 50; t++) {
        const tx = Math.floor(Math.random() * CONFIG.SIZE), ty = Math.floor(Math.random() * CONFIG.SIZE);
        if (room.tiles[ty][tx] === TILE.NORMAL && isWalkable(room, tx, ty, ai.id)) { ai.x = tx; ai.y = ty; break; }
      }
    }
    computeVisibility(room, ai);
  } else {
    ai.nextActionAt = now + CONFIG.ACTION_CD;
  }
}

function getStateFor(room, playerId) {
  const now = Date.now(), me = room.players.get(playerId);
  let tilesForMe = !me ? room.tiles.map(row => row.map(() => -1)) : room.tiles.map((row, y) => row.map((t, x) => {
    const k = x + ',' + y;
    if (me.visible && me.visible.has(k)) return t;
    if (me.tileMemory && me.tileMemory[k] !== undefined) return -2 - me.tileMemory[k];
    return -1;
  }));

  const playersForMe = [];
  for (const p of room.players.values()) {
    const base = { id: p.id, name: p.name, color: p.color, alive: p.alive, isMe: p.id === playerId, isAI: !!p.isAI, winStreak: p.winStreak || 0, lossStreak: p.lossStreak || 0, hasRelic: !!p.relic, hasBlessing: !!p.pendingBlessing, hasPendingRelic: !!p.pendingRelic };
    if (!me || p.id === playerId || (me.visible && me.visible.has(p.x + ',' + p.y))) {
      Object.assign(base, {
        x: p.x, y: p.y, hp: p.hp, shields: p.shields || 0, cooldownRemaining: Math.max(0, p.nextActionAt - now), waitingRiftId: p.waitingRiftId,
        riftWaitRemaining: p.waitingRiftId ? Math.max(0, p.nextActionAt - now) : 0, fatigueRemaining: p.fatigueUntil ? Math.max(0, p.fatigueUntil - now) : 0,
        disoriented: p.disoriented && p.disorientedUntil > now ? true : false, hidden: false
      });
    } else base.hidden = true;
    playersForMe.push(base);
  }

  const insightActive = me && me.insightUntil && me.insightUntil > now;
  const riftsForMe = room.rifts.map(r => {
    if (insightActive) return { id: r.id, x: r.x, y: r.y, state: r.state };
    const k = r.x + ',' + r.y;
    if (!me || !me.tileMemory || me.tileMemory[k] === undefined) return null;
    return { id: r.id, x: r.x, y: r.y, state: me.visible && me.visible.has(k) ? r.state : 'UNKNOWN' };
  }).filter(r => r !== null);

  const exposedHints = [];
  if (me && me.alive) {
    for (const p of room.players.values()) {
      if (p.id === playerId || !p.alive || !p.exposedUntil || p.exposedUntil <= now) continue;
      const d = Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
      if (d > 10) continue;
      let dir = '附近';
      if (p.x > me.x + 2) dir = '东'; else if (p.x < me.x - 2) dir = '西'; else if (p.y > me.y + 2) dir = '南'; else if (p.y < me.y - 2) dir = '北';
      exposedHints.push({ dir, distLabel: d <= 3 ? '近' : d <= 6 ? '中' : '远' });
    }
  }

  const base = {
    code: room.code, mode: room.mode, size: CONFIG.SIZE, tiles: tilesForMe, serverNow: now, players: playersForMe,
    myItems: me ? me.items.slice() : [], myFragments: me ? (me.fragments || 0) : 0, myRelic: me ? me.relic || null : null,
    myPendingBlessing: me ? me.pendingBlessing : null, myPendingRelic: me ? me.pendingRelic : null,
    myHpRestoredThisGame: me ? !!me.hpRestoredThisGame : false, myRelicExchangedThisGame: me ? !!me.relicExchangedThisGame : false,
    myRiftHints: me ? me.riftHints.filter(h => h.until > now) : [], myFatigueRemaining: me ? (me.fatigueUntil ? Math.max(0, me.fatigueUntil - now) : 0) : 0,
    myScanRemaining: me && me.scanUntil ? Math.max(0, me.scanUntil - now) : 0, myVisionRemaining: me && me.visionBuffUntil ? Math.max(0, me.visionBuffUntil - now) : 0,
    myInsightRemaining: me && me.insightUntil ? Math.max(0, me.insightUntil - now) : 0,
    
    myDisoriented: me && me.disoriented && me.disorientedUntil > now ? true : false,
    myDisorientedRemaining: me && me.disoriented && me.disorientedUntil > now ? (me.disorientedUntil - now) : 0,

    exposedHints,
    roadblocks: room.roadblocks.filter(r => r.until > now && me && me.visible && me.visible.has(r.x + ',' + r.y)).map(r => ({ x: r.x, y: r.y })),
    rifts: riftsForMe,
    collapse: {
      started: room.collapse.started, done: room.collapse.done, ring: room.collapse.ring, totalRings: Math.floor(CONFIG.SIZE / 2),
      cellsLeft: room.collapse.cells.length, warnCell: room.collapse.warnCell, warnRemaining: room.collapse.warnCell ? Math.max(0, room.collapse.warnUntil - now) : 0,
      delayRemaining: !room.collapse.started ? Math.max(0, CONFIG.COLLAPSE_DELAY - (now - room.createdAt)) : 0
    },
    locked: room.locked, logs: room.logs.slice(-30), finalPhaseTriggered: room.finalPhaseTriggered, gameOver: room.gameOver,
    winnerId: room.winnerId, rankings: room.gameOver ? (room.rankings || computeRankings(room)) : null
  };
  const sm = room.small;
  if (sm && (sm.aId === playerId || sm.bId === playerId)) {
    const mySide = sm.aId === playerId ? 'a' : 'b', oppId = mySide === 'a' ? sm.bId : sm.aId, oppP = room.players.get(oppId);
    base.small = {
      mySide, myPos: mySide === 'a' ? sm.aPos : sm.bPos, oppPos: mySide === 'a' ? sm.bPos : sm.aPos, oppName: oppP ? oppP.name : '?',
      oppColor: oppP ? oppP.color : '#888', oppIsAI: oppP ? !!oppP.isAI : false, myScore: mySide === 'a' ? sm.aScore : sm.bScore, oppScore: mySide === 'a' ? sm.bScore : sm.aScore,
      controlPoints: sm.controlPoints, items: sm.items, myItems: mySide === 'a' ? sm.aItems : sm.bItems, myTrap: mySide === 'a' ? sm.aTrap : sm.bTrap,
      blockades: sm.blockades, blockedCp: sm.blockedCp, myStunned: mySide === 'a' ? sm.aStunned : sm.bStunned, myDashPenalty: mySide === 'a' ? sm.aDashPenalty : sm.bDashPenalty,
      myHoldPenalty: mySide === 'a' ? sm.aHoldPenalty : sm.bHoldPenalty, myInput: mySide === 'a' ? sm.aInput : sm.bInput, turnCount: sm.turnCount,
      inObserve: now < sm.nextTurnAt && sm.turnCount === 0, nextTurnAt: sm.nextTurnAt, endsAt: sm.endsAt, serverNow: now
    };
  }
  return base;
}
function broadcastState(room) {
  for (const p of room.players.values()) if (p.socketId) io.to(p.socketId).emit('state', getStateFor(room, p.id));
}

function joinRoom(room, socket, name) {
  if (room.locked || room.gameOver) return { ok: false, error: '游戏已开始，无法加入' };
  if (room.players.size >= CONFIG.MAX_PLAYERS) {
    const aiToKick = [...room.players.values()].find(p => p.isAI);
    if (aiToKick) { room.players.delete(aiToKick.id); addLog(room, aiToKick.name + ' 被新玩家替换'); }
    else return { ok: false, error: '房间已满' };
  }
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const idx = room.playerCounter++, spawn = findSpawn(room);
  const ip = getClientIpSocket(socket);
  
  const usedColors = [...room.players.values()].map(p => p.color);
  const availableColors = COLORS.filter(c => !usedColors.includes(c));
  const myColor = availableColors.length > 0 ? pick(availableColors) : pick(COLORS);

  // 根据随机到的颜色，反查对应的汉字名字
  let defaultName = '玩家' + (idx + 1);
  const colorIdx = COLORS.indexOf(myColor);
  if (colorIdx >= 0 && NAMES[colorIdx]) {
    defaultName = NAMES[colorIdx];
  }
  
  const safeName = (typeof name === 'string' ? name.trim().slice(0, 8) : '') || defaultName;

  const player = {
    id, socketId: socket.id, isAI: false, name: safeName, color: myColor, x: spawn.x, y: spawn.y, hp: CONFIG.HP, shields: 0, alive: true,
    joinAt: Date.now(),
    items: [], fragments: 0, relic: null, winStreak: 0, lossStreak: 0, pendingBlessing: null, pendingRelic: null, riftHints: [], waitingRiftId: null, riftKeyBuff: false,
    riftKeyPendingItem: false, riftRushBuff: false, riftRushPendingScore: false, harvestBuff: false, insightUntil: 0, scanUntil: 0, visionBuffUntil: 0, fatigueUntil: 0, exposedUntil: 0,
    disoriented: false, disorientedUntil: 0, hpRestoredThisGame: false, relicExchangedThisGame: false, lastRiftAt: 0, lastScoreAt: 0, nextActionAt: 0, lastDangerDmg: 0,
    visible: new Set(), tileMemory: {}, ip: ip, ua: socket.handshake.headers['user-agent'] || '',
    stats: { damageTaken: 0, killReason: null, deadAt: null, smallWins: 0, smallLosses: 0, pickups: 0, itemsUsed: 0, riftEnters: 0 }
  };
  room.players.set(id, player);
  room.peakPlayers = Math.max(room.peakPlayers, room.players.size);
  socket.data.roomCode = room.code; socket.data.playerId = id;
  computeVisibility(room, player);
  addLog(room, player.name + ' 加入房间');
  broadcastState(room);
  broadcastRoomList();

  const acc = getAccountFromSocket(socket);
  recordVisit('join', ip, player.name, room.code, player.ua, acc);
  console.log(`[${room.code}] [${acc}] ${player.name} 加入（${room.players.size}/${CONFIG.MAX_PLAYERS}）IP: ${ip}`);
  return { ok: true, playerId: id, code: room.code };
}
function getMyPlayer(socket) {
  if (!socket.data.roomCode) return null;
  const room = rooms.get(socket.data.roomCode);
  if (!room) return null;
  const p = room.players.get(socket.data.playerId);
  return p ? { room, player: p } : null;
}

/* ---------- Socket 事件 ---------- */
io.on('connection', socket => {
  const account = getAccountFromSocket(socket);
  recordVisit('connect', getClientIpSocket(socket), '', '', socket.handshake.headers['user-agent'], account);
  socket.emit('rooms_list', getRoomList());

  socket.on('list_rooms', (data, cb) => { if (cb) cb(getRoomList()); else socket.emit('rooms_list', getRoomList()); });

  socket.on('create_room', (data, cb) => {
    const room = createRoom(data && data.mode === 'FOG' ? 'FOG' : 'CLASSIC');
    if (!room) return cb && cb({ ok: false, error: '房间创建失败' });
    const res = joinRoom(room, socket, data && data.name);
    if (res.ok) recordVisit('create', getClientIpSocket(socket), data && data.name, room.code, socket.handshake.headers['user-agent'], account);
    cb && cb(res);
  });

  socket.on('join_room', (data, cb) => {
    const code = ((data && data.code) || '').toUpperCase().trim();
    if (!code || code.length !== 4) return cb && cb({ ok: false, error: '房间码格式错误' });
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: '房间不存在' });
    cb && cb(joinRoom(room, socket, data && data.name));
  });

  socket.on('move', (data, cb) => {
    const r = getMyPlayer(socket);
    if (!r) return cb && cb({ ok: false, error: '未加入房间' });
    const { room, player } = r;
    if (room.gameOver || !player.alive || player.waitingRiftId || room.small && (room.small.aId === player.id || room.small.bId === player.id)) return cb && cb({ ok: false, error: '当前不可移动' });

    const now = Date.now();
    if (now < player.nextActionAt) return cb && cb({ ok: false, error: '冷却中' });
    let dx = data && data.dx, dy = data && data.dy;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return cb && cb({ ok: false, error: '非法移动' });

    let disorientedNow = false;
    if (player.disoriented && now < player.disorientedUntil) {
      player.disoriented = false; player.disorientedUntil = 0; disorientedNow = true;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ddx, ddy]) => isWalkable(room, player.x + ddx, player.y + ddy, player.id));
      if (dirs.length > 0) { const [rdx, rdy] = pick(dirs); dx = rdx; dy = rdy; }
      else return cb && cb({ ok: false, error: '失控且四周不可走', disoriented: true });
    }

    const nx = player.x + dx, ny = player.y + dy;
    if (!isWalkable(room, nx, ny, player.id)) return cb && cb({ ok: false, error: '不可通行', disoriented: disorientedNow });

    player.x = nx; player.y = ny;
    player.nextActionAt = now + CONFIG.ACTION_CD + (player.fatigueUntil && player.fatigueUntil > now ? CONFIG.FATIGUE_EXTRA : 0);
    applyTileEffectOnMove(room, player, now); computeVisibility(room, player); broadcastState(room);
    cb && cb({ ok: true, disoriented: disorientedNow });
  });

  socket.on('use_item', (data, cb) => {
    const r = getMyPlayer(socket);
    if (!r) return cb && cb({ ok: false, error: '未加入房间' });
    const { room, player } = r;
    if (room.gameOver || !player.alive || room.small && (room.small.aId === player.id || room.small.bId === player.id)) return cb && cb({ ok: false, error: '当前不可使用' });

    const itemIdx = data && data.itemIdx;
    if (typeof itemIdx !== 'number' || itemIdx < 0 || itemIdx >= player.items.length) return cb && cb({ ok: false, error: '无效道具' });
    const itemId = player.items[itemIdx], now = Date.now();
    if (itemId !== 'item_0' && now < player.nextActionAt) return cb && cb({ ok: false, error: '冷却中' });

    const needsTarget = ITEM_SELECT_TARGET.includes(itemId), target = needsTarget ? (data && data.target) : null;
    const bumpUse = () => { player.stats.itemsUsed = (player.stats.itemsUsed || 0) + 1; };

    if (itemId === 'item_0') {
      if (!target || Math.abs(target.x - player.x) + Math.abs(target.y - player.y) !== 1 || !isWalkable(room, target.x, target.y, player.id)) return cb && cb({ ok: false, error: '目标非法' });
      player.items.splice(itemIdx, 1); bumpUse(); player.x = target.x; player.y = target.y;
      applyTileEffectOnMove(room, player, now); computeVisibility(room, player); broadcastState(room); return cb && cb({ ok: true });
    }
    if (itemId === 'item_1') {
      if (!target || target.x !== player.x && target.y !== player.y) return cb && cb({ ok: false, error: '需直线' });
      const d = Math.abs(target.x - player.x) + Math.abs(target.y - player.y);
      if (d < 1 || d > 5) return cb && cb({ ok: false, error: '距离1-5格' });
      if (!player.tileMemory || player.tileMemory[target.x + ',' + target.y] === undefined || !isWalkable(room, target.x, target.y, player.id)) return cb && cb({ ok: false, error: '目标非法' });
      player.items.splice(itemIdx, 1); bumpUse(); player.x = target.x; player.y = target.y;
      applyTileEffectOnMove(room, player, now); player.nextActionAt = now + CONFIG.ACTION_CD;
      computeVisibility(room, player); broadcastState(room); return cb && cb({ ok: true });
    }
    if (itemId === 'item_2') { player.items.splice(itemIdx, 1); bumpUse(); player.scanUntil = now + CONFIG.SCAN_DURATION; player.nextActionAt = now + CONFIG.ACTION_CD; computeVisibility(room, player); addLog(room, player.name + ' 使用扫描仪'); broadcastState(room); return cb && cb({ ok: true }); }
    if (itemId === 'item_3') { player.items.splice(itemIdx, 1); bumpUse(); player.shields = (player.shields || 0) + 1; player.nextActionAt = now + CONFIG.ACTION_CD; broadcastState(room); return cb && cb({ ok: true }); }
    if (itemId === 'item_4') {
      if (!target || Math.abs(target.x - player.x) + Math.abs(target.y - player.y) !== 1 || !isValidRoadblockTarget(room, target.x, target.y)) return cb && cb({ ok: false, error: '不可放置' });
      room.roadblocks.push({ x: target.x, y: target.y, until: now + CONFIG.ROADBLOCK_DURATION }); player.items.splice(itemIdx, 1); bumpUse(); player.nextActionAt = now + CONFIG.ACTION_CD; broadcastState(room); return cb && cb({ ok: true });
    }
    if (itemId === 'item_5') { player.items.splice(itemIdx, 1); bumpUse(); player.riftKeyBuff = true; player.nextActionAt = now + CONFIG.ACTION_CD; broadcastState(room); return cb && cb({ ok: true }); }
    if (itemId === 'item_6') {
      if (player.hp >= CONFIG.HP) return cb && cb({ ok: false, error: '满血' });
      player.hp = Math.min(CONFIG.HP, player.hp + 1); player.items.splice(itemIdx, 1); bumpUse(); player.nextActionAt = now + CONFIG.ACTION_CD; broadcastState(room); return cb && cb({ ok: true });
    }
    if (itemId === 'item_7') {
      player.items.splice(itemIdx, 1); bumpUse(); let count = 0;
      for (const other of room.players.values()) {
        if (other !== player && other.alive && dist(other, player) <= CONFIG.DECOY_RADIUS) {
          other.riftHints.push({ dir: pick(['东', '西', '南', '北']), until: now + CONFIG.DECOY_DURATION, fake: true }); count++;
        }
      }
      player.nextActionAt = now + CONFIG.ACTION_CD; addLog(room, player.name + ' 使用诱饵干扰器，影响 ' + count + ' 名玩家'); broadcastState(room); return cb && cb({ ok: true });
    }
    if (itemId === 'item_8') {
      player.items.splice(itemIdx, 1); bumpUse(); let count = 0;
      for (const other of room.players.values()) {
        if (other !== player && other.alive && Math.abs(other.x - player.x) <= 1 && Math.abs(other.y - player.y) <= 1) {
          other.disoriented = true; other.disorientedUntil = now + CONFIG.DISORIENT_DURATION; count++;
        }
      }
      player.nextActionAt = now + CONFIG.ACTION_CD; addLog(room, player.name + ' 使用失控干扰器，影响 ' + count + ' 名玩家'); broadcastState(room); return cb && cb({ ok: true });
    }
    cb && cb({ ok: false, error: '未知道具' });
  });

  socket.on('small_action', (data, cb) => {
    const r = getMyPlayer(socket);
    if (!r) return cb && cb({ ok: false, error: '未加入' });
    const { room, player } = r, sm = room.small;
    if (!sm || sm.aId !== player.id && sm.bId !== player.id) return cb && cb({ ok: false, error: '不在对决中' });
    if (Date.now() < sm.nextTurnAt && sm.turnCount === 0) return cb && cb({ ok: false, error: '观察期' });
    sm[(sm.aId === player.id ? 'a' : 'b') + 'Input'] = data || { type: 'hold' };
    broadcastState(room); cb && cb({ ok: true });
  });

  socket.on('choose_blessing', (data, cb) => {
    const r = getMyPlayer(socket);
    if (!r) return cb && cb({ ok: false });
    const { room, player } = r;
    if (!player.pendingBlessing) return cb && cb({ ok: false });
    const opt = player.pendingBlessing.options.find(o => o.id === (data && data.id));
    if (!opt) return cb && cb({ ok: false });
    applyBlessing(room, player, opt.id); player.pendingBlessing = null;
    addLog(room, player.name + ' 获得祝福「' + opt.name + '」'); computeVisibility(room, player); broadcastState(room); cb && cb({ ok: true });
  });

  socket.on('choose_relic', (data, cb) => {
    const r = getMyPlayer(socket);
    if (!r) return cb && cb({ ok: false });
    const { room, player } = r, idx = data && data.idx;
    if (!player.pendingRelic || typeof idx !== 'number' || idx < 0 || idx >= player.pendingRelic.length) return cb && cb({ ok: false });
    player.relic = player.pendingRelic[idx]; player.pendingRelic = null;
    broadcastState(room); cb && cb({ ok: true });
  });

  socket.on('fragment_exchange', (data, cb) => {
    const r = getMyPlayer(socket);
    if (!r) return cb && cb({ ok: false });
    const { room, player } = r, idx = data && data.idx;
    if (!player.alive || room.gameOver) return cb && cb({ ok: false });
    if (idx === 0) {
      if ((player.fragments || 0) < 2 || player.items.length >= CONFIG.ITEM_CAP) return cb && cb({ ok: false, error: '不可兑换' });
      player.fragments -= 2; player.items.push(pick(ITEM_IDS)); addLog(room, player.name + ' 用残片兑换了随机道具');
    } else if (idx === 1) {
      if ((player.fragments || 0) < 3 || (player.shields || 0) >= player.hp) return cb && cb({ ok: false, error: '不可兑换' });
      player.fragments -= 3; player.shields = Math.min(player.hp, (player.shields || 0) + 1); addLog(room, player.name + ' 用残片兑换了护盾');
    } else if (idx === 2) {
      if ((player.fragments || 0) < 4 || player.hpRestoredThisGame || player.hp >= CONFIG.HP) return cb && cb({ ok: false, error: '不可兑换' });
      player.fragments -= 4; player.hp = Math.min(CONFIG.HP, player.hp + 1); player.hpRestoredThisGame = true; addLog(room, player.name + ' 用残片恢复了 1 血');
    } else if (idx === 3) {
      if ((player.fragments || 0) < 5 || player.relicExchangedThisGame) return cb && cb({ ok: false, error: '不可兑换' });
      player.fragments -= 5; player.relic = pick(SMALL_ITEM_TYPES); player.relicExchangedThisGame = true; addLog(room, player.name + ' 用残片兑换了信物');
    } else return cb && cb({ ok: false });
    broadcastState(room); cb && cb({ ok: true });
  });

  socket.on('disconnect', () => {
    const r = getMyPlayer(socket);
    if (!r) return;
    const { room, player } = r;
    if (room.small && (room.small.aId === player.id || room.small.bId === player.id)) {
      const sm = room.small, oppId = sm.aId === player.id ? sm.bId : sm.aId, opp = room.players.get(oppId);
      if (opp) opp.hp = Math.min(CONFIG.HP, opp.hp + 1);
      const rift = room.rifts.find(r => r.id === sm.riftId);
      if (rift) { rift.state = 'COOLDOWN'; rift.cooldownUntil = Date.now() + CONFIG.RIFT_COOLDOWN; }
      room.small = null; addLog(room, player.name + ' 在小棋盘中断线，对手获胜');
    }
    addLog(room, player.name + ' 离开房间');
    room.players.delete(player.id);
    if (![...room.players.values()].some(p => !p.isAI)) {
      rooms.delete(room.code); console.log(`[${room.code}] 无真人，房间销毁`);
    } else broadcastState(room);
    broadcastRoomList();
    
    recordVisit('leave', player.ip || '', player.name, room.code, player.ua || '', getAccountFromSocket(socket));
  });
});

/* ---------- 主循环 ---------- */
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    let changed = false;
    const rbBefore = room.roadblocks.length;
    room.roadblocks = room.roadblocks.filter(r => r.until > now);
    if (room.roadblocks.length !== rbBefore) changed = true;

    if (riftTick(room, now)) changed = true;

    if (!room.gameOver) {
      if (!room.collapse.started) {
        if (now - room.createdAt >= CONFIG.COLLAPSE_DELAY) { startCollapse(room, now); changed = true; }
      } else if (!room.collapse.done) {
        if (collapseTick(room, now)) changed = true;
      }
      for (const p of room.players.values()) {
        if (!p.alive || room.small && (room.small.aId === p.id || room.small.bId === p.id)) continue;
        if (room.tiles[p.y][p.x] === TILE.DANGER) {
          if (now - p.lastDangerDmg >= CONFIG.DANGER_DMG) { p.lastDangerDmg = now; damagePlayer(room, p, 1, '危险区侵蚀'); changed = true; }
        } else p.lastDangerDmg = 0;
      }
    }

    if (room.small && smallTick(room, now)) changed = true;

    for (const p of room.players.values()) if (tryDisorientAutoMove(room, p, now)) changed = true;
    for (const p of room.players.values()) {
      if (p.alive) computeVisibility(room, p); else p.visible = new Set();
    }

    if (!room.gameOver) {
      if (checkFinalPhase(room)) changed = true;
      if (!room.gameOver) {
        const alive = [...room.players.values()].filter(p => p.alive);
        if (room.peakPlayers >= 2 && alive.length <= 1) {
          room.gameOver = true; room.winnerId = alive[0] ? alive[0].id : null; room.rankings = computeRankings(room);
          addLog(room, '游戏结束，胜者：' + (alive[0] ? alive[0].name : '无人'));
          changed = true; broadcastRoomList();
        }
      }
    }
    if (changed) broadcastState(room);
  }
}, 100);

/* ---------- AI 决策循环与资源补给（保留原样） ---------- */
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.gameOver) continue;
    for (const p of room.players.values()) if (p.isAI && p.alive) aiBigBoardDecision(room, p, now);
  }
}, CONFIG.AI_TICK);

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.gameOver || now - room.lastResourceSupply < CONFIG.RESOURCE_SUPPLY_INTERVAL) continue;
    room.lastResourceSupply = now;
    const alive = [...room.players.values()].filter(p => p.alive);
    if (alive.length <= 1) continue;
    const minHp = Math.min(...alive.map(p => p.hp));
    let changed = false;
    for (const p of alive.filter(q => q.hp === minHp)) {
      const candidates = [], R = CONFIG.RESOURCE_SUPPLY_RANGE;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > R) continue;
        const tx = p.x + dx, ty = p.y + dy;
        if (tx < 0 || ty < 0 || tx >= CONFIG.SIZE || ty >= CONFIG.SIZE || room.tiles[ty][tx] !== TILE.NORMAL) continue;
        if (room.roadblocks.some(r => r.x === tx && r.y === ty && r.until > now) || [...room.players.values()].some(q => q.alive && q.x === tx && q.y === ty)) continue;
        candidates.push({ x: tx, y: ty });
      }
      if (candidates.length > 0) { const c = pick(candidates); room.tiles[c.y][c.x] = TILE.RESOURCE; changed = true; }
    }
    if (changed) broadcastState(room);
  }
}, 1000);

/* ---------- 启动 ---------- */
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces(), ips = [];
  for (const name of Object.keys(nets)) for (const net of nets[name]) if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
  console.log('');
  console.log('========================================');
  console.log('  裂隙棋盘 联机服务器（v9 账号安全版）');
  console.log('========================================');
  console.log('');
  console.log('  本机访问：http://localhost:' + PORT);
  if (ips.length) {
    console.log('  局域网地址（发给朋友）：');
    ips.forEach(ip => console.log('    http://' + ip + ':' + PORT));
  }
  console.log('');
  console.log('  按 Ctrl+C 关闭服务器');
  console.log('========================================');
  console.log('');
});