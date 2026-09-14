/* Recorder shared helpers (audio + video recorders share this folder scope). */
i18n.add('en', {
  recorder: {
    micDevice: 'Microphone', cameraDevice: 'Camera', record: 'Record', pause: 'Pause', resume: 'Resume', stop: 'Stop',
    reRecord: 'Record again', download: 'Download recording', level: 'Input level', source: 'Source',
    camera: 'Camera', screen: 'Screen', both: 'Screen + camera',
    denied: 'Permission was denied', deniedHint: 'Allow access in your browser settings, then retry.',
    nodevice: 'No device found', nodeviceHint: 'Connect a microphone or camera and retry.',
    insecure: 'Recording needs a secure connection', insecureHint: 'Recording requires HTTPS (or localhost).',
    unsupported: 'Recording is not supported in this browser', hardware: 'Device unavailable',
    hardwareHint: 'It may be in use by another app. Close it and retry.', retry: 'Retry',
    cancelled: 'Sharing was cancelled', maxReached: 'Maximum duration reached', recorded: 'Recording saved',
    recording: 'Recording…', paused: 'Paused', deleted: 'Recording discarded',
  },
});

function recSupportReason(needsDisplay) {
  if (!isBrowser) return 'unsupported';
  if (!win.isSecureContext) return 'insecure';
  if (!win.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'unsupported';
  if (needsDisplay && !navigator.mediaDevices.getDisplayMedia) return 'unsupported';
  return null;
}
function recNormalizeError(err) {
  const n = err && err.name;
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return 'denied';
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'nodevice';
  if (n === 'NotReadableError' || n === 'TrackStartError') return 'hardware';
  if (n === 'AbortError') return 'cancelled';
  return 'error';
}
async function recDevices(kind) {
  if (!isBrowser || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.filter(d => d.kind === kind).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${kind === 'audioinput' ? t('recorder.micDevice') : t('recorder.cameraDevice')} ${i + 1}` }));
  } catch { return []; }
}
function recPickMime(candidates) {
  if (!isBrowser || !win.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return '';
}
function recStopStream(stream) { if (stream) for (const tr of stream.getTracks()) { try { tr.stop(); } catch {} } }

const REC_META = {
  denied: { icon: 'mic-off', key: 'denied', hint: 'deniedHint', retry: true },
  nodevice: { icon: 'mic-off', key: 'nodevice', hint: 'nodeviceHint', retry: true },
  insecure: { icon: 'alert-triangle', key: 'insecure', hint: 'insecureHint', retry: false },
  unsupported: { icon: 'alert-triangle', key: 'unsupported', hint: '', retry: false },
  hardware: { icon: 'alert-circle', key: 'hardware', hint: 'hardwareHint', retry: true },
  cancelled: { icon: 'alert-circle', key: 'cancelled', hint: '', retry: true },
  error: { icon: 'alert-circle', key: 'hardware', hint: 'hardwareHint', retry: true },
};
/** Render a permission/hardware state panel shared by the audio and video recorders. */
function recRenderState(panelEl, state, host) {
  const meta = REC_META[state];
  panelEl.hidden = !meta;
  if (!meta) return;
  panelEl.replaceChildren(
    h('div', { class: 'o-recorder-state-icon' }, icon(meta.icon, { size: 32 })),
    h('p', { class: 'o-recorder-state-msg' }, host.t('recorder.' + meta.key)),
    meta.hint ? h('p', { class: 'o-recorder-state-hint' }, host.t('recorder.' + meta.hint)) : null,
    meta.retry ? h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: () => host.start() }, host.t('recorder.retry')) : null);
}
/** A rolling-column level meter + scrolling waveform, drawn from an AnalyserNode on a rAF loop. */
function recMeter(analyser, levelFill, waveCanvas, maxCols = 80) {
  const buf = new Uint8Array(analyser.fftSize);
  const levels = [];
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; if (v > peak) peak = v; }
    if (levelFill) levelFill.style.width = Math.min(100, Math.round(peak * 130)) + '%';
    if (waveCanvas) {
      levels.push(peak); if (levels.length > maxCols) levels.shift();
      const ctx = waveCanvas.getContext('2d'), w = waveCanvas.width, hh = waveCanvas.height, colW = w / maxCols;
      ctx.clearRect(0, 0, w, hh);
      ctx.fillStyle = getComputedStyle(waveCanvas).color || '#4f46e5';
      levels.forEach((lv, i) => { const barH = Math.max(2, lv * hh); ctx.fillRect(i * colW, (hh - barH) / 2, Math.max(1, colW - 1), barH); });
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
