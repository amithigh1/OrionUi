/* Captcha.
 *   <o-captcha type="text|math|slider" length="5" name="captcha" required></o-captcha>
 *   IMPORTANT: a client-side captcha is a UX deterrent against naive spam scripts, NOT bot protection — the answer lives in the page.
 *   For real protection verify on your server: `challenge: async (type) => ({ id, image?: dataURL, question?: string })` and
 *   `onVerify: async ({ type, id, answer, position }) => boolean`, or use <o-recaptcha> / <o-hcaptcha> / <o-turnstile>.
 *   Methods: verify() -> Promise<boolean>, refresh(), reset(). Value: the typed answer (text/math) or a token once the slider is solved.
 *   Events: o-verify { valid }, o-refresh. Add data-o-rules="captcha" to run verify() during Orion.validate submit.
 */
i18n.add('en', {
  captcha: {
    label: 'Security check', text: 'Type the characters you see', math: 'Type the answer', refresh: 'New challenge', listen: 'Listen to the challenge',
    wrong: 'That answer is not correct', verified: 'Verified', slide: 'Slide the piece into the gap', slideHint: 'Slide to verify', tryAgain: 'Not quite — try again',
    useText: 'Use a text challenge instead', mathSpeech: 'What is {a} {op} {b}?', plus: 'plus', minus: 'minus', times: 'times', upper: 'capital {c}',
    image: 'Security image. Use the listen button to hear it.', noKey: '{vendor}: add a sitekey attribute to load the widget', loading: 'Loading security check…',
    failed: 'Could not load the security check', expired: 'Verification expired, please verify again',
  },
});
if (!O.icons.has('volume-2')) O.icons.add({ 'volume-2': '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>' });
if (!O.icons.has('shield-check')) O.icons.add({ 'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>' });

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const rnd = () => { const a = new Uint32Array(1); (win.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : (a[0] = Math.random() * 2 ** 32); return a[0] / 2 ** 32; };
const rr = (a, b) => a + rnd() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const token = () => Array.from({ length: 24 }, () => CHARS[ri(0, CHARS.length - 1)]).join('');
function palette(el) {
  const cs = getComputedStyle(el), v = n => cs.getPropertyValue(n).trim();
  return { bg1: v('--o-surface-2') || '#f8fafc', bg2: v('--o-surface-3') || '#eef2f7', text: v('--o-text') || '#0f172a', muted: v('--o-text-muted') || '#64748b', ink: ['--o-primary', '--o-text', '--o-danger', '--o-success', '--o-info', '--o-chart-7'].map(v).filter(Boolean), chart: ['--o-chart-1', '--o-chart-2', '--o-chart-3', '--o-chart-4', '--o-chart-5', '--o-chart-7'].map(v).filter(Boolean) };
}
function setupCanvas(c, w, hgt) {
  const dpr = Math.min(2, win.devicePixelRatio || 1);
  c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr);
  c.style.width = w + 'px'; c.style.height = hgt + 'px';
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}
function noise(g, w, hgt, p, dots = 70, lines = 3) {
  for (let i = 0; i < dots; i++) { g.globalAlpha = rr(0.15, 0.5); g.fillStyle = p.chart[ri(0, p.chart.length - 1)] || p.muted; g.beginPath(); g.arc(rr(0, w), rr(0, hgt), rr(0.6, 1.8), 0, 7); g.fill(); }
  for (let i = 0; i < lines; i++) {
    g.globalAlpha = rr(0.35, 0.6); g.strokeStyle = p.ink[ri(0, p.ink.length - 1)] || p.muted; g.lineWidth = rr(1, 2.2);
    g.beginPath(); g.moveTo(rr(-10, w * 0.2), rr(0, hgt)); g.bezierCurveTo(rr(0, w), rr(-hgt, hgt * 2), rr(0, w), rr(-hgt, hgt * 2), rr(w * 0.8, w + 10), rr(0, hgt)); g.stroke();
  }
  g.globalAlpha = 1;
}
function puzzlePath(g, x, y, s, r) {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + s / 2 - r, y); g.arc(x + s / 2, y - r * 0.45, r, Math.PI * 0.8, Math.PI * 0.2, false); g.lineTo(x + s, y);
  g.lineTo(x + s, y + s / 2 - r); g.arc(x + s + r * 0.45, y + s / 2, r, Math.PI * 1.3, Math.PI * 0.7, false); g.lineTo(x + s, y + s);
  g.lineTo(x, y + s);
  g.lineTo(x, y + s / 2 + r); g.arc(x + r * 0.45, y + s / 2, r, Math.PI * 0.7, Math.PI * 1.3, true); g.lineTo(x, y);
  g.closePath();
}

class OCaptcha extends FormElement {
  static props = {
    ...FormElement.props, value: { type: String, default: '' }, type: { type: String, default: 'text', reflect: true }, length: { type: Number, default: 5 },
    width: Number, height: Number, caseSensitive: Boolean, audio: { type: Boolean, default: true }, tolerance: { type: Number, default: 6 },
    challenge: Function, onVerify: Function, texts: Object,
  };
  setup() {
    this.classList.add('o-captcha');
    this.setAttribute('role', 'group');
    on(this, 'click', '[data-o-act]', (e, b) => {
      const a = b.dataset.oAct;
      if (a === 'refresh') { this.refresh(); this._input?.focus(); }
      else if (a === 'listen') this.speak();
      else if (a === 'alt') { this.type = 'math'; requestAnimationFrame(() => this._input?.focus()); }
    });
    if (O.validate && !OCaptcha.__rule) { OCaptcha.__rule = true; O.validate.rule('captcha', (v, p, el) => (el && isFn(el.verify) ? el.verify() : true), () => t('captcha.wrong')); }
  }
  connected() { this.listen(doc, 'o-theme', () => { if (this.type !== 'slider') this._draw(); else if (!this._solved) this.refresh({ silent: true }); }); }
  disconnected() { this._offDrag?.(); if (win.speechSynthesis) speechSynthesis.cancel(); }
  update(changed) {
    if (changed.has('init') || changed.has('type') || changed.has('length') || changed.has('width') || changed.has('height') || changed.has('locale')) { this._build(); this.refresh({ silent: true }); }
    if (changed.has('value') && this._input && this._input.value !== (this.value || '') && this.type !== 'slider') this._input.value = this.value || '';
  }
  get focusTarget() { return this.type === 'slider' ? this._knob : this._input; }
  set focusTarget(v) {}

  _build() {
    const type = this.type, label = this.t('captcha.label');
    this.setAttribute('aria-label', label);
    this.replaceChildren();
    this._input = this._knob = null;
    if (type === 'slider') return this._buildSlider();
    this._canvas = h('canvas', { class: 'o-captcha-canvas', role: 'img', 'aria-label': this.t('captcha.image') });
    const tools = h('div', { class: 'o-captcha-tools' },
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-o-act': 'refresh', 'aria-label': this.t('captcha.refresh'), title: this.t('captcha.refresh') }, icon('refresh')),
      this.audio && win.speechSynthesis ? h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-o-act': 'listen', 'aria-label': this.t('captcha.listen'), title: this.t('captcha.listen') }, icon('volume-2')) : null);
    this._input = h('input', { class: 'o-input o-captcha-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: type === 'math' ? 'numeric' : null, 'aria-label': this.t(type === 'math' ? 'captcha.math' : 'captcha.text'), placeholder: this.t(type === 'math' ? 'captcha.math' : 'captcha.text'), maxlength: type === 'math' ? 4 : this.length + 2 });
    this._input.addEventListener('input', () => { this.classList.remove('is-verified', 'is-wrong'); this.setValue(this._input.value.trim(), { inputOnly: false }); });
    this.append(h('div', { class: 'o-captcha-box' }, this._canvas, tools), this._input);
  }
  _buildSlider() {
    const W = this._w(), H = this.height || Math.round(W / 2);
    this._stage = h('div', { class: 'o-captcha-stage', dir: 'ltr', style: `width:${W}px;height:${H}px` });
    this._bg = h('canvas', { class: 'o-captcha-canvas', role: 'img', 'aria-label': this.t('captcha.slide') });
    this._piece = h('canvas', { class: 'o-captcha-piece', 'aria-hidden': 'true' });
    this._stage.append(this._bg, this._piece, h('button', { type: 'button', class: 'o-btn o-btn-icon o-btn-sm o-captcha-refresh', 'data-o-act': 'refresh', 'aria-label': this.t('captcha.refresh'), title: this.t('captcha.refresh') }, icon('refresh')));
    this._knob = h('button', { type: 'button', class: 'o-captcha-knob', role: 'slider', 'aria-valuemin': 0, 'aria-label': this.t('captcha.slide') }, icon('arrow-right'));
    this._fill = h('div', { class: 'o-captcha-fill' });
    this._hint = h('span', { class: 'o-captcha-hint' }, this.t('captcha.slideHint'));
    this._track = h('div', { class: 'o-captcha-track', dir: 'ltr', style: `width:${W}px` }, this._fill, this._hint, this._knob);
    this.append(this._stage, this._track, h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm o-captcha-alt', 'data-o-act': 'alt' }, this.t('captcha.useText')));
    this._knob.addEventListener('pointerdown', e => this._drag(e));
    this._knob.addEventListener('keydown', e => this._key(e));
  }
  _w() { const avail = this.parentElement ? this.parentElement.clientWidth : 0; const want = this.width || (this.type === 'slider' ? 300 : 200); return avail > 40 ? Math.min(want, avail) : want; }

  /** New challenge. */
  async refresh({ silent = false } = {}) {
    this._solved = false;
    this._fails = 0;
    this.classList.remove('is-verified', 'is-wrong');
    this.value = '';
    if (this._input) this._input.value = '';
    this._syncForm();
    this._server = null;
    if (isFn(this.challenge)) { try { this._server = await this.challenge(this.type); } catch (e) { console.error('[Orion] captcha challenge failed:', e); } }
    const type = this.type;
    if (type === 'math') {
      const op = ['+', '-', '×'][ri(0, 2)];
      let a = ri(2, 12), b = ri(1, 9);
      if (op === '-' && b > a) [a, b] = [b, a];
      if (op === '×') { a = ri(2, 9); b = ri(2, 5); }
      this._q = { a, b, op, text: `${a} ${op} ${b} = ?` };
      this._answer = String(op === '+' ? a + b : op === '-' ? a - b : a * b);
    } else if (type === 'text') this._answer = Array.from({ length: clamp(this.length, 3, 10) }, () => CHARS[ri(0, CHARS.length - 1)]).join('');
    else { this._pos = 0; this._target = 0; }
    this._draw();
    if (type === 'slider') this._place(0);
    if (!silent) this.emit('refresh', {});
  }
  _draw() {
    if (!this.isConnected) return;
    const p = palette(this);
    if (this.type === 'slider') return this._drawSlider(p);
    const W = this._w(), H = this.height || 60, c = this._canvas;
    if (!c) return;
    const g = setupCanvas(c, W, H);
    if (this._server && this._server.image) { const img = new Image(); img.onload = () => g.drawImage(img, 0, 0, W, H); img.src = this._server.image; return; }
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, p.bg1); grd.addColorStop(1, p.bg2);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    noise(g, W, H, p, Math.round(W * H / 140), 2);
    const text = this._server && this._server.question ? this._server.question : this.type === 'math' ? this._q.text : this._answer;
    const chars = [...text], step = (W - 24) / chars.length;
    g.textBaseline = 'middle';
    chars.forEach((ch, i) => {
      g.save();
      g.translate(12 + step * i + step / 2 + rr(-2, 2), H / 2 + rr(-5, 5));
      g.rotate(this.type === 'math' ? rr(-0.15, 0.15) : rr(-0.45, 0.45));
      g.transform(1, rr(-0.15, 0.15), rr(-0.25, 0.25), 1, 0, 0);
      const size = this.type === 'math' ? Math.min(28, step * 1.2) : rr(22, Math.min(34, step * 1.5));
      g.font = `${ri(0, 1) ? 700 : 600} ${size}px ${['ui-sans-serif, system-ui, sans-serif', 'Georgia, serif', 'ui-monospace, monospace'][ri(0, 2)]}`;
      g.fillStyle = p.ink[ri(0, p.ink.length - 1)] || p.text;
      g.textAlign = 'center';
      g.fillText(ch, 0, 0);
      g.restore();
    });
    noise(g, W, H, p, 20, 2);
  }
  _drawSlider(p) {
    const W = this._w(), H = this.height || Math.round(W / 2), s = 42, r = 7, pad = 3;
    this._stage.style.width = W + 'px'; this._stage.style.height = H + 'px'; this._track.style.width = W + 'px';
    const scene = doc.createElement('canvas'), sg = setupCanvas(scene, W, H);
    if (this._server && this._server.image) { this._drawSliderWithImage(p, W, H); return; }
    const grd = sg.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, p.chart[0] || '#2a78d6'); grd.addColorStop(1, p.chart[2] || '#1baf7a');
    sg.fillStyle = grd; sg.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      sg.globalAlpha = rr(0.25, 0.7); sg.fillStyle = p.chart[ri(0, p.chart.length - 1)];
      sg.beginPath();
      if (ri(0, 1)) sg.arc(rr(0, W), rr(0, H), rr(8, 38), 0, 7);
      else { const x = rr(0, W), y = rr(0, H), k = rr(14, 46); sg.moveTo(x, y); sg.lineTo(x + k, y + rr(-k, k)); sg.lineTo(x + rr(-k, k), y + k); sg.closePath(); }
      sg.fill();
    }
    sg.globalAlpha = 1;
    const tx = Math.round(rr(s + 30, W - s - r - 12)), ty = Math.round(rr(r + 10, H - s - 10));
    this._target = tx;
    const g = setupCanvas(this._bg, W, H);
    g.drawImage(scene, 0, 0, W, H);
    puzzlePath(g, tx, ty, s, r);
    g.fillStyle = 'rgba(0,0,0,.42)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; g.stroke();
    const PW = s + r + pad * 2, PH = s + r + pad * 2, pg = setupCanvas(this._piece, PW, PH);
    pg.save(); pg.translate(pad - tx, pad + r - ty);
    puzzlePath(pg, tx, ty, s, r);
    pg.save(); pg.clip(); pg.drawImage(scene, 0, 0, W, H); pg.restore();
    pg.strokeStyle = 'rgba(255,255,255,.95)'; pg.lineWidth = 2; pg.stroke();
    pg.restore();
    this._pad = pad;
    this._piece.style.top = ty - r - pad + 'px';
    this._max = W - s - r - 4;
    this._knob.setAttribute('aria-valuemax', this._max);
  }
  /** Server puzzle: challenge() -> { id, image: bgDataURL, piece: pieceDataURL, y, pieceWidth } — onVerify checks the position. */
  _drawSliderWithImage(p, W, H) {
    const s = this._server, bg = new Image(), pc = new Image();
    bg.onload = () => setupCanvas(this._bg, W, H).drawImage(bg, 0, 0, W, H);
    pc.onload = () => setupCanvas(this._piece, pc.naturalWidth, pc.naturalHeight).drawImage(pc, 0, 0);
    bg.src = s.image;
    if (s.piece) pc.src = s.piece;
    this._pad = 0;
    this._target = NaN;
    this._piece.style.top = (s.y || 0) + 'px';
    this._max = W - (s.pieceWidth || 50);
    this._knob.setAttribute('aria-valuemax', this._max);
  }
  _place(v) {
    this._pos = clamp(v, 0, this._max || 0);
    const W = this._track.clientWidth || this._w(), kw = this._knob.offsetWidth || 40;
    const ratio = this._max ? this._pos / this._max : 0;
    this._piece.style.left = this._pos - (this._pad || 0) + 'px';
    this._knob.style.left = ratio * (W - kw) + 'px';
    this._fill.style.width = ratio * (W - kw) + kw / 2 + 'px';
    this._knob.setAttribute('aria-valuenow', Math.round(this._pos));
    this._knob.setAttribute('aria-valuetext', `${Math.round(this._pos)} / ${this._max}`);
  }
  _drag(e) {
    if (this._solved || e.button > 0) return;
    e.preventDefault();
    const k = this._knob, startX = e.clientX, startV = this._pos, W = this._track.clientWidth, kw = k.offsetWidth, t0 = Date.now();
    let moves = 0;
    try { k.setPointerCapture(e.pointerId); } catch {}
    this.classList.add('is-dragging');
    const mv = ev => { moves++; this._place(startV + ((ev.clientX - startX) / Math.max(1, W - kw)) * this._max); };
    const up = () => { this._offDrag(); this._release(Date.now() - t0 > 180 && moves > 2); };
    k.addEventListener('pointermove', mv); k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
    this._offDrag = () => { k.removeEventListener('pointermove', mv); k.removeEventListener('pointerup', up); k.removeEventListener('pointercancel', up); this.classList.remove('is-dragging'); this._offDrag = null; };
  }
  _key(e) {
    if (this._solved) return;
    const step = e.shiftKey ? 10 : 2, m = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
    if (m[e.key] != null) { e.preventDefault(); this._place(this._pos + m[e.key]); }
    else if (e.key === 'Home') { e.preventDefault(); this._place(0); }
    else if (e.key === 'End') { e.preventDefault(); this._place(this._max); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._release(true); }
  }
  async _release(human) {
    let ok = human && Math.abs(this._pos - this._target) <= this.tolerance;
    if (isFn(this.onVerify)) { try { ok = !!(await this.onVerify({ type: 'slider', id: this._server && this._server.id, position: Math.round(this._pos) })); } catch { ok = false; } }
    if (ok) {
      this._solved = true;
      this._place(this._target);
      this.classList.add('is-verified');
      this._hint.textContent = this.t('captcha.verified');
      this._knob.replaceChildren(iconEl('check'));
      this.setValue(token());
      announce(this.t('captcha.verified'));
      this.emit('verify', { valid: true });
      return;
    }
    this.classList.add('is-wrong');
    animate(this._track, 'shake', { duration: 320 });
    announce(this.t('captcha.tryAgain'), 'assertive');
    this.emit('verify', { valid: false });
    setTimeout(() => {
      this.classList.remove('is-wrong');
      if (++this._fails >= 3) this.refresh(); else if (!this._solved) this._place(0);
    }, 420);
  }
  speak() {
    if (!win.speechSynthesis) return;
    speechSynthesis.cancel();
    let text;
    if (this.type === 'math') text = this.t('captcha.mathSpeech', { a: this._q.a, b: this._q.b, op: this.t('captcha.' + { '+': 'plus', '-': 'minus', '×': 'times' }[this._q.op]) });
    else text = [...(this._answer || '')].map(c => (this.caseSensitive && /[A-Z]/.test(c) ? this.t('captcha.upper', { c }) : c)).join(', ');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = i18n.locale;
    u.rate = 0.75;
    speechSynthesis.speak(u);
  }
  /** verify() -> Promise<boolean> (client check, or the onVerify server hook). */
  async verify() {
    let ok;
    if (this.type === 'slider') ok = !!this._solved;
    else if (isFn(this.onVerify)) { try { ok = !!(await this.onVerify({ type: this.type, id: this._server && this._server.id, answer: this.value })); } catch { ok = false; } }
    else ok = this._check(this.value);
    this.classList.toggle('is-verified', ok);
    this.classList.toggle('is-wrong', !ok);
    this.emit('verify', { valid: ok });
    if (!ok && this.type !== 'slider') { announce(this.t('captcha.wrong'), 'assertive'); const v = this.value; await this.refresh(); this.value = ''; if (v) this._syncForm(); }
    return ok;
  }
  _check(v) {
    if (!v || !this._answer) return false;
    return this.caseSensitive || this.type === 'math' ? String(v).trim() === this._answer : String(v).trim().toLowerCase() === this._answer.toLowerCase();
  }
  getValidity() {
    if (this.type === 'slider' || isFn(this.onVerify) || this.isEmpty()) return null;
    return this._check(this.value) ? null : { flags: { customError: true }, message: this.t('captcha.wrong') };
  }
  formResetCallback() { this.refresh({ silent: true }); }
  reset() { this.refresh(); }
}
define('o-captcha', OCaptcha);
O.Captcha = OCaptcha;
