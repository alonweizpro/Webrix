'use strict';
/* ============ UI ============ */
const UI = {
  drawer: null, newtabVisible: false, welcomeVisible: false, downloads: [], sugg: [], suggIdx: -1,

  init() {
    // חלון
    $('#winMin').onclick = () => webrix.win.min();
    $('#winMax').onclick = () => webrix.win.max();
    $('#winClose').onclick = () => webrix.win.close();
    webrix.win.onState(s => document.body.classList.toggle('maximized', s.maximized));

    // ניווט
    $('#newTabBtn').onclick = () => Tabs.create();
    $('#brandBtn').onclick = () => Welcome.open();
    $('#welcomeBtn').onclick = () => Welcome.open();
    $('#backBtn').onclick = () => { const w = Tabs.active?.wv; if (w?.canGoBack()) w.goBack(); };
    $('#fwdBtn').onclick = () => { const w = Tabs.active?.wv; if (w?.canGoForward()) w.goForward(); };
    $('#reloadBtn').onclick = () => { const t = Tabs.active; if (!t?.wv || !t.ready) return; t.loading ? t.wv.stop() : t.wv.reload(); };
    $('#homeBtn').onclick = () => Tabs.navigate(NEWTAB);
    $('#starBtn').onclick = () => this.toggleBookmark();
    $('#shieldBtn').onclick = (e) => this.shieldMenu(e);
    $('#coreBtn').onclick = () => this.openDrawer('core');
    $('#sideCore').onclick = () => this.openDrawer('core');
    $('#customBtn').onclick = () => this.openDrawer('custom');
    $('#ntCustomize').onclick = () => this.openDrawer('nt');
    $('#menuBtn').onclick = (e) => this.mainMenu(e);
    $('#scrim').onclick = () => this.openDrawer(null);
    $$('.drawer-close').forEach(b => { b.onclick = () => this.openDrawer(null); });

    // סרגל צד
    $('#sideAdd').onclick = () => Sidebar.add();
    $('#spClose').onclick = () => SidePanel.close();
    $('#spReload').onclick = () => SidePanel.views[SidePanel.current]?.reload();
    $('#spPop').onclick = () => { const a = SidePanel.currentApp(); if (a) Tabs.create(a.url.replace('://m.', '://www.')); };
    SidePanel.initResize();

    this.initOmnibox();
    Find.init();

    // סגירת פופאפים
    document.addEventListener('mousedown', e => { if (!e.target.closest('.popover')) this.hidePop(); });
    document.addEventListener('focusin', e => { if (e.target.tagName === 'WEBVIEW') this.hidePop(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.hidePop(); this.closeModal(); if (this.drawer) this.openDrawer(null); }
    });
    // צלילי לחיצה כלליים
    document.addEventListener('click', e => { if (e.target.closest('.tool-btn,.icon-btn,.side-btn,.mini-btn,.btn')) Sound.play('click'); });

    // אירועים מה-main
    webrix.onShortcut(s => this.shortcut(s));
    webrix.onOpenTab(({ url, background }) => Tabs.create(url, { background, afterActive: true }));
    webrix.onSearch(q => Tabs.create((SEARCH_ENGINES[Store.s.searchEngine] || SEARCH_ENGINES.google).url + encodeURIComponent(q), { afterActive: true }));
    webrix.onAdblock(({ per }) => {
      for (const id in per) { const t = Tabs.byWcId(id); if (t) t.blocked = per[id]; }
      this.syncShield();
    });
    webrix.onDownload(d => this.onDownload(d));
  },

  /* ---------- Toolbar ---------- */
  syncToolbar() {
    const t = Tabs.active;
    if (!t) return;
    const inp = $('#urlInput');
    if (document.activeElement !== inp) inp.value = isInternal(t.url) ? '' : t.url;
    const ready = t.wv && t.ready;
    $('#backBtn').disabled = !(ready && t.wv.canGoBack());
    $('#fwdBtn').disabled = !(ready && t.wv.canGoForward());
    $('#reloadBtn').classList.toggle('loading', t.loading);
    $('#progress').classList.toggle('on', t.loading);
    const sec = $('#secureIcon');
    sec.className = isInternal(t.url) ? 'search' : t.url.startsWith('https:') ? 'secure' : t.url.startsWith('http:') ? 'insecure' : 'search';
    sec.title = sec.className === 'secure' ? 'חיבור מאובטח' : sec.className === 'insecure' ? 'חיבור לא מאובטח' : '';
    $('#starBtn').classList.toggle('on', Store.s.homeTiles.some(x => x.url === t.url));
    this.syncShield();
  },
  syncShield() {
    const t = Tabs.active;
    const off = !Store.s.adblock || (t && Store.s.adblockAllow.includes(hostOf(t.url)));
    $('#shieldBtn').classList.toggle('off', off);
    const n = t ? t.blocked : 0;
    $('#shieldCount').textContent = n ? n : '';
  },

  showPage(url) {
    const v = url === NEWTAB, w = url === WELCOME;
    this.newtabVisible = v;
    $('#newtab').classList.toggle('show', v);
    if (w !== this.welcomeVisible) { this.welcomeVisible = w; Welcome.show(w); }
    document.body.classList.toggle('nt-visible', v || w);
    NewTab.show(v);
    Particles.update();
    this.syncToolbar();
  },

  initOmnibox() {
    const inp = $('#urlInput'), box = $('#suggest');
    const hide = () => { box.classList.remove('open'); this.suggIdx = -1; };
    const paint = () => {
      box.innerHTML = '';
      this.sugg.forEach((s, i) => {
        const r = el('div', 'sg' + (i === this.suggIdx ? ' sel' : ''));
        const ic = el('span', 'sg-ic'); ic.innerHTML = s.type === 'search' ? '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>' : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
        r.append(ic, el('span', 'sg-t', s.type === 'search' ? s.q : s.title));
        if (s.type === 'url') r.append(el('span', 'sg-u', s.url));
        r.onmousedown = e => { e.preventDefault(); go(s); };
        box.append(r);
      });
      box.classList.toggle('open', this.sugg.length > 0);
    };
    const go = (s) => {
      hide();
      Tabs.navigate(s.type === 'search' ? s.q : s.url);
      inp.blur();
    };
    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
    inp.addEventListener('blur', () => setTimeout(() => { hide(); this.syncToolbar(); }, 120));
    inp.addEventListener('input', () => {
      const q = inp.value.trim();
      if (!q) { this.sugg = []; hide(); return; }
      this.sugg = [{ type: 'search', q }, ...History.search(q).map(h => ({ type: 'url', url: h.url, title: h.title }))];
      this.suggIdx = -1;
      paint();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!this.sugg.length) return;
        e.preventDefault();
        this.suggIdx = (this.suggIdx + (e.key === 'ArrowDown' ? 1 : -1) + this.sugg.length) % this.sugg.length;
        paint();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.altKey) { Tabs.create(resolveInput(inp.value)); hide(); inp.blur(); return; }
        this.suggIdx >= 0 ? go(this.sugg[this.suggIdx]) : go({ type: 'search', q: inp.value });
      } else if (e.key === 'Escape') {
        hide(); inp.value = Tabs.active?.url === NEWTAB ? '' : Tabs.active?.url || ''; inp.blur();
      }
    });
  },

  toggleBookmark() {
    const t = Tabs.active;
    if (!t || isInternal(t.url)) return;
    const has = Store.s.homeTiles.some(x => x.url === t.url);
    Store.set('homeTiles', has ? Store.s.homeTiles.filter(x => x.url !== t.url) : [...Store.s.homeTiles, { title: t.title.slice(0, 40), url: t.url }]);
    this.toast(has ? 'הוסר מהחיוג המהיר' : 'נוסף לחיוג המהיר');
  },

  /* ---------- Gaming settings ---------- */
  openGaming() {
    if (this.drawer !== 'core') this.openDrawer('core');
    setTimeout(() => $('#gmSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  },

  /* ---------- Drawers ---------- */
  openDrawer(name) {
    if (this.drawer === name) name = null;
    this.drawer = name;
    $('#coreDrawer').classList.toggle('open', name === 'core');
    $('#customDrawer').classList.toggle('open', name === 'custom');
    $('#ntDrawer').classList.toggle('open', name === 'nt');
    $('#scrim').classList.toggle('open', !!name);
    $('#scrim').classList.toggle('clear', name === 'nt');
    document.body.classList.toggle('nt-editing', name === 'nt');
    $('#coreBtn').classList.toggle('on', name === 'core');
    $('#customBtn').classList.toggle('on', name === 'custom');
    if (name === 'core') Perf.tick();
  },

  openNtCustomize() {
    const nt = Tabs.active?.url === NEWTAB ? Tabs.active : (Tabs.regular().find(t => t.url === NEWTAB));
    if (nt) Tabs.activate(nt); else Tabs.create(NEWTAB);
    if (this.drawer !== 'nt') this.openDrawer('nt');
  },

  /* ---------- Menus ---------- */
  popMenu(items, x, y) {
    const p = $('#ctxMenu');
    p.innerHTML = '';
    items.forEach(it => {
      if (it === '-') { p.append(el('div', 'sep')); return; }
      const b = el('button', '', it.label);
      if (it.hint) b.append(el('kbd', '', it.hint));
      b.disabled = !!it.disabled;
      b.onclick = () => { this.hidePop(); Sound.play('click'); it.fn(); };
      p.append(b);
    });
    p.classList.add('open');
    const r = p.getBoundingClientRect();
    p.style.left = clamp(x, 6, innerWidth - r.width - 6) + 'px';
    p.style.top = clamp(y, 6, innerHeight - r.height - 6) + 'px';
  },
  hidePop() { $('#ctxMenu').classList.remove('open'); },
  anchor(e) { const r = e.currentTarget.getBoundingClientRect(); return [r.right - 240, r.bottom + 6]; },

  tabMenu(t, x, y) {
    this.popMenu([
      { label: 'כרטיסייה חדשה מימין', fn: () => Tabs.create(NEWTAB, { index: Tabs.list.indexOf(t) + 1 }) },
      { label: 'שכפל', fn: () => Tabs.duplicate(t) },
      { label: 'רענן', disabled: !t.ready, fn: () => t.wv.reload() },
      { label: t.muted ? 'בטל השתקה' : 'השתק אתר', fn: () => Tabs.toggleMute(t) },
      { label: 'הרדם (שחרר RAM)', disabled: !t.wv || t === Tabs.active, fn: () => { Tabs.sleep(t); Sound.play('sleep'); } },
      '-',
      { label: 'סגור כרטיסיות אחרות', fn: () => Tabs.closeOthers(t) },
      { label: 'סגור', hint: 'Ctrl+W', fn: () => Tabs.close(t) }
    ], x, y);
  },

  shieldMenu(e) {
    const t = Tabs.active, host = t ? hostOf(t.url) : '';
    const allowed = Store.s.adblockAllow.includes(host);
    const [x, y] = this.anchor(e);
    this.popMenu([
      { label: `נחסמו בדף הזה: ${t?.blocked || 0}`, disabled: true, fn() {} },
      { label: Store.s.adblock ? 'כבה חסימה בכל האתרים' : 'הפעל חסימת פרסומות', fn: () => { Store.set('adblock', !Store.s.adblock); t?.wv?.reload(); } },
      { label: allowed ? `הפעל חסימה ב-${host}` : `כבה חסימה ב-${host || 'אתר זה'}`, disabled: !host, fn: () => {
        Store.set('adblockAllow', allowed ? Store.s.adblockAllow.filter(h => h !== host) : [...Store.s.adblockAllow, host]);
        t?.wv?.reload();
      } }
    ], x, y);
  },

  mainMenu(e) {
    const [x, y] = this.anchor(e);
    const t = Tabs.active;
    this.popMenu([
      { label: 'כרטיסייה חדשה', hint: 'Ctrl+T', fn: () => Tabs.create() },
      { label: 'Welcome – הגדרות מהירות', fn: () => Welcome.open() },
      { label: 'שחזר כרטיסייה שנסגרה', hint: 'Ctrl+Shift+T', disabled: !Tabs.closed.length, fn: () => Tabs.reopen() },
      { label: 'הורדות', fn: () => this.showDownloads() },
      { label: 'היסטוריה', fn: () => this.showHistory() },
      '-',
      { label: 'חפש בעמוד', hint: 'Ctrl+F', disabled: !t?.wv, fn: () => Find.open() },
      { label: 'מסך מלא', hint: 'F11', fn: () => webrix.win.fullscreen() },
      { label: 'כלי מפתחים', hint: 'F12', disabled: !t?.ready, fn: () => t.wv.openDevTools() },
      '-',
      { label: 'הגדרות מצב גיימינג', hint: 'Ctrl+Shift+G', fn: () => this.openGaming() },
      { label: 'Control Core', hint: 'Ctrl+Shift+P', fn: () => this.openDrawer('core') },
      { label: 'Style Lab', hint: 'Ctrl+,', fn: () => this.openDrawer('custom') },
      { label: 'ניקוי נתוני גלישה…', fn: () => this.clearDataDialog() },
      { label: 'בדוק עדכונים', fn: () => Updates.open() },
      { label: 'אודות WEBRIX', fn: () => this.about() }
    ], x, y);
  },

  /* ---------- Shortcuts ---------- */
  shortcut(s) {
    const t = Tabs.active, i = Tabs.list.indexOf(t), n = Tabs.list.length;
    const ready = t?.wv && t.ready;
    const map = {
      'newtab': () => Tabs.create(),
      'close': () => t && Tabs.close(t),
      'reopen': () => Tabs.reopen(),
      'next': () => Tabs.activate(Tabs.list[(i + 1) % n]),
      'prev': () => Tabs.activate(Tabs.list[(i - 1 + n) % n]),
      'focus-url': () => { $('#urlInput').focus(); $('#urlInput').select(); },
      'reload': () => ready && t.wv.reload(),
      'hard-reload': () => ready && t.wv.reloadIgnoringCache(),
      'find': () => Find.open(),
      'bookmark': () => this.toggleBookmark(),
      'settings': () => this.openDrawer('custom'),
      'core': () => this.openDrawer('core'),
      'gamemode': () => this.openGaming(),
      'sidebar': () => Store.set('showSidebar', !Store.s.showSidebar),
      'zoom-in': () => Tabs.zoom(1),
      'zoom-out': () => Tabs.zoom(-1),
      'zoom-reset': () => Tabs.zoom(0),
      'back': () => ready && t.wv.canGoBack() && t.wv.goBack(),
      'forward': () => ready && t.wv.canGoForward() && t.wv.goForward(),
      'home': () => Tabs.navigate(NEWTAB),
      'fullscreen': () => webrix.win.fullscreen(),
      'devtools': () => ready && (t.wv.isDevToolsOpened() ? t.wv.closeDevTools() : t.wv.openDevTools())
    };
    if (s.startsWith('tab-')) {
      const k = +s.slice(4), reg = Tabs.regular();
      Tabs.activate(k === 9 ? reg[reg.length - 1] : reg[k - 1]);
      return;
    }
    map[s]?.();
  },

  /* ---------- Toasts / Modals ---------- */
  toast(msg, { timeout = 3200, action } = {}) {
    const box = $('#toasts');
    const tEl = el('div', 'toast');
    tEl.append(el('span', '', msg));
    if (action) {
      const b = el('button', 'btn', action.label);
      b.onclick = () => { action.fn(); tEl.remove(); };
      tEl.append(b);
    }
    box.append(tEl);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { tEl.classList.add('out'); setTimeout(() => tEl.remove(), 300); }, timeout);
  },

  modal({ title, body, actions = [{ label: 'סגור', primary: true }] }) {
    const m = $('#modal');
    m.innerHTML = '';
    const box = el('div', 'modal-box');
    box.dir = 'rtl';
    box.append(el('h2', '', title));
    if (typeof body === 'string') box.append(el('p', 'modal-text', body));
    else if (body) box.append(body);
    const bar = el('div', 'modal-actions');
    actions.forEach(a => {
      const b = el('button', a.primary ? 'btn primary' : 'btn ghost', a.label);
      b.onclick = () => { if (a.fn?.() !== false) this.closeModal(); };
      bar.append(b);
    });
    box.append(bar);
    m.append(box);
    m.classList.add('open');
    m.onmousedown = e => { if (e.target === m) this.closeModal(); };
    return box;
  },
  closeModal() { $('#modal').classList.remove('open'); },

  prompt(title, fields, onOk) {
    const form = el('div', 'form');
    const inputs = {};
    fields.forEach(f => {
      const l = el('label', '', f.label);
      const i = el('input', 'text');
      i.placeholder = f.placeholder || '';
      i.value = f.value || '';
      if (f.ltr) i.dir = 'ltr';
      i.addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('.btn.primary').click(); });
      inputs[f.key] = i;
      form.append(l, i);
    });
    const box = this.modal({
      title, body: form,
      actions: [{ label: 'ביטול' }, {
        label: 'שמור', primary: true, fn: () => {
          const v = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
          if (onOk(v) === false) { this.toast('כתובת לא תקינה'); return false; }
        }
      }]
    });
    setTimeout(() => form.querySelector('input')?.focus(), 30);
  },

  /* ---------- Downloads / History ---------- */
  onDownload(d) {
    const i = this.downloads.findIndex(x => x.id === d.id);
    if (i < 0) { this.downloads.unshift(d); this.toast(`מוריד: ${d.name}`); }
    else this.downloads[i] = { ...this.downloads[i], ...d };
    if (d.state === 'done') this.toast(`ההורדה הושלמה: ${d.name}`, { timeout: 6000, action: { label: 'הצג בתיקייה', fn: () => webrix.showDownload(d.path) } });
    if (d.state === 'interrupted' || d.state === 'cancelled') this.toast(`ההורדה נכשלה: ${d.name}`);
    if ($('#dlList')) this.paintDownloads();
  },
  showDownloads() {
    const list = el('div', 'list');
    list.id = 'dlList';
    this.modal({ title: 'הורדות', body: list });
    this.paintDownloads();
  },
  paintDownloads() {
    const list = $('#dlList');
    if (!list) return;
    list.innerHTML = '';
    if (!this.downloads.length) { list.append(el('p', 'modal-text', 'אין הורדות בסשן הזה.')); return; }
    this.downloads.forEach(d => {
      const r = el('div', 'list-row');
      const pct = d.total ? Math.round(d.received / d.total * 100) : 0;
      r.append(el('span', 'grow', d.name), el('span', 'muted', d.state === 'done' ? 'הושלם' : d.state === 'progressing' ? pct + '%' : d.state));
      if (d.state === 'done') { const b = el('button', 'mini-text', 'הצג'); b.onclick = () => webrix.showDownload(d.path); r.append(b); }
      list.append(r);
    });
  },
  showHistory() {
    const wrap = el('div');
    const q = el('input', 'text'); q.placeholder = 'חפש בהיסטוריה…';
    const list = el('div', 'list');
    const paint = () => {
      list.innerHTML = '';
      const items = q.value ? History.search(q.value) : History.items.slice(0, 80);
      if (!items.length) list.append(el('p', 'modal-text', 'ריק.'));
      items.forEach(h => {
        const r = el('div', 'list-row link');
        r.append(el('span', 'grow', h.title), el('span', 'muted ltr', hostOf(h.url)));
        r.onclick = () => { this.closeModal(); Tabs.create(h.url); };
        list.append(r);
      });
    };
    q.oninput = paint;
    wrap.append(q, list);
    this.modal({ title: 'היסטוריה', body: wrap, actions: [{ label: 'נקה היסטוריה', fn: () => { History.clear(); } }, { label: 'סגור', primary: true }] });
    paint();
  },
  clearDataDialog() {
    this.modal({
      title: 'ניקוי נתוני גלישה', body: 'ימחקו: מטמון, עוגיות, התחברויות לאתרים והיסטוריה. ההגדרות והעיצוב נשמרים.',
      actions: [{ label: 'ביטול' }, { label: 'נקה הכל', primary: true, fn: async () => { await webrix.clearData(); History.clear(); this.toast('הנתונים נוקו'); } }]
    });
  },
  about() {
    const b = el('div');
    b.append(el('p', 'modal-text', 'דפדפן גיימינג מבוסס Chromium עם Control Core, כרטיסיות רדומות, מצב גיימינג מותאם אישית, חוסם פרסומות מובנה ו-Style Lab להתאמה אישית מלאה.'), Updates.panel());
    this.modal({ title: `WEBRIX ${Updates.version || ''}`, body: b });
  }
};

/* ============ Boot ============ */
(function boot() {
  Store.load();
  History.load();
  applyTheme();
  if (webrix.platform === 'darwin') document.body.classList.add('mac');
  Particles.init();
  Tabs.init();
  UI.init();
  Sidebar.render();
  CorePanel.build();
  CustomPanel.build();
  NtPanel.build();
  Updates.init();
  NewTab.init();

  const pushConfig = () => webrix.config.set({
    adblock: Store.s.adblock, adblockAllow: Store.s.adblockAllow, gpuBoost: Store.s.gpuBoost,
    netLimitOn: Store.s.netLimitOn, netLimitMbps: Store.s.netLimitMbps, autoCheckUpdates: Store.s.autoCheckUpdates
  });
  pushConfig();

  const THEME_KEYS = new Set(['accent', 'accent2', 'bg', 'surface', 'text', 'radius', 'blur', 'glass', 'wallpaper', 'wallpaperMode', 'wallpaperDim', 'font', 'density', 'tabStyle', 'rgbBorder', 'rgbSpeed', 'showSidebar', 'uiCss', 'sidePanelWidth', 'gmNoFx', 'ntStats', 'ntClockWeight', 'ntClockSize', 'ntClockFont', 'ntClockColor', 'ntClockStyle', 'ntTileSize', 'ntTileShape', 'ntSearchStyle', 'ntAlign', 'ntGreeting', 'ntDate', 'ntSearch', 'ntTiles', 'ntTileLabels']);
  const CONFIG_KEYS = new Set(['adblock', 'adblockAllow', 'gpuBoost', 'netLimitOn', 'netLimitMbps', 'autoCheckUpdates']);
  let netT = 0;
  Store.on((k) => {
    Controls.notify(k);
    if (THEME_KEYS.has(k)) applyTheme();
    if (k === 'particles' || k === 'particleCount' || k === 'gmNoFx') { if (k === 'particleCount') Particles.seed(); Particles.update(); }
    if (k === 'muteBackground') Tabs.list.forEach(t => Tabs.applyAudio(t));
    if (k === 'siteCss' || k === 'forceDark' || k === 'adblock' || k === 'adblockAllow') Tabs.list.forEach(t => Tabs.applyMods(t));
    if (CONFIG_KEYS.has(k)) { clearTimeout(netT); netT = setTimeout(pushConfig, 300); }
    if (k === 'adblock' || k === 'adblockAllow') UI.syncShield();
    if (k === 'homeTiles') { NewTab.render(); UI.syncToolbar(); }
    if (k === 'sidebarApps') Sidebar.render();
    if (k === 'searchEngine') NewTab.placeholder();
    if (k === 'gpuBoost') UI.toast('GPU Boost ייכנס לתוקף בהפעלה הבאה');
    if (k === 'restoreSession') Session.save();
    if (['ntClockStyle', 'ntClock24', 'ntSeconds', 'ntGreetName'].includes(k)) NewTab.clock(true);
    if (k === 'showWelcomeTab') Welcome.ensurePinned();
    if (k === 'gmSleepBg' && Store.s.gmSleepBg) Tabs.sleepIdle();
  });

  if (!Session.restore()) Tabs.create(NEWTAB, { silent: true });
  Perf.start();

  Welcome.ensurePinned();
  if (!Store.s.setupDone) { Store.set('firstRun', false); Welcome.open(); }
})();
