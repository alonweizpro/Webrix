'use strict';
/* ============ Helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function hexToRgb(hex) {
  const h = (hex || '#000').replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(f.slice(0, 6), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const fmtMB = (mb) => mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB';

const NEWTAB = 'webrix://newtab';
const WELCOME = 'webrix://welcome';
const INTERNAL_TITLES = { [NEWTAB]: 'כרטיסייה חדשה', [WELCOME]: 'Welcome' };
const isInternal = (u) => u in INTERNAL_TITLES;

/* אייקוני ממשק (קו אחיד) */
const ICONS = {
  ram: '<rect x="2.5" y="7" width="19" height="9" rx="1.5"/><path d="M6.5 10.5v2M10 10.5v2M14 10.5v2M17.5 10.5v2M5 16v3M9.5 16v3M14.5 16v3M19 16v3"/>',
  cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="10" y="10" width="4" height="4" rx=".5"/><path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  tabs: '<rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M3 9.5h18M9 5v4.5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'
};
const icon = (n) => `<svg viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;

/* אייקון אתר באיכות גבוהה, שתמיד נראה על רקע כהה.
   סדר מקורות: אייקון אפליקציה (apple-touch, ‏180px) ← favicon ‏128px ← האייקון שהאתר עצמו דיווח ← favicon.ico ← אות.
   מקור שמחזיר תמונת ברירת מחדל קטנה (כמו גלובוס 16px) נדחה אוטומטית.
   אייקון שקוף מוצג על לוחית בהירה, כך שגם לוגו שחור (GitHub) או כהה (IGN) נראה. */
function siteIcon(url, stored, label) {
  const h = hostOf(url);
  const wrap = el('span', 'si');
  const src = [
    { u: `https://${h}/apple-touch-icon.png`, full: true, min: 96 },
    { u: `https://www.google.com/s2/favicons?domain=${h}&sz=128`, min: 32 },
    stored && { u: stored, min: 16 },
    { u: `https://${h}/favicon.ico`, min: 16 }
  ].filter(Boolean);
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.draggable = false;
  let i = -1;
  const next = () => {
    if (++i >= src.length) {
      img.remove();
      wrap.className = 'si letter';
      wrap.textContent = ((label || h.replace(/^www\./, ''))[0] || '?').toUpperCase();
      return;
    }
    img.src = src[i].u;
  };
  img.onload = () => {
    if (img.naturalWidth < src[i].min) { next(); return; }
    wrap.className = 'si ' + (src[i].full ? 'full' : 'plate');
  };
  img.onerror = next;
  wrap.append(img);
  next();
  return wrap;
}

/* אייקון אמיתי של אתר: אייקון שנשמר מהאתר עצמו ← שירות favicons ← favicon.ico ← אייקון גלובוס */
function favImg(url, stored, onFail) {
  const h = hostOf(url);
  const src = [stored, `https://icons.duckduckgo.com/ip3/${h}.ico`, `https://${h}/favicon.ico`].filter(Boolean);
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.draggable = false;
  let i = 0;
  img.onerror = () => { if (++i < src.length) img.src = src[i]; else onFail?.(img); };
  img.src = src[0];
  return img;
}
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/* ============ Themes & options ============ */
const THEMES = {
  neon:    { name: 'Neon Rush',    accent: '#ff2a6d', accent2: '#05d9e8', bg: '#0a0a12', surface: '#15151f', text: '#ecebf5' },
  crimson: { name: 'Crimson Core', accent: '#ff1f3d', accent2: '#ff8a00', bg: '#0d0708', surface: '#1b0e10', text: '#f6eaeb' },
  toxic:   { name: 'Toxic',        accent: '#39ff14', accent2: '#c6ff00', bg: '#060b06', surface: '#0f1a10', text: '#e8f5e6' },
  arctic:  { name: 'Arctic',       accent: '#3ec5ff', accent2: '#b388ff', bg: '#070b12', surface: '#101826', text: '#e6f1ff' },
  synth:   { name: 'Synthwave',    accent: '#ff00c8', accent2: '#7b2bff', bg: '#0c0614', surface: '#1a0e2a', text: '#f3e8ff' },
  solar:   { name: 'Solar Gold',   accent: '#ffc400', accent2: '#ff6d00', bg: '#0d0a04', surface: '#1c160a', text: '#fff6e0' },
  ocean:   { name: 'Deep Ocean',   accent: '#00e5c3', accent2: '#0091ff', bg: '#03100f', surface: '#082220', text: '#e0fbf6' },
  stealth: { name: 'Stealth',      accent: '#e6e6e6', accent2: '#7a7a8c', bg: '#09090b', surface: '#141417', text: '#e9e9ee' }
};

const SEARCH_ENGINES = {
  google:     { name: 'Google',       url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo',   url: 'https://duckduckgo.com/?q=' },
  brave:      { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  bing:       { name: 'Bing',         url: 'https://www.bing.com/search?q=' },
  startpage:  { name: 'Startpage',    url: 'https://www.startpage.com/do/search?q=' }
};

const FONTS = {
  '"Segoe UI", system-ui, sans-serif': 'System',
  'Bahnschrift, "DIN Alternate", "Segoe UI", sans-serif': 'Bahnschrift (Gamer)',
  '"Cascadia Code", Consolas, "SF Mono", monospace': 'Mono / Terminal',
  '"Trebuchet MS", sans-serif': 'Trebuchet',
  'Rubik, Assistant, Heebo, Arial, sans-serif': 'Rubik / Heebo',
  'Georgia, serif': 'Serif'
};

const DARK_CSS = `html{filter:invert(.9) hue-rotate(180deg)!important;background:#fff!important}
img,video,picture,canvas,iframe,embed,object,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}`;
const COSMETIC_ADS_CSS = `.adsbygoogle,ins.adsbygoogle,[id^="google_ads_iframe"],[id^="div-gpt-ad"],iframe[src*="doubleclick.net"],
iframe[src*="googlesyndication"],.ad-banner,.ad-slot,.advertisement,[data-ad-slot],[data-google-query-id],.taboola,#taboola-below-article-thumbnails,.OUTBRAIN{display:none!important}`;

const DEFAULTS = {
  firstRun: true, setupDone: false, showWelcomeTab: true,
  theme: 'neon', ...THEMES.neon,
  designV: 3, wallpaperMode: 'none', wallpaper: '', wallpaperDim: 0.55,
  glass: 1, blur: 0, radius: 10, font: '"Segoe UI", system-ui, sans-serif',
  density: 'normal', tabStyle: 'rounded', showSidebar: true, sidePanelWidth: 400,
  // כרטיסייה חדשה
  ntClockStyle: 'digital', ntClockFont: 'roboto', ntClockWeight: 300, ntClockSize: 100, ntClockColor: 'text',
  ntClock24: true, ntSeconds: false, ntGreeting: true, ntGreetName: '', ntDate: true,
  ntSearch: true, ntSearchStyle: 'rounded', ntTiles: true, ntTileSize: 'medium', ntTileShape: 'rounded', ntTileLabels: true,
  ntAlign: 'center',
  ntStats: true, particles: false, particleCount: 45, rgbBorder: false, rgbSpeed: 6,
  sounds: true, soundVolume: 0.45,
  searchEngine: 'google', restoreSession: true,
  // ביצועים
  tabSleepMinutes: 15, ramLimitOn: false, ramLimitMB: 2048,
  netLimitOn: false, netLimitMbps: 25, muteBackground: false, gpuBoost: true,
  adblock: true, adblockAllow: [],
  // מצב גיימינג – כל רכיב נבחר בנפרד
  gmSleepBg: false, gmNoFx: false,
  // Mods
  forceDark: false, siteCss: '', uiCss: '',
  homeTiles: [
    { title: 'YouTube', url: 'https://www.youtube.com' },
    { title: 'Twitch', url: 'https://www.twitch.tv' },
    { title: 'Steam', url: 'https://store.steampowered.com' },
    { title: 'Reddit', url: 'https://www.reddit.com/r/gaming' },
    { title: 'Epic Games', url: 'https://store.epicgames.com' },
    { title: 'IGN', url: 'https://www.ign.com' },
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'Kick', url: 'https://kick.com' }
  ],
  sidebarApps: [
    { id: 'discord', name: 'Discord', url: 'https://discord.com/app', color: '#5865f2', mobile: false },
    { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv', color: '#9146ff', mobile: true },
    { id: 'youtube', name: 'YouTube', url: 'https://m.youtube.com', color: '#ff0033', mobile: true },
    { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com', color: '#1ed760', mobile: false },
    { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com', color: '#25d366', mobile: false }
  ]
};

/* ============ Store ============ */
const Store = {
  s: null, _fns: [], _t: 0,
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('nx-settings') || '{}'); } catch { /* ignore */ }
    delete saved.gameMode; delete saved.gmPrev;
    // מעבר חד-פעמי לעיצוב הנקי: מכבה אפקטים שהיו ברירת מחדל קודם (המשתמש יכול להפעיל אותם שוב)
    if ((saved.designV || 0) < 2) {
      if (saved.wallpaperMode === undefined || saved.wallpaperMode === 'aurora') saved.wallpaperMode = 'none';
      if (saved.tabStyle === undefined || saved.tabStyle === 'angled') saved.tabStyle = 'rounded';
      saved.particles = false;
      saved.rgbBorder = false;
      saved.designV = 2;
    }
    // עיצוב פשוט: משטחים אטומים בלי טשטוש (רק אם המשתמש לא שינה את ערכי ברירת המחדל)
    if (saved.designV < 3) {
      if (saved.glass === undefined || [0.62, 0.7].includes(saved.glass)) saved.glass = 1;
      if (saved.blur === undefined || [16, 12].includes(saved.blur)) saved.blur = 0;
      saved.designV = 3;
    }
    this.s = { ...structuredClone(DEFAULTS), ...saved };
    return this.s;
  },
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      try { localStorage.setItem('nx-settings', JSON.stringify(this.s)); }
      catch { UI?.toast?.('האחסון מלא – נסה טפט קטן יותר'); }
    }, 250);
  },
  set(k, v) {
    if (this.s[k] === v) return;
    this.s[k] = v;
    this.save();
    this._fns.forEach(f => f(k, v));
  },
  patch(o) { for (const k in o) this.set(k, o[k]); },
  on(f) { this._fns.push(f); }
};

/* ============ History ============ */
const History = {
  items: [], _t: 0,
  load() { try { this.items = JSON.parse(localStorage.getItem('nx-history') || '[]'); } catch { this.items = []; } },
  save() { clearTimeout(this._t); this._t = setTimeout(() => localStorage.setItem('nx-history', JSON.stringify(this.items)), 800); },
  add(url, title) {
    if (!/^https?:/.test(url)) return;
    const old = this.items.find(x => x.url === url);
    this.items = this.items.filter(x => x.url !== url);
    this.items.unshift({ url, title: title || old?.title || url, t: Date.now(), n: (old?.n || 0) + 1 });
    if (this.items.length > 600) this.items.length = 600;
    this.save();
  },
  touchTitle(url, title) {
    const h = this.items.find(x => x.url === url);
    if (h && title) { h.title = title; this.save(); }
  },
  search(q) {
    q = q.toLowerCase();
    return this.items
      .filter(x => x.url.toLowerCase().includes(q) || (x.title || '').toLowerCase().includes(q))
      .sort((a, b) => (b.n || 1) - (a.n || 1))
      .slice(0, 6);
  },
  clear() { this.items = []; localStorage.removeItem('nx-history'); }
};

function resolveInput(raw) {
  const q = (raw || '').trim();
  if (!q) return null;
  if (isInternal(q)) return q;
  if (/^(https?|file|about|data|chrome|view-source):/i.test(q)) return q;
  if (/^localhost(:\d+)?(\/|$)/i.test(q) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(q)) return 'http://' + q;
  if (!/\s/.test(q) && /^[^\s/]+\.[a-zא-ת]{2,}(:\d+)?([/?#].*)?$/i.test(q)) return 'https://' + q;
  return (SEARCH_ENGINES[Store.s.searchEngine] || SEARCH_ENGINES.google).url + encodeURIComponent(q);
}

/* ============ Theme engine ============ */
let _themeRaf = 0;
function applyTheme() {
  cancelAnimationFrame(_themeRaf);
  _themeRaf = requestAnimationFrame(() => {
    const s = Store.s, r = document.documentElement.style;
    r.setProperty('--accent', s.accent);
    r.setProperty('--accent2', s.accent2);
    r.setProperty('--accent-rgb', hexToRgb(s.accent));
    r.setProperty('--accent2-rgb', hexToRgb(s.accent2));
    r.setProperty('--bg', s.bg);
    r.setProperty('--bg-rgb', hexToRgb(s.bg));
    r.setProperty('--surface-rgb', hexToRgb(s.surface));
    r.setProperty('--text', s.text);
    r.setProperty('--text-rgb', hexToRgb(s.text));
    r.setProperty('--radius', s.radius + 'px');
    r.setProperty('--blur', s.blur + 'px');
    r.setProperty('--glass', s.glass);
    r.setProperty('--wall-dim', s.wallpaperDim);
    r.setProperty('--font', s.font);
    r.setProperty('--sp-w', s.sidePanelWidth + 'px');
    r.setProperty('--rgb-speed', s.rgbSpeed + 's');
    const d = { compact: [33, 42], normal: [38, 48], comfy: [44, 56] }[s.density] || [38, 48];
    r.setProperty('--tab-h', d[0] + 'px');
    r.setProperty('--bar-h', d[1] + 'px');

    const wp = $('#wallpaper');
    wp.className = 'wp-' + s.wallpaperMode;
    $('#wpImg').style.backgroundImage = (s.wallpaperMode === 'image' && s.wallpaper)
      ? `url("${s.wallpaper.replace(/"/g, '%22')}")` : '';

    const b = document.body.classList;
    ['angled', 'rounded', 'flat', 'pill'].forEach(x => b.toggle('tabs-' + x, s.tabStyle === x));
    b.toggle('rgb', !!s.rgbBorder);
    b.toggle('no-fx', !!s.gmNoFx);
    b.toggle('no-nt-stats', !s.ntStats);
    b.toggle('no-sidebar', !s.showSidebar);
    b.toggle('no-blur', s.blur === 0);
    $('#uiCss').textContent = s.uiCss || '';

    // כרטיסייה חדשה
    r.setProperty('--clock-weight', s.ntClockWeight);
    r.setProperty('--clock-scale', s.ntClockSize / 100);
    r.setProperty('--clock-stroke', (1 + s.ntClockWeight / 160).toFixed(2));
    const NT = { ntClockFont: 'clock-font', ntClockColor: 'clock-color', ntClockStyle: 'clock-style', ntTileSize: 'tile-size', ntTileShape: 'tile-shape', ntSearchStyle: 'search-style', ntAlign: 'nt-align' };
    for (const [k, pre] of Object.entries(NT)) {
      [...b].filter(c => c.startsWith(pre + '-')).forEach(c => b.remove(c));
      b.add(pre + '-' + s[k]);
    }
    b.toggle('nt-hide-greet', !s.ntGreeting);
    b.toggle('nt-hide-date', !s.ntDate);
    b.toggle('nt-hide-search', !s.ntSearch);
    b.toggle('nt-hide-tiles', !s.ntTiles);
    b.toggle('nt-hide-labels', !s.ntTileLabels);
  });
}
