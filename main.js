'use strict';
const { app, BrowserWindow, ipcMain, session, webContents, Menu, clipboard, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { isBlocked } = require('./src/main/adblock');

const WEB_PARTITION = 'persist:web';

// ---------- Config (נשמר בצד ה-main כדי שיהיה זמין לפני הפעלת Chromium) ----------
const CONFIG_PATH = path.join(app.getPath('userData'), 'webrix-config.json');
const DEFAULTS = { adblock: true, adblockAllow: [], gpuBoost: true, netLimitOn: false, netLimitMbps: 20 };
let config = loadConfig();
function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}
function saveConfig() {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* ignore */ }
}

// ---------- דגלי ביצועים של Chromium ----------
if (config.gpuBoost) {
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
app.commandLine.appendSwitch('enable-features', 'BackForwardCache,ParallelDownloading');
nativeTheme.themeSource = 'dark';

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

function createWindow() {
  const isMac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 560,
    frame: isMac, titleBarStyle: isMac ? 'hiddenInset' : undefined,
    backgroundColor: '#0a0a12', show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webviewTag: true, spellcheck: false
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  const state = () => send('win:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
  ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'].forEach(e => win.on(e, state));
  win.on('closed', () => { win = null; });
}

// ---------- Adblock + Session ----------
let blockedTotal = 0;
const blockedPer = new Map();
const pending = new Map();
let flushTimer = null;
function noteBlocked(id) {
  blockedTotal++;
  if (id != null) {
    const n = (blockedPer.get(id) || 0) + 1;
    blockedPer.set(id, n);
    pending.set(id, n);
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      send('adblock:count', { per: Object.fromEntries(pending), total: blockedTotal });
      pending.clear();
    }, 250);
  }
}

function topHost(id) {
  try {
    const wc = id != null ? webContents.fromId(id) : null;
    return wc ? new URL(wc.getURL()).hostname : '';
  } catch { return ''; }
}

function applyNetLimit(ses) {
  if (config.netLimitOn) {
    const bps = Math.max(0.25, Number(config.netLimitMbps) || 1) * 1024 * 1024 / 8;
    ses.enableNetworkEmulation({ latency: 0, downloadThroughput: bps, uploadThroughput: bps });
  } else {
    ses.disableNetworkEmulation();
  }
}

function setupSession(ses) {
  // User-Agent נקי (אתרים כמו WhatsApp/Discord חוסמים "Electron")
  ses.setUserAgent(ses.getUserAgent()
    .replace(/\sElectron\/\S+/i, '')
    .replace(/\s(Webrix|WEBRIX|webrix-browser)\/\S+/i, ''));

  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) => {
    if (!config.adblock || d.resourceType === 'mainFrame') return cb({});
    let host;
    try { host = new URL(d.url).hostname; } catch { return cb({}); }
    if (!isBlocked(host)) return cb({});
    const th = topHost(d.webContentsId);
    if (th && config.adblockAllow.includes(th)) return cb({});
    noteBlocked(d.webContentsId);
    cb({ cancel: true });
  });

  ses.setPermissionRequestHandler((wc, perm, cb) => {
    const allowed = ['fullscreen', 'pointerLock', 'media', 'notifications', 'clipboard-sanitized-write', 'display-capture', 'keyboardLock'];
    cb(allowed.includes(perm));
  });

  ses.on('will-download', (e, item) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = item.getFilename();
    send('dl', { id, name, state: 'progressing', total: item.getTotalBytes(), received: 0 });
    item.on('updated', (ev, state) => send('dl', { id, name, state, total: item.getTotalBytes(), received: item.getReceivedBytes() }));
    item.once('done', (ev, state) => send('dl', { id, name, state: state === 'completed' ? 'done' : state, path: item.getSavePath(), total: item.getTotalBytes(), received: item.getReceivedBytes() }));
  });

  applyNetLimit(ses);
}

// ---------- קיצורי מקלדת (עובדים גם כשהפוקוס בתוך אתר) ----------
function matchShortcut(i) {
  if (i.type !== 'keyDown') return null;
  const c = i.control || i.meta, a = i.alt, s = i.shift;
  const k = (i.key || '').toLowerCase();
  if (c && !a) {
    if (k === 't') return s ? 'reopen' : 'newtab';
    if (k === 'w') return 'close';
    if (k === 'tab') return s ? 'prev' : 'next';
    if (k === 'l') return 'focus-url';
    if (k === 'r') return s ? 'hard-reload' : 'reload';
    if (k === 'f') return 'find';
    if (k === 'd') return 'bookmark';
    if (k === ',') return 'settings';
    if (k === 'g' && s) return 'gamemode';
    if (k === 'b' && s) return 'sidebar';
    if (k === 'p' && s) return 'core';
    if (k === '=' || k === '+') return 'zoom-in';
    if (k === '-') return 'zoom-out';
    if (k === '0') return 'zoom-reset';
    if (/^[1-9]$/.test(k)) return 'tab-' + k;
  }
  if (a && !c) {
    if (k === 'arrowleft') return 'back';
    if (k === 'arrowright') return 'forward';
    if (k === 'home') return 'home';
  }
  if (!c && !a) {
    if (k === 'f5') return 'reload';
    if (k === 'f11') return 'fullscreen';
    if (k === 'f12') return 'devtools';
  }
  return null;
}

function contextMenu(wc, p) {
  const t = [];
  const sep = { type: 'separator' };
  if (p.linkURL) {
    t.push({ label: 'פתח קישור בכרטיסייה חדשה', click: () => send('tab:open', { url: p.linkURL, background: true }) },
      { label: 'העתק כתובת קישור', click: () => clipboard.writeText(p.linkURL) }, sep);
  }
  if (p.hasImageContents && p.srcURL) {
    t.push({ label: 'פתח תמונה בכרטיסייה חדשה', click: () => send('tab:open', { url: p.srcURL, background: true }) },
      { label: 'העתק תמונה', click: () => wc.copyImageAt(p.x, p.y) },
      { label: 'שמור תמונה בשם…', click: () => wc.downloadURL(p.srcURL) }, sep);
  }
  if (p.isEditable) {
    t.push({ label: 'גזור', click: () => wc.cut() }, { label: 'העתק', click: () => wc.copy() },
      { label: 'הדבק', click: () => wc.paste() }, { label: 'בחר הכל', click: () => wc.selectAll() }, sep);
  } else if (p.selectionText) {
    const q = p.selectionText.trim();
    t.push({ label: 'העתק', click: () => wc.copy() },
      { label: `חפש "${q.length > 24 ? q.slice(0, 24) + '…' : q}"`, click: () => send('search', q) }, sep);
  }
  const nh = wc.navigationHistory;
  t.push({ label: 'אחורה', enabled: nh.canGoBack(), click: () => nh.goBack() },
    { label: 'קדימה', enabled: nh.canGoForward(), click: () => nh.goForward() },
    { label: 'רענן', click: () => wc.reload() }, sep,
    { label: 'בדוק אלמנט', click: () => wc.inspectElement(p.x, p.y) });
  Menu.buildFromTemplate(t).popup({ window: win });
}

app.on('web-contents-created', (e, contents) => {
  contents.on('will-attach-webview', (ev, prefs) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.backgroundThrottling = true;
  });
  contents.on('before-input-event', (ev, input) => {
    const s = matchShortcut(input);
    if (s) { ev.preventDefault(); send('shortcut', s); }
  });
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url, disposition }) => {
      // חלונות התחברות (OAuth) נשארים פופאפ אמיתי; כל השאר נפתח ככרטיסייה
      if (disposition === 'new-window') {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#0a0a12' } };
      }
      send('tab:open', { url, background: disposition === 'background-tab' });
      return { action: 'deny' };
    });
    contents.on('context-menu', (ev, params) => contextMenu(contents, params));
    contents.on('did-start-navigation', (ev) => {
      if (ev.isMainFrame && !ev.isSameDocument) blockedPer.delete(contents.id);
    });
  }
});

// ---------- IPC ----------
ipcMain.on('win:min', () => win?.minimize());
ipcMain.on('win:max', () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('win:close', () => win?.close());
ipcMain.on('win:fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
ipcMain.on('dl:show', (e, p) => { if (p) shell.showItemInFolder(p); });

ipcMain.handle('config:set', (e, patch) => {
  const before = { ...config };
  config = { ...config, ...patch };
  saveConfig();
  if (before.netLimitOn !== config.netLimitOn || before.netLimitMbps !== config.netLimitMbps) {
    applyNetLimit(session.fromPartition(WEB_PARTITION));
  }
  return config;
});

ipcMain.handle('metrics', () => {
  const m = app.getAppMetrics();
  const cores = os.cpus().length || 1;
  const byPid = new Map(m.map(x => [x.pid, x]));
  let mem = 0, cpu = 0;
  for (const x of m) { mem += x.memory.workingSetSize; cpu += x.cpu.percentCPUUsage; }
  const per = {};
  for (const wc of webContents.getAllWebContents()) {
    if (wc.getType() !== 'webview') continue;
    const p = byPid.get(wc.getOSProcessId());
    if (p) per[wc.id] = { mem: Math.round(p.memory.workingSetSize / 1024), cpu: +(p.cpu.percentCPUUsage / cores).toFixed(1) };
  }
  return {
    mem: Math.round(mem / 1024), cpu: +(cpu / cores).toFixed(1), procs: m.length, per,
    sysTotal: Math.round(os.totalmem() / 1048576), sysFree: Math.round(os.freemem() / 1048576),
    blockedTotal
  };
});

ipcMain.handle('clear-data', async () => {
  const ses = session.fromPartition(WEB_PARTITION);
  await ses.clearCache();
  await ses.clearStorageData();
  return true;
});

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  setupSession(session.fromPartition(WEB_PARTITION));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
