'use strict';
const { app, BrowserWindow, ipcMain, session, webContents, Menu, clipboard, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { isBlocked } = require('./src/main/adblock');

const WEB_PARTITION = 'persist:web';

// ---------- Config (נשמר בצד ה-main כדי שיהיה זמין לפני הפעלת Chromium) ----------
const CONFIG_PATH = path.join(app.getPath('userData'), 'webrix-config.json');
const DEFAULTS = { adblock: true, adblockAllow: [], gpuBoost: true, netLimitOn: false, netLimitMbps: 20, autoCheckUpdates: true, sitePerms: {}, bounds: null };
let config = loadConfig();
function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}
let saveTimer = null;
function saveConfig(now = false) {
  // כתיבה מושהית: כמה שינויים רצופים נכתבים לדיסק פעם אחת
  clearTimeout(saveTimer);
  const write = () => { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* ignore */ } };
  if (now) write(); else saveTimer = setTimeout(write, 400);
}

// ---------- דגלי ביצועים של Chromium ----------
if (config.gpuBoost) {
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
app.commandLine.appendSwitch('enable-features', 'BackForwardCache,ParallelDownloading');
nativeTheme.themeSource = 'dark';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null;
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

function validBounds(b) {
  if (!b || !(b.width >= 900 && b.height >= 560)) return null;
  const { screen } = require('electron');
  // החלון חייב להיות לפחות חלקית על מסך שקיים עכשיו (למשל אחרי ניתוק מסך שני)
  const onScreen = screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x < a.x + a.width - 100 && b.x + b.width > a.x + 100 && b.y >= a.y - 20 && b.y < a.y + a.height - 100;
  });
  return onScreen ? b : null;
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const saved = validBounds(config.bounds);
  win = new BrowserWindow({
    width: saved?.width || 1440, height: saved?.height || 900,
    ...(saved ? { x: saved.x, y: saved.y } : {}),
    minWidth: 900, minHeight: 560,
    frame: isMac, titleBarStyle: isMac ? 'hiddenInset' : undefined,
    // מוצג מיד עם רקע כהה, במקום לחכות שכל הממשק ייבנה: הפתיחה מרגישה מיידית
    backgroundColor: '#0a0a12', show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webviewTag: true, spellcheck: false,
      v8CacheOptions: 'bypassHeatCheck'   // שומר קוד מקומפל כבר מההפעלה הראשונה
    }
  });
  Menu.setApplicationMenu(null);
  if (saved?.maximized) win.maximize();
  win.show();
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  const state = () => send('win:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
  ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'].forEach(e => win.on(e, state));
  const rememberBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const b = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    config.bounds = { ...b, maximized: win.isMaximized() };
    saveConfig();
  };
  ['resize', 'move', 'maximize', 'unmaximize'].forEach(e => win.on(e, rememberBounds));
  win.on('close', () => { rememberBounds(); saveConfig(true); });
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

// חוסם הפרסומות מחובר לבקשות רק כשהוא פעיל: כשהוא כבוי אין שום עלות לכל בקשה
let adblockAttached = false;
function applyAdblock(ses) {
  if (config.adblock && !adblockAttached) {
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) => {
      if (d.resourceType === 'mainFrame') return cb({});
      let host;
      try { host = new URL(d.url).hostname; } catch { return cb({}); }
      if (!isBlocked(host)) return cb({});
      if (config.adblockAllow.length) {
        const th = topHost(d.webContentsId);
        if (th && config.adblockAllow.includes(th)) return cb({});
      }
      noteBlocked(d.webContentsId);
      cb({ cancel: true });
    });
    adblockAttached = true;
  } else if (!config.adblock && adblockAttached) {
    ses.webRequest.onBeforeRequest(null);
    adblockAttached = false;
  }
}

// ---------- הרשאות אתרים ----------
// מסך מלא, נעילת עכבר (משחקים) והעתקה מותרים תמיד. מצלמה, מיקרופון, שיתוף מסך, התראות ומיקום:
// האתר מבקש והמשתמש מאשר או חוסם. אפשר לזכור את הבחירה לכל אתר.
const PERM_AUTO = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write']);
const PERM_ASK = new Set(['media', 'notifications', 'display-capture', 'geolocation', 'midi', 'midiSysex']);
const permPending = new Map();
let permSeq = 0;
const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
function setupPermissions(ses) {
  ses.setPermissionRequestHandler((wc, perm, cb, details = {}) => {
    if (PERM_AUTO.has(perm)) return cb(true);
    if (!PERM_ASK.has(perm)) return cb(false);
    const origin = originOf(details.requestingUrl || wc.getURL());
    if (!origin) return cb(false);
    const media = (details.mediaTypes || []).filter(Boolean);
    const key = `${origin}|${perm}${media.length ? ':' + [...media].sort().join('+') : ''}`;
    if (key in config.sitePerms) return cb(config.sitePerms[key]);
    const id = ++permSeq;
    const timer = setTimeout(() => { if (permPending.has(id)) { permPending.delete(id); cb(false); send('perm:cancel', { id }); } }, 60000);
    permPending.set(id, { cb, key, timer });
    send('perm:ask', { id, origin, perm, media });
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => {
    if (!PERM_ASK.has(perm)) return true;
    const o = originOf(origin);
    return Object.entries(config.sitePerms).some(([k, v]) => v === true && k.startsWith(`${o}|${perm}`));
  });
}
ipcMain.on('perm:answer', (e, { id, allow, remember }) => {
  const p = permPending.get(id);
  if (!p) return;
  permPending.delete(id);
  clearTimeout(p.timer);
  if (remember) { config.sitePerms = { ...config.sitePerms, [p.key]: !!allow }; saveConfig(); }
  p.cb(!!allow);
});
ipcMain.handle('perm:list', () => config.sitePerms);
ipcMain.handle('perm:clear', () => { config.sitePerms = {}; saveConfig(); return true; });

function setupSession(ses) {
  // User-Agent נקי (אתרים כמו WhatsApp/Discord חוסמים "Electron")
  ses.setUserAgent(ses.getUserAgent()
    .replace(/\sElectron\/\S+/i, '')
    .replace(/\s(Webrix|WEBRIX|webrix-browser)\/\S+/i, ''));

  applyAdblock(ses);
  setupPermissions(ses);

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
    // רק מהחלון הראשי ומהאתרים שבתוכו: לא מחלון התחברות קופץ ולא מכלי המפתחים
    const ours = (win && contents === win.webContents) || (contents.getType() === 'webview' && win && contents.hostWebContents === win.webContents);
    if (!ours) return;
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
  const ses = session.fromPartition(WEB_PARTITION);
  if (before.netLimitOn !== config.netLimitOn || before.netLimitMbps !== config.netLimitMbps) applyNetLimit(ses);
  if (before.adblock !== config.adblock) applyAdblock(ses);
  return { ok: true };
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

// ---------- עדכונים (Windows, דרך GitHub Releases) ----------
// לא מוריד ולא מתקין כלום לבד: בודק, מודיע, ומוריד/מתקין רק כשהמשתמש לוחץ.
// נטען רק אחרי שהחלון כבר פתוח: הספרייה כבדה ואין סיבה שתעכב את ההפעלה
let updater = null;
function loadUpdater() {
  if (updater) return updater;
  try { updater = require('electron-updater').autoUpdater; } catch { updater = null; }
  return updater;
}
const upd = { state: 'idle', info: null, progress: null, error: null, checkedAt: null };
function updSend(patch) { Object.assign(upd, patch); send('update:state', upd); }
function cleanInfo(i) {
  if (!i) return null;
  let notes = i.releaseNotes;
  if (Array.isArray(notes)) notes = notes.map(n => n.note || '').join('\n');
  notes = String(notes || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d|div)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
  return { version: i.version, date: i.releaseDate || null, notes: notes.slice(0, 4000) };
}
let updaterReady = false;
function setupUpdater() {
  if (updaterReady) return;
  updaterReady = true;
  if (!loadUpdater()) { updSend({ state: 'unavailable' }); return; }
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;   // עדכון שכבר ירד יותקן כשסוגרים את הדפדפן
  updater.allowPrerelease = false;
  updater.on('checking-for-update', () => updSend({ state: 'checking', error: null }));
  updater.on('update-available', info => updSend({ state: 'available', info: cleanInfo(info), checkedAt: Date.now() }));
  updater.on('update-not-available', () => updSend({ state: 'latest', checkedAt: Date.now() }));
  updater.on('download-progress', p => updSend({
    state: 'downloading',
    progress: { percent: p.percent, bps: p.bytesPerSecond, transferred: p.transferred, total: p.total }
  }));
  updater.on('update-downloaded', info => updSend({ state: 'downloaded', info: cleanInfo(info) || upd.info }));
  updater.on('error', err => updSend({ state: 'error', error: String((err && err.message) || err).slice(0, 300) }));
}
async function checkUpdates() {
  setupUpdater();
  if (!updater) return upd;
  if (!app.isPackaged) { updSend({ state: 'dev' }); return upd; }
  if (['checking', 'downloading', 'downloaded'].includes(upd.state)) return upd;
  try { await updater.checkForUpdates(); }
  catch (e) { updSend({ state: 'error', error: String(e.message || e).slice(0, 300) }); }
  return upd;
}
ipcMain.handle('update:get', () => ({ ...upd, version: app.getVersion(), packaged: app.isPackaged }));
ipcMain.handle('update:check', () => checkUpdates());
ipcMain.handle('update:download', async () => {
  if (!updater || upd.state !== 'available') return upd;
  updSend({ state: 'downloading', progress: { percent: 0, bps: 0, transferred: 0, total: 0 } });
  try { await updater.downloadUpdate(); }
  catch (e) { updSend({ state: 'error', error: String(e.message || e).slice(0, 300) }); }
  return upd;
});
ipcMain.on('update:install', () => {
  // התקנה שקטה והפעלה מחדש של הדפדפן אחרי העדכון
  if (!updater || upd.state !== 'downloaded') return;
  updSend({ state: 'installing' });
  saveConfig(true);
  setTimeout(() => updater.quitAndInstall(true, true), 600);   // זמן להציג "מתעדכן…" לפני הסגירה
});

ipcMain.handle('clear-data', async () => {
  const ses = session.fromPartition(WEB_PARTITION);
  await ses.clearCache();
  await ses.clearStorageData();
  return true;
});

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  if (!gotLock) return;
  setupSession(session.fromPartition(WEB_PARTITION));
  createWindow();
  setTimeout(setupUpdater, 3000);                // רכיב העדכונים נטען אחרי שהדפדפן כבר פתוח
  const autoCheck = () => { if (config.autoCheckUpdates !== false) checkUpdates(); };
  setTimeout(autoCheck, 10000);                  // בדיקה אחרי ההפעלה
  setInterval(autoCheck, 6 * 60 * 60 * 1000);    // ושוב כל 6 שעות
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
