'use strict';
/* ============ Control builder (מגדיר הגדרות לפי סכמה) ============ */
const Controls = {
  syncers: {},
  watch(key, fn) { (this.syncers[key] ||= []).push(fn); },
  notify(key) { (this.syncers[key] || []).forEach(f => f()); },

  build(container, items) {
    for (const it of items) {
      if (it.section) { const h = el('h3', 'sec', it.section); if (it.id) h.id = it.id; container.append(h); continue; }
      if (it.custom) { container.append(it.custom()); continue; }
      const get = () => it.get ? it.get() : Store.s[it.key];
      const set = (v) => it.set ? it.set(v) : Store.set(it.key, v);
      const row = el('div', 'row ' + it.type);
      const head = el('div', 'row-head');
      head.append(el('label', '', it.label));
      row.append(head);
      let sync;
      if (it.type === 'toggle') {
        const b = el('button', 'switch');
        b.append(el('i'));
        sync = () => b.classList.toggle('on', !!get());
        b.onclick = () => { set(!get()); Sound.play(get() ? 'on' : 'off'); sync(); };
        head.append(b);
      } else if (it.type === 'range') {
        const val = el('span', 'val');
        const r = el('input');
        Object.assign(r, { type: 'range', min: it.min, max: it.max, step: it.step || 1 });
        const fmt = it.fmt || (v => v);
        sync = () => { r.value = get(); val.textContent = fmt(+get()); r.style.setProperty('--p', ((get() - it.min) / (it.max - it.min) * 100) + '%'); };
        r.oninput = () => { set(+r.value); sync(); };
        r.onchange = () => Sound.play('tick');
        head.append(val); row.append(r);
      } else if (it.type === 'color') {
        const c = el('input');
        c.type = 'color';
        const code = el('span', 'val mono');
        sync = () => { c.value = get(); code.textContent = get(); };
        c.oninput = () => { set(c.value); Store.set('theme', 'custom'); code.textContent = c.value; };
        head.append(code, c);
      } else if (it.type === 'select') {
        const sel = el('select');
        for (const [v, l] of Object.entries(typeof it.options === 'function' ? it.options() : it.options)) {
          const o = el('option', '', l); o.value = v; sel.append(o);
        }
        sync = () => { sel.value = get(); };
        sel.onchange = () => { set(sel.value); Sound.play('click'); };
        row.append(sel);
      } else if (it.type === 'chips') {
        const box = el('div', 'seg');
        for (const [v, l] of Object.entries(it.options)) {
          const b = el('button', '', l);
          b.dataset.v = v;
          b.onclick = () => { set(v); Sound.play('click'); sync(); };
          box.append(b);
        }
        sync = () => $$('button', box).forEach(b => b.classList.toggle('on', b.dataset.v === String(get())));
        row.append(box);
      } else if (it.type === 'text') {
        const inp = el('input', 'text');
        inp.placeholder = it.placeholder || '';
        inp.maxLength = it.max || 40;
        sync = () => { if (document.activeElement !== inp) inp.value = get() || ''; };
        inp.oninput = () => set(inp.value.trim());
        row.append(inp);
      } else if (it.type === 'textarea') {
        const ta = el('textarea', 'mono');
        ta.placeholder = it.placeholder || '';
        ta.spellcheck = false;
        let tm = 0;
        sync = () => { if (document.activeElement !== ta) ta.value = get() || ''; };
        ta.oninput = () => { clearTimeout(tm); tm = setTimeout(() => set(ta.value), 500); };
        row.append(ta);
      }
      if (it.hint) row.append(el('small', 'hint', it.hint));
      sync();
      if (it.key) this.watch(it.key, sync);
      (it.watch || []).forEach(k => this.watch(k, sync));
      container.append(row);
    }
  }
};

/* ============ Control Core – ביצועים ============ */
const Perf = {
  memHist: [], cpuHist: [], last: null, timer: 0, warned: 0,
  start() { clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 2000); this.tick(); },
  async tick() {
    if (!(UI.drawer === 'core' || Store.s.ramLimitOn || UI.newtabVisible)) return;
    let m;
    try { m = await webrix.metrics(); } catch { return; }
    this.last = m;
    this.memHist.push(m.mem); this.cpuHist.push(m.cpu);
    if (this.memHist.length > 60) { this.memHist.shift(); this.cpuHist.shift(); }
    for (const t of Tabs.list) t.mem = (t.wcId != null && m.per[t.wcId]) ? m.per[t.wcId].mem : 0;

    if (Store.s.ramLimitOn && m.mem > Store.s.ramLimitMB) {
      const s = Tabs.sleepLRU();
      if (s) { UI.toast(`RAM Limiter: "${s.title.slice(0, 36)}" הורדמה ושחררה ${fmtMB(s.mem || 0)}`); Sound.play('sleep'); }
      else if (Date.now() - this.warned > 60000) { this.warned = Date.now(); UI.toast('RAM Limiter: אין כרטיסיות רקע להרדים – הדף הפעיל חורג מהמגבלה'); }
    }
    if (UI.drawer === 'core') CorePanel.render(m);
    if (UI.newtabVisible) NewTab.stats(m);
  }
};

const CorePanel = {
  build() {
    const body = $('#coreBody');
    body.innerHTML = `
      <div class="metrics">
        ${['ram', 'cpu'].map(k => `
        <div class="metric big ${k}">
          <div class="m-top">
            <div class="ring"><svg viewBox="0 0 64 64"><circle class="trk" cx="32" cy="32" r="27"/><circle class="val" id="r_${k}" cx="32" cy="32" r="27"/></svg><span class="ring-ic">${icon(k)}</span></div>
            <div class="m-tx"><small>${k === 'ram' ? 'זיכרון RAM' : 'מעבד CPU'}</small><b id="g_${k}">–</b><em id="s_${k}"></em></div>
          </div>
          <canvas id="c_${k}"></canvas>
        </div>`).join('')}
        <div class="metric small"><span class="m-ic">${icon('shield')}</span><div class="m-tx"><small>נחסמו בסשן</small><b id="g_blk">0</b></div></div>
        <div class="metric small"><span class="m-ic">${icon('tabs')}</span><div class="m-tx"><small>כרטיסיות</small><b id="g_tabs">0</b><em id="s_tabs"></em></div></div>
      </div>`;
    const quick = el('div', 'quick-actions');
    const qa = (label, fn) => { const b = el('button', 'btn', label); b.onclick = fn; quick.append(b); };
    qa('הרדם כרטיסיות רקע', () => { const n = Tabs.sleepAllBackground(); UI.toast(n ? `${n} כרטיסיות הורדמו` : 'אין כרטיסיות רקע פעילות'); Sound.play('sleep'); Perf.tick(); });
    qa('נקה מטמון', async () => { await webrix.clearData(); UI.toast('המטמון ונתוני האתרים נוקו'); });
    body.append(quick);

    Controls.build(body, [
      { section: 'מצב גיימינג', id: 'gmSection' },
      { custom: () => this.gmSummary() },
      { type: 'toggle', key: 'gmSleepBg', label: 'הרדמה מיידית של כרטיסיות רקע', hint: 'כרטיסייה שעזבת נרדמת אחרי דקה ומשחררת את כל ה-RAM וה-CPU שלה.' },
      { type: 'toggle', key: 'ramLimitOn', label: 'הגבלת זיכרון (RAM Limiter)', hint: 'כשהדפדפן חורג, הכרטיסייה הכי פחות בשימוש מורדמת אוטומטית.' },
      { type: 'range', key: 'ramLimitMB', label: 'מגבלת RAM', min: 512, max: 16384, step: 256, fmt: fmtMB },
      { type: 'toggle', key: 'netLimitOn', label: 'הגבלת רוחב פס (Network Limiter)', hint: 'שומר על פינג יציב במשחק כשיש הורדות או סטרימים בדפדפן.' },
      { type: 'range', key: 'netLimitMbps', label: 'מהירות מקסימלית', min: 1, max: 500, step: 1, fmt: v => v + ' Mbps' },
      { type: 'toggle', key: 'muteBackground', label: 'השתקת כרטיסיות ברקע' },
      { type: 'toggle', key: 'gmNoFx', label: 'כיבוי אנימציות ואפקטים', hint: 'עוצר חלקיקים, רקעים מונפשים, מסגרת RGB ומעברי ממשק.' },
      { type: 'toggle', key: 'gpuBoost', label: 'GPU Boost (האצת חומרה מקסימלית)', hint: 'נכנס לתוקף אחרי הפעלה מחדש של הדפדפן.' },
      { section: 'כללי' },
      { type: 'range', key: 'tabSleepMinutes', label: 'הרדם כרטיסיות לא פעילות אחרי', min: 0, max: 120, step: 5, fmt: v => v ? v + ' דק׳' : 'כבוי', hint: 'לא רלוונטי כשהרדמה מיידית פעילה.' },
      { type: 'toggle', key: 'adblock', label: 'חוסם פרסומות וטראקרים' }
    ]);

    body.append(el('h3', 'sec', 'צריכה לפי כרטיסייה'));
    body.append(Object.assign(el('div', 'tab-list'), { id: 'coreTabs' }));
  },
  gmSummary() {
    const KEYS = ['gmSleepBg', 'ramLimitOn', 'netLimitOn', 'muteBackground', 'gmNoFx', 'gpuBoost'];
    const box = el('div', 'gm-summary');
    const n = el('b'), txt = el('span');
    const all = el('button', 'btn'), none = el('button', 'btn ghost', 'כבה הכל');
    const sync = () => {
      const on = KEYS.filter(k => Store.s[k]).length;
      n.textContent = `${on}/${KEYS.length}`;
      txt.textContent = on ? 'רכיבי גיימינג פעילים' : 'כל רכיבי הגיימינג כבויים';
      all.textContent = on === KEYS.length ? 'הכל פעיל ✓' : 'הפעל הכל';
      all.disabled = on === KEYS.length;
    };
    all.onclick = () => { const p = {}; KEYS.forEach(k => { p[k] = true; }); Store.patch(p); Tabs.sleepAllBackground(); Sound.play('on'); };
    none.onclick = () => { const p = {}; KEYS.forEach(k => { p[k] = false; }); Store.patch(p); Sound.play('off'); };
    box.append(n, txt, all, none);
    KEYS.forEach(k => Controls.watch(k, sync));
    sync();
    return box;
  },
  render(m) {
    const lim = Store.s.ramLimitOn ? Store.s.ramLimitMB : m.sysTotal;
    const ring = (id, p) => {
      const c = $(id), C = 2 * Math.PI * 27;
      c.style.strokeDasharray = C;
      c.style.strokeDashoffset = C * (1 - clamp(p, 0, 1));
      c.classList.toggle('hot', p > 0.85);
    };
    ring('#r_ram', m.mem / lim);
    $('#g_ram').textContent = fmtMB(m.mem);
    $('#s_ram').textContent = Store.s.ramLimitOn ? `מתוך מגבלה של ${fmtMB(lim)}` : `${fmtMB(m.sysFree)} פנויים במערכת`;
    ring('#r_cpu', m.cpu / 100);
    $('#g_cpu').textContent = m.cpu.toFixed(1) + '%';
    $('#s_cpu').textContent = `${m.procs} תהליכים פעילים`;
    $('#g_blk').textContent = m.blockedTotal.toLocaleString();
    const awake = Tabs.list.filter(t => t.wv).length, asleep = Tabs.list.filter(t => t.sleeping).length;
    $('#g_tabs').textContent = Tabs.list.length;
    $('#s_tabs').textContent = asleep ? `${awake} פעילות · ${asleep} רדומות` : `${awake} פעילות`;
    const css = getComputedStyle(document.documentElement);
    drawSpark($('#c_ram'), Perf.memHist, Math.max(...Perf.memHist) * 1.2, css.getPropertyValue('--accent-rgb'));
    drawSpark($('#c_cpu'), Perf.cpuHist, Math.max(20, ...Perf.cpuHist) * 1.2, css.getPropertyValue('--accent2-rgb'));

    const list = $('#coreTabs');
    list.innerHTML = '';
    [...Tabs.list].sort((a, b) => b.mem - a.mem).forEach(t => {
      const r = el('div', 'tl-row' + (t === Tabs.active ? ' active' : ''));
      const maxMem = Math.max(1, ...Tabs.list.map(x => x.mem));
      r.style.setProperty('--w', (t.mem / maxMem * 100) + '%');
      const fav = el('span', 'tl-fav');
      if (isInternal(t.url)) fav.innerHTML = '<img src="logo.png" alt="">';
      else fav.append(favImg(t.url, t.favicon, img => { img.remove(); fav.innerHTML = icon('globe'); }));
      r.append(fav);
      const name = el('span', 'tl-name', t.title);
      const mem = el('span', 'tl-mem', isInternal(t.url) ? '0 MB' : t.sleeping ? 'רדומה' : fmtMB(t.mem));
      const b = el('button', 'mini-text');
      if (t.sleeping) { b.textContent = 'הער'; b.onclick = () => { Tabs.activate(t); Perf.tick(); }; }
      else if (t.wv && t !== Tabs.active) { b.textContent = 'הרדם'; b.onclick = () => { Tabs.sleep(t); Sound.play('sleep'); Perf.tick(); }; }
      else { b.textContent = t === Tabs.active ? 'פעילה' : '—'; b.disabled = true; }
      name.onclick = () => Tabs.activate(t);
      r.append(name, mem, b);
      list.append(r);
    });
  }
};

/* ============ Style Lab – התאמה אישית ============ */
const CustomPanel = {
  build() {
    const body = $('#customBody');
    const pct = v => Math.round(v * 100) + '%';
    Controls.build(body, [
      { section: 'ערכות נושא' },
      { custom: () => this.themeGrid() },
      { section: 'צבעים' },
      { type: 'color', key: 'accent', label: 'צבע ראשי' },
      { type: 'color', key: 'accent2', label: 'צבע משני' },
      { type: 'color', key: 'bg', label: 'רקע' },
      { type: 'color', key: 'surface', label: 'משטחים' },
      { type: 'color', key: 'text', label: 'טקסט' },
      { section: 'כרטיסייה חדשה' },
      { custom: () => { const b = el('button', 'btn', 'התאמה אישית של הכרטיסייה החדשה'); b.onclick = () => UI.openNtCustomize(); return b; } },
      { section: 'רקע' },
      { type: 'select', key: 'wallpaperMode', label: 'סוג רקע', options: { none: 'צבע אחיד', aurora: 'Aurora מונפש', grid: 'Cyber Grid מונפש', image: 'תמונה משלך' } },
      { custom: () => this.wallpaperPicker() },
      { type: 'range', key: 'wallpaperDim', label: 'עמעום רקע', min: 0, max: 0.95, step: 0.05, fmt: pct },
      { section: 'ממשק' },
      { type: 'range', key: 'glass', label: 'אטימות זכוכית', min: 0.15, max: 1, step: 0.05, fmt: pct },
      { type: 'range', key: 'blur', label: 'טשטוש זכוכית', min: 0, max: 40, step: 1, fmt: v => v ? v + 'px' : 'כבוי' },
      { type: 'range', key: 'radius', label: 'עיגול פינות', min: 0, max: 20, step: 1, fmt: v => v + 'px' },
      { type: 'select', key: 'font', label: 'גופן', options: FONTS },
      { type: 'select', key: 'density', label: 'צפיפות', options: { compact: 'קומפקטי', normal: 'רגיל', comfy: 'מרווח' } },
      { type: 'select', key: 'tabStyle', label: 'סגנון כרטיסיות', options: { angled: 'זוויתי (Gaming)', rounded: 'מעוגל', pill: 'גלולה', flat: 'שטוח עם קו' } },
      { type: 'toggle', key: 'showSidebar', label: 'סרגל צד' },
      { type: 'toggle', key: 'showWelcomeTab', label: 'כרטיסיית Welcome קבועה' },
      { section: 'אפקטים' },
      { type: 'toggle', key: 'ntStats', label: 'נתוני ביצועים בתחתית דף הבית' },
      { type: 'toggle', key: 'particles', label: 'חלקיקים בדף הבית' },
      { type: 'range', key: 'particleCount', label: 'כמות חלקיקים', min: 10, max: 160, step: 5 },
      { type: 'toggle', key: 'rgbBorder', label: 'מסגרת RGB' },
      { type: 'range', key: 'rgbSpeed', label: 'מהירות RGB', min: 1, max: 20, step: 1, fmt: v => v + 's לסיבוב' },
      { type: 'toggle', key: 'sounds', label: 'צלילי ממשק' },
      { type: 'range', key: 'soundVolume', label: 'עוצמה', min: 0.05, max: 1, step: 0.05, fmt: pct },
      { section: 'גלישה' },
      { type: 'select', key: 'searchEngine', label: 'מנוע חיפוש', options: () => Object.fromEntries(Object.entries(SEARCH_ENGINES).map(([k, v]) => [k, v.name])) },
      { type: 'toggle', key: 'restoreSession', label: 'שחזר כרטיסיות בהפעלה' },
      { section: 'Mods · אתרים' },
      { type: 'toggle', key: 'forceDark', label: 'Dark Mode כפוי לכל האתרים' },
      { type: 'textarea', key: 'siteCss', label: 'CSS מותאם שיוזרק לכל אתר', placeholder: '/* לדוגמה */\n::-webkit-scrollbar { width: 6px }\n::-webkit-scrollbar-thumb { background: #ff2a6d }' },
      { section: 'Mods · ממשק הדפדפן' },
      { type: 'textarea', key: 'uiCss', label: 'CSS שמשנה את WEBRIX עצמו', placeholder: '#toolbar { border-bottom: 2px solid var(--accent) }\n.tab.active .ttl { font-weight: 700 }', hint: 'משתני CSS זמינים: --accent, --accent2, --bg, --text, --radius, --blur' },
      { section: 'גיבוי' },
      { custom: () => this.backup() },
      { section: 'קיצורי מקלדת' },
      { custom: () => this.hotkeys() }
    ]);
  },

  themeGrid() {
    const g = el('div', 'theme-grid');
    const sync = () => $$('.theme-card', g).forEach(c => c.classList.toggle('on', c.dataset.id === Store.s.theme));
    for (const [id, t] of Object.entries(THEMES)) {
      const c = el('button', 'theme-card');
      c.dataset.id = id;
      c.style.setProperty('--a', t.accent); c.style.setProperty('--b', t.accent2); c.style.setProperty('--c', t.bg);
      c.append(el('i'), el('span', '', t.name));
      c.onclick = () => {
        const { name, ...colors } = t;
        Store.patch({ theme: id, ...colors });
        Sound.play('on');
      };
      g.append(c);
    }
    sync();
    Controls.watch('theme', sync);
    return g;
  },

  wallpaperPicker() {
    const w = el('div', 'wp-picker');
    const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    const up = el('button', 'btn', 'העלה תמונה');
    const url = el('input', 'text'); url.placeholder = 'או הדבק קישור לתמונה…'; url.dir = 'ltr';
    const rm = el('button', 'btn ghost', 'הסר');
    up.onclick = () => file.click();
    file.onchange = () => {
      const f = file.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        // דחיסה ל-2560px כדי לא להעמיס זיכרון
        const sc = Math.min(1, 2560 / Math.max(img.width, img.height));
        const cv = el('canvas'); cv.width = img.width * sc; cv.height = img.height * sc;
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        Store.patch({ wallpaper: cv.toDataURL('image/jpeg', 0.86), wallpaperMode: 'image' });
        URL.revokeObjectURL(img.src);
        UI.toast('הטפט עודכן');
      };
      img.src = URL.createObjectURL(f);
      file.value = '';
    };
    url.onchange = () => { if (/^https?:\/\//.test(url.value)) Store.patch({ wallpaper: url.value, wallpaperMode: 'image' }); };
    rm.onclick = () => Store.patch({ wallpaper: '', wallpaperMode: 'aurora' });
    w.append(up, url, rm, file);
    return w;
  },

  backup() {
    const w = el('div', 'quick-actions');
    const KEYS = ['theme', 'accent', 'accent2', 'bg', 'surface', 'text', 'wallpaperMode', 'wallpaper', 'wallpaperDim', 'glass', 'blur', 'radius', 'font', 'density', 'tabStyle', 'particles', 'particleCount', 'rgbBorder', 'rgbSpeed', 'sounds', 'soundVolume', 'forceDark', 'siteCss', 'uiCss', 'showSidebar'];
    const exp = el('button', 'btn', 'ייצוא ערכת עיצוב');
    exp.onclick = () => {
      const data = { webrixTheme: 1, ...Object.fromEntries(KEYS.map(k => [k, Store.s[k]])) };
      const a = el('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = 'webrix-theme.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    const imp = el('button', 'btn', 'ייבוא');
    imp.onclick = () => file.click();
    file.onchange = async () => {
      try {
        const d = JSON.parse(await file.files[0].text());
        if (!d.webrixTheme) throw new Error();
        const patch = {};
        KEYS.forEach(k => { if (k in d) patch[k] = d[k]; });
        Store.patch(patch);
        UI.toast('ערכת העיצוב יובאה');
      } catch { UI.toast('קובץ ערכת עיצוב לא תקין'); }
      file.value = '';
    };
    const reset = el('button', 'btn ghost', 'איפוס עיצוב');
    reset.onclick = () => UI.modal({
      title: 'לאפס את העיצוב?', body: 'כל הצבעים, הטפט וה-Mods יחזרו לברירת המחדל.',
      actions: [{ label: 'ביטול' }, { label: 'איפוס', primary: true, fn: () => { const p = {}; KEYS.forEach(k => { p[k] = structuredClone(DEFAULTS[k]); }); Store.patch(p); } }]
    });
    w.append(exp, imp, reset, file);
    return w;
  },

  hotkeys() {
    const list = [
      ['Ctrl+T', 'כרטיסייה חדשה'], ['Ctrl+W', 'סגור כרטיסייה'], ['Ctrl+Shift+T', 'שחזר כרטיסייה שנסגרה'],
      ['Ctrl+Tab', 'כרטיסייה הבאה'], ['Ctrl+1…9', 'קפוץ לכרטיסייה'], ['Ctrl+L', 'שורת כתובת'],
      ['Ctrl+F', 'חיפוש בעמוד'], ['Ctrl+D', 'הוסף לחיוג מהיר'], ['Ctrl+Shift+G', 'הגדרות מצב גיימינג'],
      ['Ctrl+Shift+P', 'Control Core'], ['Ctrl+,', 'Style Lab'], ['Ctrl+Shift+B', 'הצג/הסתר סרגל צד'],
      ['Ctrl + / − / 0', 'זום'], ['F11', 'מסך מלא'], ['F12', 'כלי מפתחים']
    ];
    const d = el('div', 'hotkeys');
    list.forEach(([k, v]) => { const r = el('div'); r.append(el('kbd', '', k), el('span', '', v)); d.append(r); });
    return d;
  }
};

/* ============ Sidebar + Side panel ============ */
const Sidebar = {
  render() {
    const box = $('#sideApps');
    box.innerHTML = '';
    for (const app of Store.s.sidebarApps) {
      const b = el('button', 'side-btn app' + (SidePanel.current === app.id ? ' on' : ''));
      b.title = app.name;
      const ic = el('span', 'app-ic');
      ic.append(siteIcon(app.url, app.icon, app.name));
      b.append(ic);
      if (SidePanel.views[app.id]) b.append(el('i', 'live'));
      b.onclick = () => { SidePanel.toggle(app); Sound.play('click'); };
      b.oncontextmenu = (e) => {
        e.preventDefault();
        UI.popMenu([
          { label: SidePanel.views[app.id] ? 'פרוק (שחרר זיכרון)' : 'פתח', fn: () => SidePanel.views[app.id] ? SidePanel.unload(app.id) : SidePanel.open(app) },
          { label: 'פתח בכרטיסייה', fn: () => Tabs.create(app.url.replace('://m.', '://www.')) },
          { label: 'מצב מובייל (חלון צר): ' + (app.mobile ? 'פעיל' : 'כבוי'), fn: () => { this.update(app.id, { mobile: !app.mobile }); SidePanel.unload(app.id); } },
          '-',
          { label: 'הסר מהסרגל', fn: () => { SidePanel.unload(app.id); Store.set('sidebarApps', Store.s.sidebarApps.filter(x => x.id !== app.id)); } }
        ], e.clientX, e.clientY);
      };
      box.append(b);
    }
  },
  update(id, patch) { Store.set('sidebarApps', Store.s.sidebarApps.map(x => x.id === id ? { ...x, ...patch } : x)); },
  add() {
    UI.prompt('הוספת אפליקציה לסרגל הצד', [
      { key: 'name', label: 'שם', placeholder: 'לדוגמה: Telegram' },
      { key: 'url', label: 'כתובת', placeholder: 'https://web.telegram.org', ltr: true }
    ], v => {
      const url = resolveInput(v.url);
      if (!url || !/^https?:/.test(url)) return false;
      const colors = ['#ff2a6d', '#05d9e8', '#9146ff', '#ffc400', '#39ff14', '#ff6d00'];
      Store.set('sidebarApps', [...Store.s.sidebarApps, {
        id: 'app' + Date.now(), name: v.name || hostOf(url), url, color: colors[Store.s.sidebarApps.length % colors.length], mobile: false
      }]);
    });
  }
};

const SidePanel = {
  views: {}, current: null,
  toggle(app) { this.current === app.id ? this.close() : this.open(app); },
  open(app) {
    this.current = app.id;
    $('#sidePanel').classList.add('open');
    $('#spTitle').textContent = app.name;
    if (!this.views[app.id]) {
      const wv = document.createElement('webview');
      wv.className = 'wv';
      wv.setAttribute('partition', 'persist:web');
      wv.setAttribute('allowpopups', '');
      if (app.mobile) wv.setAttribute('useragent', MOBILE_UA);
      wv.setAttribute('src', app.url);
      wv.addEventListener('page-favicon-updated', e => {
        const f = e.favicons && e.favicons[0];
        const cur = Store.s.sidebarApps.find(x => x.id === app.id);
        if (f && cur && cur.icon !== f) Sidebar.update(app.id, { icon: f });
      });
      $('#spBody').append(wv);
      this.views[app.id] = wv;
    }
    for (const id in this.views) this.views[id].classList.toggle('inactive', id !== app.id);
    Sidebar.render();
  },
  close() {
    this.current = null;
    $('#sidePanel').classList.remove('open');
    for (const id in this.views) this.views[id].classList.add('inactive');
    Sidebar.render();
  },
  unload(id) {
    this.views[id]?.remove();
    delete this.views[id];
    if (this.current === id) this.close(); else Sidebar.render();
  },
  currentApp() { return Store.s.sidebarApps.find(x => x.id === this.current); },
  initResize() {
    const h = $('#spResize');
    h.addEventListener('mousedown', e => {
      e.preventDefault();
      document.body.classList.add('resizing');
      const startX = e.clientX, startW = Store.s.sidePanelWidth;
      const move = ev => Store.set('sidePanelWidth', clamp(startW + (ev.clientX - startX), 280, 900));
      const up = () => { document.body.classList.remove('resizing'); removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
      addEventListener('mousemove', move);
      addEventListener('mouseup', up);
    });
  }
};

/* ============ New tab page ============ */
const NewTab = {
  clockT: 0,
  init() {
    $('#ntForm').addEventListener('submit', e => {
      e.preventDefault();
      const v = $('#ntSearch').value;
      $('#ntSearch').value = '';
      Tabs.navigate(v);
    });
    this.placeholder();
    $$('#ntStats [data-i]').forEach(e => { e.innerHTML = icon(e.dataset.i); });
    this.render();
  },
  placeholder() { $('#ntSearch').placeholder = `חפש ב-${SEARCH_ENGINES[Store.s.searchEngine]?.name || 'Google'} או הקלד כתובת`; },
  show(v) {
    clearInterval(this.clockT);
    if (v) { this.clock(); this.clockT = setInterval(() => this.clock(), 1000); Perf.tick(); }
  },
  clockKey: '',
  clock(force) {
    const s = Store.s, d = new Date(), box = $('#ntClock');
    const pad = n => String(n).padStart(2, '0');
    let h = d.getHours();
    const m = pad(d.getMinutes()), sec = pad(d.getSeconds());
    let ampm = '';
    if (!s.ntClock24) { ampm = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; }
    const H = s.ntClock24 ? pad(h) : String(h);
    if (s.ntClockStyle === 'analog') {
      if (force || !box.querySelector('svg')) {
        let ticks = '';
        for (let i = 0; i < 12; i++) ticks += `<line class="tk${i % 3 ? '' : ' big'}" x1="50" y1="${i % 3 ? 7 : 5}" x2="50" y2="${i % 3 ? 11 : 13}" transform="rotate(${i * 30} 50 50)"/>`;
        box.innerHTML = `<svg viewBox="0 0 100 100" class="analog"><circle class="face" cx="50" cy="50" r="47"/>${ticks}
          <line class="hh" x1="50" y1="54" x2="50" y2="27"/><line class="mh" x1="50" y1="56" x2="50" y2="15"/>
          ${s.ntSeconds ? '<line class="sh" x1="50" y1="60" x2="50" y2="12"/>' : ''}<circle class="dot" cx="50" cy="50" r="2.4"/></svg>`;
      }
      const hr = (d.getHours() % 12) * 30 + d.getMinutes() / 2, mn = d.getMinutes() * 6 + d.getSeconds() / 10, sc = d.getSeconds() * 6;
      box.querySelector('.hh').setAttribute('transform', `rotate(${hr} 50 50)`);
      box.querySelector('.mh').setAttribute('transform', `rotate(${mn} 50 50)`);
      box.querySelector('.sh')?.setAttribute('transform', `rotate(${sc} 50 50)`);
      this.clockKey = 'analog';
    } else {
      let html = '';
      if (s.ntClockStyle === 'stacked') {
        html = `<span class="c-h">${H}</span><span class="c-m">${m}</span>${s.ntSeconds ? `<span class="c-s">${sec}</span>` : ''}`;
      } else if (s.ntClockStyle === 'digital') {
        html = `${H}<span class="c-colon">:</span>${m}${s.ntSeconds ? `<span class="c-sec">:${sec}</span>` : ''}`;
      }
      if (ampm && s.ntClockStyle !== 'none') html += `<span class="c-ampm">${ampm}</span>`;
      if (force || html !== this.clockKey) { box.innerHTML = html; this.clockKey = html; }
    }
    const hh = d.getHours();
    const greet = hh < 5 ? 'לילה טוב' : hh < 12 ? 'בוקר טוב' : hh < 17 ? 'צהריים טובים' : hh < 22 ? 'ערב טוב' : 'לילה טוב';
    $('#ntGreet').textContent = s.ntGreetName ? `${greet}, ${s.ntGreetName}` : greet;
    $('#ntDate').textContent = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  },
  stats(m) {
    $('#stRam').textContent = fmtMB(m.mem);
    $('#stRamBar').style.width = clamp(m.mem / m.sysTotal * 100, 2, 100) + '%';
    $('#stCpu').textContent = m.cpu.toFixed(1) + '%';
    $('#stCpuBar').style.width = clamp(m.cpu, 2, 100) + '%';
    $('#stBlocked').textContent = m.blockedTotal.toLocaleString();
    const awake = Tabs.list.filter(t => t.wv).length, asleep = Tabs.list.filter(t => t.sleeping).length;
    $('#stTabs').textContent = asleep ? `${awake} פעילות · ${asleep} רדומות` : `${awake} פעילות`;
  },
  render() {
    const box = $('#ntTiles');
    box.innerHTML = '';
    const tiles = Store.s.homeTiles;
    // שורות מאוזנות: 8 → 4+4, ‏10 → 5+5, עד 7 בשורה
    const n = tiles.length;
    box.style.setProperty('--cols', n <= 6 ? Math.max(n, 1) : Math.min(7, Math.ceil(n / 2)));
    const edit = (i) => {
      const t = tiles[i];
      UI.prompt('עריכת קיצור', [
        { key: 'title', label: 'שם', value: t.title },
        { key: 'url', label: 'כתובת', value: t.url, ltr: true }
      ], v => {
        const url = resolveInput(v.url);
        if (!url || !/^https?:/.test(url)) return false;
        Store.set('homeTiles', Store.s.homeTiles.map((x, j) => j === i ? { title: v.title || hostOf(url), url } : x));
      });
    };
    const remove = (i) => Store.set('homeTiles', Store.s.homeTiles.filter((_, j) => j !== i));
    tiles.forEach((tile, i) => {
      const a = el('button', 'tile');
      a.title = tile.url;
      const ic = el('div', 'tile-ic');
      ic.append(siteIcon(tile.url, tile.icon, tile.title));
      const x = el('i', 'tile-x', '✕');
      x.title = 'הסר';
      x.onclick = e => { e.stopPropagation(); remove(i); };
      a.append(ic, el('span', 'tile-t', tile.title), x);
      a.onclick = () => { Sound.play('click'); Tabs.navigate(tile.url); };
      a.onauxclick = e => { if (e.button === 1) Tabs.create(tile.url, { background: true, afterActive: true }); };
      a.oncontextmenu = e => {
        e.preventDefault();
        UI.popMenu([
          { label: 'פתח בכרטיסייה חדשה', fn: () => Tabs.create(tile.url, { afterActive: true }) },
          { label: 'ערוך', fn: () => edit(i) },
          '-',
          { label: 'הסר', fn: () => remove(i) }
        ], e.clientX, e.clientY);
      };
      box.append(a);
    });
    $('#ntAdd').onclick = () => UI.prompt('הוספה לחיוג מהיר', [
      { key: 'title', label: 'שם', placeholder: 'לדוגמה: Discord' },
      { key: 'url', label: 'כתובת', placeholder: 'discord.com', ltr: true }
    ], v => {
      const url = resolveInput(v.url);
      if (!url || !/^https?:/.test(url)) return false;
      Store.set('homeTiles', [...Store.s.homeTiles, { title: v.title || hostOf(url), url }]);
    });
  }
};

/* ============ Find in page ============ */
const Find = {
  open() {
    const t = Tabs.active;
    if (!t || !t.wv) return;
    $('#findbar').classList.add('open');
    $('#findInput').focus();
    $('#findInput').select();
  },
  run(forward = true, newSession = false) {
    const q = $('#findInput').value, wv = Tabs.active?.wv;
    if (!wv || !Tabs.active.ready) return;
    if (!q) { wv.stopFindInPage('clearSelection'); $('#findCount').textContent = ''; return; }
    wv.findInPage(q, { forward, findNext: newSession });
  },
  result(r) { if (r.finalUpdate !== false) $('#findCount').textContent = r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : '0/0'; },
  close() {
    if (!$('#findbar').classList.contains('open')) return;
    $('#findbar').classList.remove('open');
    const t = Tabs.active;
    if (t?.wv && t.ready) { t.wv.stopFindInPage('clearSelection'); t.wv.focus(); }
  },
  init() {
    const inp = $('#findInput');
    inp.addEventListener('input', () => this.run(true, true));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.run(!e.shiftKey, false);
      if (e.key === 'Escape') this.close();
    });
    $('#findNext').onclick = () => this.run(true, false);
    $('#findPrev').onclick = () => this.run(false, false);
    $('#findClose').onclick = () => this.close();
  }
};


/* ============ Welcome Tab – תווית קבועה + אשף הגדרה ראשונית ============ */
const SVG = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const WICONS = {
  palette: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  pad: '<path d="M7 9v4M5 11h4M15.5 10.5h.01M18 12.5h.01"/><path d="M6.5 6h11a4 4 0 0 1 4 4.4l-.6 5.4a2.7 2.7 0 0 1-4.7 1.5L14.5 15h-5l-1.7 2.3a2.7 2.7 0 0 1-4.7-1.5l-.6-5.4A4 4 0 0 1 6.5 6z"/>',
  side: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  bolt: '<path d="M13 3L4 14h7l-1 7 9-11h-7z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  brush: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.1-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  redo: '<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/>'
};
const GM_KEYS = ['gmSleepBg', 'ramLimitOn', 'netLimitOn', 'muteBackground', 'gmNoFx', 'gpuBoost'];
const GM_PRESETS = {
  max:  { name: 'ביצועים מקסימליים', desc: 'כל רכיבי מצב הגיימינג פעילים. מתאים כשמשחקים ברקע.', icon: WICONS.bolt,
          v: { gmSleepBg: true, ramLimitOn: true, netLimitOn: true, muteBackground: true, gmNoFx: true, gpuBoost: true } },
  bal:  { name: 'מאוזן', desc: 'חוסך זיכרון ומשתיק רקע, ושומר על האפקטים והמהירות.', icon: WICONS.pad,
          v: { gmSleepBg: false, ramLimitOn: true, netLimitOn: false, muteBackground: true, gmNoFx: false, gpuBoost: true } },
  off:  { name: 'רגיל', desc: 'בלי הגבלות. אפשר להפעיל רכיבים בודדים מתי שרוצים.', icon: WICONS.spark,
          v: { gmSleepBg: false, ramLimitOn: false, netLimitOn: false, muteBackground: false, gmNoFx: false, gpuBoost: true } }
};

const Welcome = {
  built: false, wstep: 0,

  pinnedTab() { return Tabs.list.find(t => t.pinned && t.url === WELCOME); },
  ensurePinned() {
    document.body.classList.toggle('has-welcome-tab', !!Store.s.showWelcomeTab);
    const p = this.pinnedTab();
    if (Store.s.showWelcomeTab && !p) Tabs.create(WELCOME, { pinned: true, background: true, silent: true });
    if (!Store.s.showWelcomeTab && p) {
      const wasActive = Tabs.active === p;
      Tabs.close(p, true);
      if (wasActive && Tabs.active === p) Tabs.activate(Tabs.regular()[0]);
    }
  },
  open() {
    const ex = this.pinnedTab() || Tabs.list.find(t => t.url === WELCOME);
    if (ex) Tabs.activate(ex); else Tabs.create(WELCOME, { afterActive: true });
  },
  show(v) {
    const root = $('#welcome');
    root.classList.toggle('show', v);
    if (v && !this.built) this.build();
    if (v) {
      root.classList.toggle('setup', !Store.s.setupDone);
      if (!Store.s.setupDone) this.renderWizard();
    }
  },

  /* ---------- רכיבים משותפים ---------- */
  card(title, ic, sub, wide) {
    const c = el('section', 'wc-card' + (wide ? ' wide' : ''));
    const h = el('div', 'wc-head');
    const i = el('span', 'wc-ic'); i.innerHTML = SVG(ic);
    const t = el('div');
    t.append(el('h3', '', title));
    if (sub) t.append(el('p', '', sub));
    h.append(i, t);
    const body = el('div', 'wc-body');
    c.append(h, body);
    return [c, body];
  },
  wallpaperOptions(host) {
    const modes = el('div', 'wc-options');
    const MODES = { aurora: 'Aurora', grid: 'Cyber Grid', image: 'תמונה', none: 'אחיד' };
    const sync = () => $$('button', modes).forEach(x => x.classList.toggle('on', x.dataset.v === Store.s.wallpaperMode));
    for (const [v, l] of Object.entries(MODES)) {
      const o = el('button', 'wc-opt wp-' + v);
      o.dataset.v = v;
      o.append(el('i'), el('span', '', l));
      o.onclick = () => {
        if (v === 'image' && !Store.s.wallpaper) { host.querySelector('input[type=file]')?.click(); return; }
        Store.set('wallpaperMode', v); Sound.play('click');
      };
      modes.append(o);
    }
    sync(); Controls.watch('wallpaperMode', sync);
    return modes;
  },
  themeCards() {
    const g = el('div', 'tp-grid');
    const sync = () => $$('.tp', g).forEach(c => c.classList.toggle('on', c.dataset.id === Store.s.theme));
    for (const [id, t] of Object.entries(THEMES)) {
      const c = el('button', 'tp');
      c.dataset.id = id;
      c.style.cssText = `--tbg:${t.bg};--tsf:${t.surface};--ta:${t.accent};--ta2:${t.accent2};--ttx:${t.text}`;
      c.innerHTML = '<span class="tp-win"><i class="tp-bar"><b></b><b></b></i><i class="tp-body"><b></b><b></b><b></b></i></span>';
      c.append(el('span', 'tp-name', t.name));
      c.onclick = () => { const { name, ...colors } = t; Store.patch({ theme: id, ...colors }); Sound.play('click'); };
      g.append(c);
    }
    sync(); Controls.watch('theme', sync);
    return g;
  },
  wallpaperTools() {
    const w = el('div', 'wc-inline');
    const pick = CustomPanel.wallpaperPicker();
    pick.classList.add('wz-hidden-picker');
    const up = el('button', 'btn small', 'בחר תמונה…');
    up.onclick = () => pick.querySelector('input[type=file]').click();
    w.append(up, pick);
    Controls.build(w, [{ type: 'range', key: 'wallpaperDim', label: 'עמעום', min: 0, max: 0.95, step: 0.05, fmt: v => Math.round(v * 100) + '%' }]);
    return w;
  },
  chips(key, options) {
    const row = el('div', 'wc-chips');
    const sync = () => $$('button', row).forEach(b => b.classList.toggle('on', b.dataset.v === Store.s[key]));
    for (const [v, l] of Object.entries(options)) {
      const b = el('button', 'wc-chip', l);
      b.dataset.v = v;
      b.onclick = () => { Store.set(key, v); Sound.play('click'); };
      row.append(b);
    }
    sync(); Controls.watch(key, sync);
    return row;
  },
  appsList() {
    const apps = el('div', 'wc-apps');
    const sync = () => {
      apps.innerHTML = '';
      DEFAULTS.sidebarApps.forEach(app => {
        const on = Store.s.sidebarApps.some(x => x.id === app.id);
        const a = el('button', 'wc-app' + (on ? ' on' : ''));
        const ic = el('span', 'app-ic');
        const cur = Store.s.sidebarApps.find(x => x.id === app.id);
        ic.append(siteIcon(app.url, cur?.icon, app.name));
        const chk = el('i', 'wc-check'); chk.innerHTML = on ? SVG(WICONS.check) : '+';
        a.append(ic, el('span', '', app.name), chk);
        a.onclick = () => {
          Store.set('sidebarApps', on ? Store.s.sidebarApps.filter(x => x.id !== app.id) : [...Store.s.sidebarApps, structuredClone(app)]);
          if (on) SidePanel.unload(app.id);
          Sound.play(on ? 'off' : 'on');
        };
        apps.append(a);
      });
    };
    sync(); Controls.watch('sidebarApps', sync);
    return apps;
  },
  presets() {
    const row = el('div', 'wz-presets');
    const sync = () => $$('.wz-preset', row).forEach(c => {
      const pv = GM_PRESETS[c.dataset.id].v;
      c.classList.toggle('on', GM_KEYS.every(k => !!Store.s[k] === pv[k]));
    });
    for (const [id, p] of Object.entries(GM_PRESETS)) {
      const c = el('button', 'wz-preset');
      c.dataset.id = id;
      const i = el('span', 'wc-ic'); i.innerHTML = SVG(p.icon);
      const on = GM_KEYS.filter(k => p.v[k]).length;
      c.append(i, el('b', '', p.name), el('small', '', p.desc), el('em', '', `${on}/${GM_KEYS.length} רכיבים פעילים`));
      c.onclick = () => { Store.patch(p.v); Sound.play('on'); };
      row.append(c);
    }
    sync(); GM_KEYS.forEach(k => Controls.watch(k, sync));
    return row;
  },

  /* ---------- אשף הגדרה ראשונית ---------- */
  steps() {
    return [
      { kicker: 'ברוך הבא', title: 'ברוך הבא ל-WEBRIX', sub: 'הדפדפן שנבנה לגיימרים. נגדיר אותו בשבילך תוך פחות מדקה.', next: 'בוא נתחיל', intro: true,
        body: (b) => {
          const feats = el('div', 'wz-feats');
          [[WICONS.pad, 'מצב גיימינג', 'שליטה מלאה על RAM, רשת ואפקטים'],
           [ICONS.cpu, 'ביצועים', 'כרטיסיות רדומות וחוסם פרסומות מובנה'],
           [WICONS.brush, 'עיצוב בלי גבולות', 'ערכות נושא, טפטים מונפשים ו-Mods']].forEach(([ic, t, d]) => {
            const f = el('div', 'wz-feat');
            const i = el('span', 'wc-ic'); i.innerHTML = SVG(ic);
            const tx = el('div'); tx.append(el('b', '', t), el('small', '', d));
            f.append(i, tx); feats.append(f);
          });
          b.append(feats);
        } },
      { kicker: 'עיצוב', title: 'בחר ערכת נושא', sub: 'הצבעים משתנים מיד. תמיד אפשר לכוונן הכל ב-Style Lab.',
        body: (b) => b.append(this.themeCards()) },
      { kicker: 'מראה', title: 'רקע וסגנון', sub: 'איך הדפדפן ייראה מאחורי דף הבית ובשורת הכרטיסיות.',
        body: (b) => {
          const pick = CustomPanel.wallpaperPicker(); pick.classList.add('wz-hidden-picker');
          b.append(el('label', 'wz-label', 'רקע'), this.wallpaperOptions(b), pick);
          b.append(el('label', 'wz-label', 'סגנון כרטיסיות'), this.chips('tabStyle', { angled: 'זוויתי', rounded: 'מעוגל', pill: 'גלולה', flat: 'שטוח' }));
          b.append(el('label', 'wz-label', 'צפיפות'), this.chips('density', { compact: 'קומפקטי', normal: 'רגיל', comfy: 'מרווח' }));
        } },
      { kicker: 'ביצועים', title: 'מצב גיימינג', sub: 'בחר פרופיל התחלתי. כל רכיב אפשר להדליק או לכבות בנפרד בכרטיסיית Welcome או ב-Control Core.',
        body: (b) => b.append(this.presets()) },
      { kicker: 'סרגל צד', title: 'אפליקציות לצד המשחק', sub: 'האפליקציות שיהיו זמינות תמיד בסרגל הצד.',
        body: (b) => { b.append(this.appsList()); Controls.build(b, [{ type: 'toggle', key: 'showSidebar', label: 'הצג את סרגל הצד' }]); } },
      { kicker: 'סיום', title: 'הכל מוכן', sub: 'כל ההגדרות נשארות זמינות בכרטיסיית Welcome הקבועה, משמאל לכרטיסיות.', next: 'התחל לגלוש',
        body: (b) => {
          const keys = el('div', 'wz-keys');
          [['Ctrl+T', 'כרטיסייה חדשה'], ['Ctrl+Shift+G', 'מצב גיימינג'], ['Ctrl+Shift+P', 'Control Core'], ['Ctrl+,', 'Style Lab']].forEach(([k, v]) => {
            const r = el('div'); r.append(el('kbd', '', k), el('span', '', v)); keys.append(r);
          });
          const done = el('div', 'wz-done'); done.innerHTML = SVG(WICONS.check);
          b.append(done, keys);
        } }
    ];
  },
  renderWizard() {
    const wz = $('#wz'), steps = this.steps(), i = clamp(this.wstep, 0, steps.length - 1), st = steps[i];
    wz.innerHTML = '';
    const box = el('div', 'wz-box' + (st.intro ? ' intro' : ''));
    const top = el('div', 'wz-top');
    const prog = el('div', 'wz-prog');
    steps.forEach((_, k) => prog.append(el('i', k < i ? 'done' : k === i ? 'on' : '')));
    const skip = el('button', 'wz-skip', 'דלג על ההגדרה');
    skip.onclick = () => this.finish(false);
    top.append(prog, i < steps.length - 1 ? skip : el('span'));
    const head = el('div', 'wz-head');
    head.append(el('span', 'wz-kicker', st.kicker), el('h1', '', st.title), el('p', '', st.sub));
    const body = el('div', 'wz-body');
    st.body(body);
    const nav = el('div', 'wz-nav');
    const next = el('button', 'btn primary wz-next', st.next || 'המשך');
    next.onclick = () => {
      if (i === steps.length - 1) { this.finish(true); return; }
      this.wstep = i + 1; Sound.play('click'); this.renderWizard();
    };
    const back = el('button', 'btn ghost wz-back', 'חזור');
    back.onclick = () => { this.wstep = i - 1; Sound.play('click'); this.renderWizard(); };
    back.style.visibility = i > 0 ? 'visible' : 'hidden';
    nav.append(back, el('span', 'wz-count', `שלב ${i + 1} מתוך ${steps.length}`), next);
    if (st.intro) {
      const hero = el('div', 'wz-hero');
      hero.innerHTML = '<div class="wz-logo"><img src="logo.png" alt=""></div>';
      box.append(top, hero, head, body, nav);
    } else box.append(top, head, body, nav);
    wz.append(box);
    $('#welcome').scrollTop = 0;
  },
  finish(goBrowse) {
    Store.set('setupDone', true);
    this.wstep = 0;
    $('#welcome').classList.remove('setup');
    Sound.play('on');
    if (goBrowse) {
      const nt = Tabs.regular().find(t => t.url === NEWTAB);
      nt ? Tabs.activate(nt) : Tabs.create(NEWTAB);
    }
    UI.toast('ההגדרות נשמרו. אפשר לשנות אותן בכל רגע בכרטיסיית Welcome');
  },
  restartWizard() {
    Store.set('setupDone', false);
    this.wstep = 0;
    $('#welcome').classList.add('setup');
    this.renderWizard();
  },

  /* ---------- לוח הגדרות מהירות ---------- */
  section(title, ic, desc) {
    const sec = el('section', 'wc-sec');
    const head = el('div', 'wc-sec-head');
    const i = el('span', 'wc-ic'); i.innerHTML = SVG(ic);
    const tx = el('div');
    tx.append(el('h2', '', title), el('p', '', desc));
    head.append(i, tx);
    const body = el('div', 'wc-sec-body');
    sec.append(head, body);
    return [sec, body];
  },
  group(label, ...nodes) {
    const g = el('div', 'wc-group');
    if (label) g.append(el('div', 'wc-label', label));
    g.append(...nodes);
    return g;
  },
  rows(items) {
    const r = el('div', 'wc-rows');
    Controls.build(r, items);
    return r;
  },
  build() {
    this.built = true;
    const root = $('#welcome');
    root.innerHTML = `
      <div class="wz" id="wz"></div>
      <div class="wc-wrap">
        <header class="wc-hero">
          <img src="logo.png" alt="" class="wc-logo">
          <div class="wc-hero-tx">
            <h1>Welcome</h1>
            <p>ההגדרות החשובות של WEBRIX במקום אחד. כל שינוי נשמר מיד.</p>
          </div>
          <button class="btn ghost" id="wcRedo"></button>
        </header>
        <nav class="wc-nav" id="wcNav"></nav>
        <div id="wcSections"></div>
      </div>`;
    const redo = $('#wcRedo');
    redo.innerHTML = SVG(WICONS.redo) + '<span>הפעל את אשף ההגדרה</span>';
    redo.onclick = () => this.restartWizard();
    const box = $('#wcSections'), nav = $('#wcNav');
    const add = (id, label, sec) => {
      sec.id = 'wcs-' + id;
      box.append(sec);
      const b = el('button', 'wc-nav-btn', label);
      b.onclick = () => sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nav.append(b);
    };

    // מראה
    let [sec, b] = this.section('מראה', WICONS.palette, 'ערכת צבעים, רקע וסגנון הכרטיסיות.');
    b.append(
      this.group('ערכת נושא', this.themeCards()),
      this.group('רקע', this.wallpaperOptions(b), this.wallpaperTools()),
      this.group('סגנון כרטיסיות', this.chips('tabStyle', { rounded: 'מעוגל', angled: 'זוויתי', pill: 'גלולה', flat: 'שטוח' })),
      this.group('צפיפות', this.chips('density', { compact: 'קומפקטי', normal: 'רגיל', comfy: 'מרווח' })),
      this.group('כרטיסייה חדשה', (() => { const b = el('button', 'btn small', 'שעון, קיצורים וחיפוש…'); b.style.alignSelf = 'flex-start'; b.onclick = () => UI.openNtCustomize(); return b; })())
    );
    add('look', 'מראה', sec);

    // מצב גיימינג
    [sec, b] = this.section('מצב גיימינג', WICONS.pad, 'בחר פרופיל, או הדלק כל רכיב בנפרד.');
    b.append(
      this.group('פרופיל', this.presets()),
      this.group('רכיבים', this.rows([
        { type: 'toggle', key: 'gmSleepBg', label: 'הרדמה מיידית של כרטיסיות רקע' },
        { type: 'toggle', key: 'ramLimitOn', label: 'הגבלת זיכרון RAM' },
        { type: 'toggle', key: 'netLimitOn', label: 'הגבלת רוחב פס' },
        { type: 'toggle', key: 'muteBackground', label: 'השתקת כרטיסיות ברקע' },
        { type: 'toggle', key: 'gmNoFx', label: 'כיבוי אנימציות ואפקטים' },
        { type: 'toggle', key: 'gpuBoost', label: 'GPU Boost' }
      ]))
    );
    add('gaming', 'מצב גיימינג', sec);

    // סרגל צד
    [sec, b] = this.section('סרגל צד', WICONS.side, 'אפליקציות שזמינות לצד כל אתר.');
    b.append(this.rows([{ type: 'toggle', key: 'showSidebar', label: 'הצג את סרגל הצד' }]), this.group('אפליקציות', this.appsList()));
    add('sidebar', 'סרגל צד', sec);

    // גלישה ופרטיות
    [sec, b] = this.section('גלישה ופרטיות', ICONS.shield, 'חיפוש, חסימת פרסומות ושחזור סשן.');
    b.append(this.rows([
      { type: 'select', key: 'searchEngine', label: 'מנוע חיפוש', options: () => Object.fromEntries(Object.entries(SEARCH_ENGINES).map(([k, v]) => [k, v.name])) },
      { type: 'toggle', key: 'adblock', label: 'חוסם פרסומות וטראקרים' },
      { type: 'toggle', key: 'restoreSession', label: 'שחזר כרטיסיות בהפעלה' },
      { type: 'toggle', key: 'forceDark', label: 'Dark Mode כפוי לכל האתרים' }
    ]));
    add('browse', 'גלישה', sec);

    // אפקטים
    [sec, b] = this.section('אפקטים וצלילים', WICONS.spark, 'תוספות לממשק. כולן כבויות כברירת מחדל.');
    b.append(this.rows([
      { type: 'toggle', key: 'particles', label: 'חלקיקים בדף הבית' },
      { type: 'toggle', key: 'rgbBorder', label: 'מסגרת RGB' },
      { type: 'toggle', key: 'sounds', label: 'צלילי ממשק' },
      { type: 'toggle', key: 'ntStats', label: 'נתוני ביצועים בדף הבית' }
    ]));
    add('fx', 'אפקטים', sec);

    // כלים
    [sec, b] = this.section('כלים', WICONS.bolt, 'הגדרות מתקדמות ונתוני גלישה.');
    const links = el('div', 'wc-links');
    [
      ['Control Core', 'ביצועים ומדדים', ICONS.cpu, () => UI.openDrawer('core')],
      ['Style Lab', 'צבעים, גופנים ו-Mods', WICONS.brush, () => UI.openDrawer('custom')],
      ['היסטוריה', 'אתרים שביקרת בהם', WICONS.clock, () => UI.showHistory()],
      ['הורדות', 'קבצים שהורדת', WICONS.down, () => UI.showDownloads()],
      ['ניקוי נתונים', 'מטמון, עוגיות והיסטוריה', WICONS.trash, () => UI.clearDataDialog()]
    ].forEach(([t, d, ic, fn]) => {
      const a = el('button', 'wc-link');
      const i = el('span', 'wc-ic'); i.innerHTML = SVG(ic);
      const tx = el('div'); tx.append(el('b', '', t), el('small', '', d));
      a.append(i, tx);
      a.onclick = fn;
      links.append(a);
    });
    b.append(links);
    add('tools', 'כלים', sec);
  }
};


/* ============ התאמה אישית של הכרטיסייה החדשה ============ */
const NT_KEYS = ['ntClockStyle', 'ntClockFont', 'ntClockWeight', 'ntClockSize', 'ntClockColor', 'ntClock24', 'ntSeconds', 'ntGreeting', 'ntGreetName', 'ntDate',
  'ntSearch', 'ntSearchStyle', 'ntTiles', 'ntTileSize', 'ntTileShape', 'ntTileLabels', 'ntAlign', 'ntStats', 'particles'];
const WEIGHT_NAMES = { 100: 'דק מאוד', 200: 'דק', 300: 'קל', 400: 'רגיל', 500: 'בינוני', 600: 'חצי מודגש', 700: 'מודגש', 800: 'כבד', 900: 'שחור' };
const NtPanel = {
  build() {
    const body = $('#ntBody');
    Controls.build(body, [
      { section: 'שעון' },
      { type: 'chips', key: 'ntClockStyle', label: 'סגנון', options: { digital: 'דיגיטלי', stacked: 'שתי שורות', analog: 'אנלוגי', none: 'ללא' } },
      { type: 'chips', key: 'ntClockFont', label: 'גופן', options: { roboto: 'Roboto', condensed: 'צר', montserrat: 'Montserrat', dmsans: 'DM Sans', bitter: 'Bitter', system: 'מערכת' } },
      { type: 'range', key: 'ntClockWeight', label: 'עובי', min: 100, max: 900, step: 100, fmt: v => `${WEIGHT_NAMES[v]} · ${v}` },
      { type: 'range', key: 'ntClockSize', label: 'גודל', min: 50, max: 170, step: 5, fmt: v => v + '%' },
      { type: 'chips', key: 'ntClockColor', label: 'צבע', options: { text: 'טקסט', accent: 'צבע ראשי', soft: 'עמום', gradient: 'מעבר צבע' } },
      { type: 'toggle', key: 'ntClock24', label: 'שעון 24 שעות' },
      { type: 'toggle', key: 'ntSeconds', label: 'הצג שניות' },
      { section: 'ברכה ותאריך' },
      { type: 'toggle', key: 'ntGreeting', label: 'הצג ברכה' },
      { type: 'text', key: 'ntGreetName', label: 'השם שלך בברכה', placeholder: 'לדוגמה: אלון', max: 24 },
      { type: 'toggle', key: 'ntDate', label: 'הצג תאריך' },
      { section: 'חיפוש' },
      { type: 'toggle', key: 'ntSearch', label: 'הצג תיבת חיפוש' },
      { type: 'chips', key: 'ntSearchStyle', label: 'סגנון', options: { rounded: 'מעוגל', pill: 'גלולה', line: 'קו תחתון' } },
      { section: 'קיצורים' },
      { type: 'toggle', key: 'ntTiles', label: 'הצג קיצורים' },
      { type: 'chips', key: 'ntTileSize', label: 'גודל', options: { small: 'קטן', medium: 'בינוני', large: 'גדול' } },
      { type: 'chips', key: 'ntTileShape', label: 'צורה', options: { rounded: 'מעוגל', circle: 'עיגול', square: 'ריבוע' } },
      { type: 'toggle', key: 'ntTileLabels', label: 'הצג שמות' },
      { section: 'פריסה ורקע' },
      { type: 'chips', key: 'ntAlign', label: 'מיקום התוכן', options: { center: 'מרכז', top: 'למעלה' } },
      { type: 'chips', key: 'wallpaperMode', label: 'רקע', options: { none: 'אחיד', aurora: 'Aurora', grid: 'Cyber Grid', image: 'תמונה' } },
      { type: 'toggle', key: 'ntStats', label: 'נתוני ביצועים בתחתית' },
      { type: 'toggle', key: 'particles', label: 'חלקיקים' },
      { custom: () => {
        const w = el('div', 'quick-actions');
        const reset = el('button', 'btn ghost', 'איפוס הכרטיסייה החדשה');
        reset.onclick = () => { const p = {}; NT_KEYS.forEach(k => { p[k] = structuredClone(DEFAULTS[k]); }); Store.patch(p); UI.toast('הכרטיסייה החדשה אופסה'); };
        const more = el('button', 'btn ghost', 'עוד עיצוב ב-Style Lab');
        more.onclick = () => UI.openDrawer('custom');
        w.append(reset, more);
        return w;
      } }
    ]);
  }
};
