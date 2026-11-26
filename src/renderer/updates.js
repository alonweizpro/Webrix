'use strict';
/* ============ עדכונים ============
   הבדיקה והמידע מגיעים מה-main (electron-updater + GitHub Releases).
   שום דבר לא יורד או מותקן בלי לחיצה של המשתמש. */
const Updates = {
  st: { state: 'idle' }, version: '', packaged: true, notifiedFor: null, modalOpen: false,

  async init() {
    $('#updateBtn').onclick = () => this.open();
    try {
      const s = await webrix.update.get();
      this.apply(s);
    } catch { /* ignore */ }
    webrix.update.onState(s => this.apply(s));
  },

  apply(s) {
    const prev = this.st.state;
    this.st = { ...this.st, ...s };
    if (s.version) this.version = s.version;
    if ('packaged' in s) this.packaged = s.packaged;
    this.renderPill();
    this.renderPanels();
    if (this.modalOpen) this.renderModal();
    const v = this.st.info?.version;
    if (s.state === 'available' && v && this.notifiedFor !== v) {
      this.notifiedFor = v;
      UI.toast(`גרסה ${v} של WEBRIX זמינה`, { timeout: 9000, action: { label: 'פרטים', fn: () => this.open() } });
    }
    if (s.state === 'installing' && prev !== 'installing') this.showInstalling();
    if (s.state === 'downloaded' && prev !== 'downloaded') {
      UI.toast('העדכון ירד ומוכן להתקנה', { timeout: 12000, action: { label: 'הפעל מחדש', fn: () => this.install() } });
    }
  },

  showInstalling() {
    const o = el('div', 'upd-overlay');
    o.innerHTML = '<div><img src="logo.png" alt=""><b>מתקין את העדכון</b><small>WEBRIX ייסגר וייפתח מחדש מעצמו בעוד כמה שניות.</small><i></i></div>';
    document.body.append(o);
  },
  check() { this.apply({ state: 'checking', error: null }); webrix.update.check().then(s => s && this.apply(s)); },
  download() { webrix.update.download(); },
  install() { webrix.update.install(); },

  // \u2066…\u2069 = בידוד LTR, כדי ש-"36.4 MB" לא יתהפך בתוך משפט בעברית
  fmtSize(b) { return '\u2066' + (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round((b || 0) / 1024) + ' KB') + '\u2069'; },
  fmtDate(d) { try { return d ? new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch { return ''; } },
  pct() { return Math.round(this.st.progress?.percent || 0); },

  statusText() {
    const st = this.st, v = st.info?.version;
    switch (st.state) {
      case 'checking': return 'בודק אם יש גרסה חדשה…';
      case 'latest': return 'יש לך את הגרסה העדכנית ביותר';
      case 'available': return `גרסה ${v} זמינה להורדה`;
      case 'downloading': return `מוריד את גרסה ${v || ''}… ${this.pct()}%`;
      case 'downloaded': return `גרסה ${v} מוכנה להתקנה`;
      case 'installing': return 'מתקין את העדכון… WEBRIX ייפתח מחדש בעוד רגע.';
      case 'error': return 'לא הצלחנו לבדוק עדכונים. בדוק את החיבור לאינטרנט ונסה שוב.';
      case 'dev': return 'בדיקת עדכונים פועלת רק בגרסה המותקנת, לא כשמריצים npm start.';
      case 'unavailable': return 'רכיב העדכונים חסר. הרץ npm install בתיקיית הדפדפן.';
      default: return 'עוד לא נבדק';
    }
  },

  /* ---------- כפתור בסרגל העליון ---------- */
  renderPill() {
    const b = $('#updateBtn'), st = this.st.state;
    b.hidden = !['available', 'downloading', 'downloaded', 'installing'].includes(st);
    b.classList.toggle('ready', st === 'downloaded' || st === 'installing');
    const label = $('#updateLabel');
    label.textContent = st === 'downloading' ? `${this.pct()}%` : st === 'installing' ? 'מתעדכן…' : st === 'downloaded' ? 'הפעל מחדש לעדכון' : 'עדכון זמין';
    b.title = this.statusText();
  },

  /* ---------- חלון העדכון ---------- */
  open() {
    if (['idle', 'latest', 'error'].includes(this.st.state) && this.packaged) this.check();
    const body = el('div', 'upd');
    body.id = 'updModal';
    UI.modal({ title: 'עדכוני WEBRIX', body, actions: [] });
    this.modalOpen = true;
    this.renderModal();
    const m = $('#modal');
    const obs = new MutationObserver(() => {
      if (!m.classList.contains('open') || !$('#updModal')) { this.modalOpen = false; obs.disconnect(); }
    });
    obs.observe(m, { attributes: true, childList: true });
  },
  renderModal() {
    const box = $('#updModal');
    if (!box) { this.modalOpen = false; return; }
    const st = this.st, info = st.info;
    box.innerHTML = '';
    const head = el('div', 'upd-head');
    const ic = el('span', 'upd-ic' + (st.state === 'downloaded' ? ' ok' : ''));
    ic.innerHTML = st.state === 'latest'
      ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
    const tx = el('div');
    tx.append(el('b', '', this.statusText()));
    const meta = [`הגרסה שלך: ${this.version || '—'}`];
    if (info?.version && st.state !== 'latest') meta.push(`גרסה חדשה: ${info.version}`);
    if (info?.date && st.state !== 'latest') meta.push(`פורסמה ב-${this.fmtDate(info.date)}`);
    tx.append(el('small', '', meta.join(' · ')));
    head.append(ic, tx);
    box.append(head);

    if (info?.notes && ['available', 'downloading', 'downloaded'].includes(st.state)) {
      box.append(el('div', 'upd-label', 'מה חדש'));
      box.append(el('div', 'upd-notes', info.notes));
    }
    if (st.state === 'downloading') {
      const p = st.progress || {};
      const bar = el('div', 'upd-bar'); const fill = el('i'); fill.style.width = this.pct() + '%'; bar.append(fill);
      box.append(bar);
      const parts = [];
      if (p.total) parts.push(`${this.fmtSize(p.transferred)} מתוך ${this.fmtSize(p.total)}`);
      if (p.bps) parts.push(`${this.fmtSize(p.bps)}/שנייה`);
      box.append(el('small', 'upd-sub', parts.join(' · ') || 'מתחיל הורדה…'));
    }
    if (st.state === 'error' && st.error) box.append(el('small', 'upd-err', st.error));

    const bar = el('div', 'modal-actions');
    const btn = (label, primary, fn) => { const b = el('button', primary ? 'btn primary' : 'btn ghost', label); b.onclick = fn; bar.append(b); return b; };
    const close = () => UI.closeModal();
    if (st.state === 'available') { btn('הורד עדכון', true, () => this.download()); btn('אחר כך', false, close); }
    else if (st.state === 'downloading') { btn('המשך לגלוש', false, close); }
    else if (st.state === 'downloaded') {
      btn('הפעל מחדש ועדכן', true, () => this.install());
      btn('אחר כך', false, close);
      box.append(el('small', 'upd-sub', 'אם תבחר "אחר כך", העדכון יותקן אוטומטית בפעם הבאה שתסגור את הדפדפן.'));
    }
    else if (st.state === 'checking') { const b = btn('בודק…', true, () => {}); b.disabled = true; btn('סגור', false, close); }
    else if (st.state === 'installing') { const b = btn('מתקין…', true, () => {}); b.disabled = true; }
    else if (this.packaged && st.state !== 'unavailable') { btn('בדוק שוב', true, () => this.check()); btn('סגור', false, close); }
    else btn('סגור', true, close);
    box.append(bar);
  },

  /* ---------- סעיף "עדכונים" בהגדרות ---------- */
  panel() {
    const w = el('div', 'upd-panel');
    this.renderPanel(w);
    return w;
  },
  renderPanels() { $$('.upd-panel').forEach(w => this.renderPanel(w)); },
  renderPanel(w) {
    const st = this.st;
    w.innerHTML = '';
    const row = el('div', 'upd-row');
    const tx = el('div');
    tx.append(el('b', '', `WEBRIX ${this.version || ''}`), el('small', '', this.statusText()));
    row.append(tx);
    const act = el('button', 'btn small');
    if (st.state === 'available') { act.textContent = 'הורד עדכון'; act.classList.add('primary'); act.onclick = () => this.open(); }
    else if (st.state === 'downloading') { act.textContent = `${this.pct()}%`; act.onclick = () => this.open(); }
    else if (st.state === 'downloaded') { act.textContent = 'הפעל מחדש ועדכן'; act.classList.add('primary'); act.onclick = () => this.install(); }
    else if (st.state === 'checking') { act.textContent = 'בודק…'; act.disabled = true; }
    else { act.textContent = 'בדוק עדכונים'; act.disabled = !this.packaged || st.state === 'unavailable'; act.onclick = () => this.check(); }
    row.append(act);
    w.append(row);
    if (st.state === 'downloading') {
      const bar = el('div', 'upd-bar'); const fill = el('i'); fill.style.width = this.pct() + '%'; bar.append(fill); w.append(bar);
    }
  }
};


/* ============ בקשות הרשאה מאתרים ============ */
const Perms = {
  queue: [],
  init() {
    webrix.perm.onAsk(r => { this.queue.push(r); if (this.queue.length === 1) this.show(); });
    webrix.perm.onCancel(({ id }) => {
      const first = this.queue[0];
      this.queue = this.queue.filter(r => r.id !== id);
      if (first && first.id === id) this.show();
    });
  },
  what(r) {
    if (r.perm === 'media') {
      const cam = r.media.includes('video'), mic = r.media.includes('audio');
      return cam && mic ? 'להשתמש במצלמה ובמיקרופון' : cam ? 'להשתמש במצלמה' : mic ? 'להשתמש במיקרופון' : 'להשתמש במצלמה או במיקרופון';
    }
    return { notifications: 'לשלוח לך התראות', 'display-capture': 'לשתף את המסך שלך', geolocation: 'לדעת את המיקום שלך', midi: 'לגשת להתקני MIDI', midiSysex: 'לגשת להתקני MIDI' }[r.perm] || 'לקבל הרשאה מיוחדת';
  },
  show() {
    const box = $('#permBox');
    const r = this.queue[0];
    box.innerHTML = '';
    box.classList.toggle('open', !!r);
    if (!r) return;
    const host = (() => { try { return new URL(r.origin).host; } catch { return r.origin; } })();
    const head = el('div', 'perm-head');
    head.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>';
    const tx = el('div');
    tx.append(el('b', '', host), el('span', '', `רוצה ${this.what(r)}`));
    head.append(tx);
    const rem = el('label', 'perm-rem');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = true;
    rem.append(cb, el('span', '', 'זכור את הבחירה לאתר הזה'));
    const bar = el('div', 'perm-actions');
    const answer = (allow) => {
      webrix.perm.answer(r.id, allow, cb.checked);
      this.queue.shift();
      Sound.play(allow ? 'on' : 'off');
      this.show();
    };
    const allow = el('button', 'btn primary small', 'אפשר'); allow.onclick = () => answer(true);
    const deny = el('button', 'btn small', 'חסום'); deny.onclick = () => answer(false);
    bar.append(allow, deny);
    box.append(head, rem, bar);
    Sound.play('alert');
  }
};
