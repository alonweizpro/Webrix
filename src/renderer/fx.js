'use strict';
/* ============ Sound FX – מסונתז בזמן אמת, בלי קבצי אודיו ============ */
const Sound = {
  ctx: null,
  P: {
    click:  [900, 1300, 0.045, 'square'],
    open:   [280, 900, 0.12, 'sawtooth'],
    close:  [760, 220, 0.10, 'triangle'],
    on:     [380, 1250, 0.18, 'sawtooth'],
    off:    [1100, 260, 0.18, 'sawtooth'],
    tick:   [1700, 1700, 0.02, 'sine'],
    alert:  [660, 440, 0.22, 'triangle'],
    sleep:  [500, 160, 0.25, 'sine']
  },
  play(type) {
    const s = Store.s;
    if (!s.sounds) return;
    try {
      this.ctx ||= new AudioContext();
      const c = this.ctx, t = c.currentTime, p = this.P[type] || this.P.click;
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 3200;
      o.type = p[3];
      o.frequency.setValueAtTime(p[0], t);
      o.frequency.exponentialRampToValueAtTime(p[1], t + p[2]);
      const vol = Math.max(0.0002, s.soundVolume * 0.22);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
      o.connect(f).connect(g).connect(c.destination);
      o.start(t); o.stop(t + p[2] + 0.03);
    } catch { /* ignore */ }
  }
};

/* ============ Particles – רץ רק כשדף הבית גלוי, מוגבל ל-30FPS ============ */
const Particles = {
  cv: null, ctx: null, pts: [], running: false, last: 0, raf: 0, mx: -9999, my: -9999,
  init() {
    this.cv = $('#particles');
    this.ctx = this.cv.getContext('2d');
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.update());
    document.addEventListener('mousemove', e => { this.mx = e.clientX; this.my = e.clientY; }, { passive: true });
    this.resize();
  },
  resize() {
    const d = devicePixelRatio || 1;
    this.cv.width = innerWidth * d; this.cv.height = innerHeight * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  },
  _colors: null, _colorKey: '',
  colors() {
    const key = Store.s.accent + Store.s.accent2;
    if (key !== this._colorKey) { this._colorKey = key; this._colors = [hexToRgb(Store.s.accent), hexToRgb(Store.s.accent2)]; }
    return this._colors;
  },
  seed() {
    const n = Store.s.particleCount;
    this.pts = Array.from({ length: n }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: Math.random() * 1.7 + 0.6
    }));
  },
  update() {
    const s = Store.s;
    const want = s.particles && !s.gmNoFx && !document.hidden && UI.newtabVisible;
    if (want) {
      if (this.pts.length !== s.particleCount) this.seed();
      if (!this.running) { this.running = true; this.raf = requestAnimationFrame(t => this.frame(t)); }
    } else if (this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  },
  frame(t) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(tt => this.frame(tt));
    if (t - this.last < 33) return;
    this.last = t;
    const c = this.ctx, W = innerWidth, H = innerHeight, pts = this.pts;
    const [a1, a2] = this.colors();
    c.clearRect(0, 0, W, H);
    for (const p of pts) {
      const dx = p.x - this.mx, dy = p.y - this.my, d2 = dx * dx + dy * dy;
      if (d2 < 14000) { p.vx += dx / 9000; p.vy += dy / 9000; }
      p.vx *= 0.995; p.vy *= 0.995;
      if (Math.abs(p.vx) < 0.05) p.vx += (Math.random() - 0.5) * 0.04;
      if (Math.abs(p.vy) < 0.05) p.vy += (Math.random() - 0.5) * 0.04;
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
    }
    c.lineWidth = 0.6;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = dx * dx + dy * dy;
        if (d < 12000) {
          c.strokeStyle = `rgba(${a2},${(1 - d / 12000) * 0.35})`;
          c.beginPath(); c.moveTo(pts[i].x, pts[i].y); c.lineTo(pts[j].x, pts[j].y); c.stroke();
        }
      }
    }
    c.fillStyle = `rgba(${a1},.9)`;
    for (const p of pts) { c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill(); }
  }
};

/* ============ Spark line chart ============ */
function drawSpark(cv, data, max, rgb) {
  const d = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * d) { cv.width = w * d; cv.height = h * d; }
  const c = cv.getContext('2d');
  c.setTransform(d, 0, 0, d, 0, 0);
  c.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const step = w / 59, top = Math.max(max, 1);
  c.beginPath();
  data.forEach((v, i) => {
    const x = w - (data.length - 1 - i) * step, y = h - 2 - (v / top) * (h - 6);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  });
  c.strokeStyle = `rgb(${rgb})`; c.lineWidth = 1.8; c.stroke();
  c.lineTo(w, h); c.lineTo(w - (data.length - 1) * step, h); c.closePath();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(${rgb},.35)`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fill();
}
