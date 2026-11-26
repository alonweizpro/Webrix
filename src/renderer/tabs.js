'use strict';
/* ============ Tab engine ============
   - דף הבית מצויר ישירות בממשק (בלי תהליך Chromium נוסף = 0MB)
   - Tab Sleeping: כרטיסייה רדומה משחררת את כל ה-RAM ונטענת מחדש בלחיצה
   - שחזור סשן נטען "רדום" – רק הכרטיסייה הפעילה נטענת בהפעלה */
const LOGO_SVG = '<img src="logo.png" alt="">';

const Tabs = {
  list: [], active: null, closed: [], seq: 0, dragging: null,
  $tabs: null, $views: null,

  init() {
    this.$tabs = $('#tabs');
    this.$views = $('#views');
    setInterval(() => this.sleepIdle(), 30000);
    this.$tabs.addEventListener('wheel', e => { this.$tabs.scrollLeft += e.deltaY; }, { passive: true });
  },

  create(url = NEWTAB, opts = {}) {
    const t = {
      id: ++this.seq, url, title: opts.title || INTERNAL_TITLES[url] || url,
      favicon: opts.favicon || '', wv: null, ready: false, sleeping: false, loading: false,
      audible: false, muted: false, blocked: 0, wcId: null, mem: 0, lastActive: Date.now(), cssKey: null, zoom: 0
    };
    t.pinned = !!opts.pinned;
    t.el = this.makeEl(t);
    if (t.pinned) {
      this.list.unshift(t);
      $('#pinnedTabs').append(t.el);
    } else {
      const firstReg = this.list.findIndex(x => !x.pinned);
      const minIdx = firstReg < 0 ? this.list.length : firstReg;
      let idx = this.list.length;
      if (opts.index != null) idx = clamp(opts.index, minIdx, this.list.length);
      else if (opts.afterActive && this.active) idx = Math.max(minIdx, this.list.indexOf(this.active) + 1);
      this.list.splice(idx, 0, t);
      const next = this.list[idx + 1];
      this.$tabs.insertBefore(t.el, next ? next.el : null);
    }

    if (!isInternal(url)) {
      if (opts.sleeping) t.sleeping = true;
      else this.mount(t);
    }
    this.render(t);
    if (!opts.background) this.activate(t);
    if (!opts.silent) Sound.play('open');
    Session.save();
    return t;
  },

  makeEl(t) {
    const e = el('div', 'tab' + (t.pinned ? ' pinned' : ''));
    e.draggable = !t.pinned;
    e.innerHTML = '<span class="fav"></span><span class="ttl"></span><span class="aud" title="השתק / בטל השתקה"></span><button class="x" title="סגור (Ctrl+W)">✕</button>';
    if (t.pinned) {
      e.title = 'Welcome – הגדרות מהירות';
      e.addEventListener('mousedown', ev => { if (ev.button === 0) this.activate(t); });
      e.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        UI.popMenu([{ label: 'הסתר את כרטיסיית Welcome', fn: () => Store.set('showWelcomeTab', false) }], ev.clientX, ev.clientY);
      });
      return e;
    }
    e.addEventListener('mousedown', ev => {
      if (ev.button === 0 && !ev.target.closest('.x,.aud')) this.activate(t);
      if (ev.button === 1) { ev.preventDefault(); this.close(t); }
    });
    e.querySelector('.x').addEventListener('click', ev => { ev.stopPropagation(); this.close(t); });
    e.querySelector('.aud').addEventListener('click', ev => { ev.stopPropagation(); this.toggleMute(t); });
    e.addEventListener('contextmenu', ev => { ev.preventDefault(); UI.tabMenu(t, ev.clientX, ev.clientY); });
    e.addEventListener('dragstart', ev => { this.dragging = t; e.classList.add('dragging'); ev.dataTransfer.setData('text/plain', t.url); ev.dataTransfer.effectAllowed = 'move'; });
    e.addEventListener('dragend', () => { e.classList.remove('dragging'); this.dragging = null; Session.save(); });
    e.addEventListener('dragover', ev => {
      const d = this.dragging;
      if (!d || d === t || t.pinned) return;
      ev.preventDefault();
      const r = e.getBoundingClientRect();
      const after = ev.clientX > r.left + r.width / 2;
      this.list.splice(this.list.indexOf(d), 1);
      this.list.splice(this.list.indexOf(t) + (after ? 1 : 0), 0, d);
      this.$tabs.insertBefore(d.el, after ? e.nextSibling : e);
    });
    return e;
  },

  render(t) {
    const e = t.el;
    e.classList.toggle('active', t === this.active);
    e.classList.toggle('sleeping', t.sleeping);
    e.classList.toggle('loading', t.loading);
    e.classList.toggle('has-audio', t.audible || t.muted);
    e.querySelector('.ttl').textContent = t.title;
    e.title = t.title + (t.sleeping ? ' (רדומה)' : '');
    e.querySelector('.aud').textContent = t.muted ? '🔇' : '🔊';
    const f = e.querySelector('.fav');
    const key = t.loading ? 'L' : isInternal(t.url) ? 'N' : 'F' + t.favicon + t.title[0];
    if (f.dataset.k !== key) {
      f.dataset.k = key;
      f.innerHTML = '';
      if (t.loading) f.innerHTML = '<i class="spin"></i>';
      else if (isInternal(t.url)) f.innerHTML = LOGO_SVG;
      else if (t.favicon) {
        const img = new Image();
        img.src = t.favicon;
        img.onerror = () => { f.textContent = (hostOf(t.url)[0] || '•').toUpperCase(); };
        f.append(img);
      } else f.textContent = (hostOf(t.url).replace('www.', '')[0] || '•').toUpperCase();
    }
    if (t === this.active) UI.syncToolbar();
  },

  mount(t) {
    const wv = document.createElement('webview');
    wv.className = 'wv';
    wv.setAttribute('partition', 'persist:web');
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('src', t.url);
    if (t !== this.active) wv.classList.add('inactive');
    const on = (n, f) => wv.addEventListener(n, f);
    on('dom-ready', () => {
      t.ready = true;
      t.wcId = wv.getWebContentsId();
      this.applyMods(t);
      this.applyAudio(t);
      if (t.zoom) wv.setZoomLevel(t.zoom);
      if (t === this.active) UI.syncToolbar();
    });
    on('did-start-loading', () => { t.loading = true; this.render(t); });
    on('did-stop-loading', () => { t.loading = false; this.render(t); });
    on('page-title-updated', e => { t.title = e.title || t.url; this.render(t); History.touchTitle(t.url, t.title); Session.save(); });
    on('page-favicon-updated', e => {
      t.favicon = (e.favicons && e.favicons[0]) || '';
      this.render(t); Session.save();
      const h = hostOf(t.url), tiles = Store.s.homeTiles;
      if (t.favicon && tiles.some(x => hostOf(x.url) === h && x.icon !== t.favicon)) {
        Store.set('homeTiles', tiles.map(x => hostOf(x.url) === h ? { ...x, icon: t.favicon } : x));
      }
    });
    on('did-navigate', e => { t.url = e.url; t.blocked = 0; this.render(t); History.add(e.url, t.title); Session.save(); });
    on('did-navigate-in-page', e => { if (e.isMainFrame) { t.url = e.url; this.render(t); History.add(e.url, t.title); Session.save(); } });
    on('media-started-playing', () => { t.audible = true; this.render(t); });
    on('media-paused', () => { t.audible = false; this.render(t); });
    on('found-in-page', e => Find.result(e.result));
    on('enter-html-full-screen', () => document.body.classList.add('html-fs'));
    on('leave-html-full-screen', () => document.body.classList.remove('html-fs'));
    on('did-fail-load', e => {
      if (e.isMainFrame && e.errorCode !== -3 && t === this.active) UI.toast(`לא ניתן לטעון את הדף (${e.errorDescription || e.errorCode})`);
    });
    on('render-process-gone', () => {
      this.sleep(t, true);
      UI.toast(`הכרטיסייה "${t.title.slice(0, 30)}" קרסה – לחץ עליה לטעינה מחדש`);
    });
    this.$views.append(wv);
    t.wv = wv;
    t.ready = false;
    t.sleeping = false;
  },

  activate(t) {
    if (!t) return;
    const prev = this.active;
    if (prev === t) { if (t.sleeping) { this.mount(t); this.render(t); } return; }
    this.active = t;
    t.lastActive = Date.now();
    if (prev) prev.lastActive = Date.now();
    if (t.sleeping) this.mount(t);
    for (const x of this.list) if (x.wv) x.wv.classList.toggle('inactive', x !== t);
    if (prev && this.list.includes(prev)) this.render(prev);
    this.render(t);
    const nt = t.url === NEWTAB;
    UI.showPage(t.url);
    this.list.forEach(x => this.applyAudio(x));
    t.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    Find.close();
    if (nt) setTimeout(() => $('#ntSearch').focus(), 30);
    else setTimeout(() => t.wv && t.wv.focus(), 0);
    Session.save();
  },

  close(t, force = false) {
    const i = this.list.indexOf(t);
    if (i < 0 || (t.pinned && !force)) return;
    if (!isInternal(t.url)) {
      this.closed.push({ url: t.url, title: t.title, favicon: t.favicon, index: i });
      if (this.closed.length > 25) this.closed.shift();
    }
    if (t.wv) t.wv.remove();
    t.el.remove();
    this.list.splice(i, 1);
    if (this.active === t) {
      this.active = null;
      const n = this.list.filter(x => !x.pinned).length ? (this.list[i] && !this.list[i].pinned ? this.list[i] : this.list[i - 1]) : null;
      if (n && !n.pinned) this.activate(n); else this.create(NEWTAB, { silent: true });
    } else if (!this.list.some(x => !x.pinned)) {
      this.create(NEWTAB, { silent: true, background: true });
    }
    Sound.play('close');
    Session.save();
  },

  reopen() {
    const c = this.closed.pop();
    if (c) this.create(c.url, { index: c.index, title: c.title, favicon: c.favicon });
  },

  duplicate(t) { this.create(t.url, { index: this.list.indexOf(t) + 1 }); },

  closeOthers(t) { [...this.list].forEach(x => { if (x !== t && !x.pinned) this.close(x); }); },

  regular() { return this.list.filter(x => !x.pinned); },

  sleep(t, force = false) {
    if (!t.wv || (t === this.active && !force)) return false;
    t.wv.remove();
    t.wv = null; t.ready = false; t.cssKey = null; t.wcId = null; t.mem = 0;
    t.sleeping = true; t.loading = false; t.audible = false;
    this.render(t);
    return true;
  },

  eligibleToSleep() {
    return this.list.filter(x => x !== this.active && x.wv && !x.audible);
  },

  sleepIdle() {
    // מצב גיימינג: הרדמה מיידית (דקה אחת) גוברת על ההגדרה הרגילה
    const m = Store.s.gmSleepBg ? 1 : Store.s.tabSleepMinutes;
    if (!m) return;
    const now = Date.now();
    this.eligibleToSleep().forEach(x => { if (now - x.lastActive > m * 60000) this.sleep(x); });
  },

  sleepLRU() {
    const c = this.eligibleToSleep().sort((a, b) => a.lastActive - b.lastActive)[0];
    if (c && this.sleep(c)) return c;
    return null;
  },

  sleepAllBackground() {
    let n = 0;
    this.eligibleToSleep().forEach(x => { if (this.sleep(x)) n++; });
    return n;
  },

  navigate(input, t = this.active) {
    const url = resolveInput(input);
    if (!url) return;
    if (!t) { this.create(url); return; }
    if (isInternal(url)) {
      if (t.wv) t.wv.remove();
      Object.assign(t, { wv: null, ready: false, url, title: INTERNAL_TITLES[url], favicon: '', sleeping: false, loading: false });
      this.render(t);
      if (t === this.active) UI.showPage(url);
      Session.save();
      return;
    }
    t.url = url;
    if (t.wv && t.ready) t.wv.loadURL(url).catch(() => {});
    else if (t.wv) t.wv.setAttribute('src', url);
    else this.mount(t);
    if (t === this.active) { UI.showPage(url); setTimeout(() => t.wv && t.wv.focus(), 0); }
    this.render(t);
    Session.save();
  },

  applyAudio(t) {
    if (!t.wv || !t.ready) return;
    try { t.wv.setAudioMuted(t.muted || (Store.s.muteBackground && t !== this.active)); } catch { /* ignore */ }
  },

  toggleMute(t) {
    t.muted = !t.muted;
    this.applyAudio(t);
    this.render(t);
  },

  applyMods(t) {
    if (!t.wv || !t.ready) return;
    const wv = t.wv;
    if (t.cssKey) { wv.removeInsertedCSS(t.cssKey).catch(() => {}); t.cssKey = null; }
    const s = Store.s;
    let css = '';
    if (s.adblock && !s.adblockAllow.includes(hostOf(t.url))) css += COSMETIC_ADS_CSS + '\n';
    if (s.forceDark) css += DARK_CSS + '\n';
    css += s.siteCss || '';
    if (css.trim()) wv.insertCSS(css).then(k => { t.cssKey = k; }).catch(() => {});
  },

  zoom(dir) {
    const t = this.active;
    if (!t || !t.wv || !t.ready) return;
    t.zoom = dir === 0 ? 0 : clamp(t.zoom + dir * 0.5, -5, 5);
    t.wv.setZoomLevel(t.zoom);
    UI.toast(`זום: ${Math.round(Math.pow(1.2, t.zoom) * 100)}%`, { timeout: 1200 });
  },

  byWcId(id) { return this.list.find(x => x.wcId === Number(id)); }
};

/* ============ Session restore ============ */
const Session = {
  _t: 0,
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      if (!Store.s.restoreSession) { localStorage.removeItem('nx-session'); return; }
      const reg = Tabs.regular();
      const d = {
        tabs: reg.map(t => ({ url: t.url, title: t.title, favicon: t.favicon })),
        active: Math.max(0, reg.indexOf(Tabs.active))
      };
      localStorage.setItem('nx-session', JSON.stringify(d));
    }, 400);
  },
  restore() {
    if (!Store.s.restoreSession) return false;
    let d = null;
    try { d = JSON.parse(localStorage.getItem('nx-session') || 'null'); } catch { /* ignore */ }
    if (!d || !Array.isArray(d.tabs)) return false;
    const tabs = d.tabs.filter(x => x.url !== WELCOME);
    if (!tabs.length) return false;
    tabs.forEach(x => Tabs.create(x.url, { title: x.title, favicon: x.favicon, background: true, sleeping: true, silent: true }));
    const reg = Tabs.regular();
    Tabs.activate(reg[clamp(d.active, 0, reg.length - 1)]);
    return true;
  }
};
