// Synthesised sound – no files needed.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.55; this.master.connect(c.destination);
    const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5 * 0.6 + w * 0.4; }
    // engine: rumble noise + turbine whine
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 400;
    this.engG = c.createGain(); this.engG.gain.value = 0;
    n.connect(this.engF).connect(this.engG).connect(this.master); n.start();
    this.whine = c.createOscillator(); this.whine.type = 'sawtooth'; this.whine.frequency.value = 300;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 1800; wf.Q.value = 3;
    this.whG = c.createGain(); this.whG.gain.value = 0;
    this.whine.connect(wf).connect(this.whG).connect(this.master); this.whine.start();
    // wind
    const w = c.createBufferSource(); w.buffer = this.noise; w.loop = true; w.playbackRate.value = 1.3;
    this.windF = c.createBiquadFilter(); this.windF.type = 'highpass'; this.windF.frequency.value = 900;
    this.windG = c.createGain(); this.windG.gain.value = 0;
    w.connect(this.windF).connect(this.windG).connect(this.master); w.start();
    // tone for lock / warnings
    this.tone = c.createOscillator(); this.tone.type = 'square'; this.tone.frequency.value = 900;
    this.toneG = c.createGain(); this.toneG.gain.value = 0; this.tone.connect(this.toneG).connect(this.master); this.tone.start();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }
  engine(throttle, speed01, ab, on) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engG.gain.setTargetAtTime(on ? 0.25 + throttle * 0.35 + ab * 0.35 : 0, t, 0.1);
    this.engF.frequency.setTargetAtTime(250 + throttle * 500 + ab * 900, t, 0.1);
    this.whine.frequency.setTargetAtTime(220 + throttle * 380, t, 0.2);
    this.whG.gain.setTargetAtTime(on ? 0.02 + throttle * 0.03 : 0, t, 0.2);
    this.windG.gain.setTargetAtTime(on ? speed01 * speed01 * 0.25 : 0, t, 0.1);
    this.windF.frequency.setTargetAtTime(600 + speed01 * 1400, t, 0.1);
  }
  // mode: 0 off, 1 seeking (slow beeps), 2 locked (solid), 3 missile warning
  toneMode(mode, time) {
    if (!this.ctx) return; const t = this.ctx.currentTime; let g = 0, f = 900;
    if (mode === 1) { g = (time * 6 % 1) < 0.35 ? 0.05 : 0; f = 1000; }
    else if (mode === 2) { g = 0.05; f = 1600; }
    else if (mode === 3) { g = (time * 8 % 1) < 0.5 ? 0.07 : 0; f = (time * 4 % 1) < 0.5 ? 1200 : 800; }
    this.toneG.gain.setTargetAtTime(g, t, 0.01); this.tone.frequency.setTargetAtTime(f, t, 0.01);
  }
  burst(freq, dur, gain, type = 'lowpass', rate = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  gun() { this.burst(2200, 0.07, 0.22, 'bandpass', 1.5); this.burst(300, 0.08, 0.3); }
  missile() { this.burst(1200, 1.2, 0.35, 'bandpass', 0.6); }
  boom(dist = 0) { const v = Math.max(0.05, 1 - dist / 4000); this.burst(180, 1.8, 0.9 * v); this.burst(900, 0.5, 0.4 * v); }
  hit() { this.burst(3000, 0.12, 0.35, 'highpass'); }
  flare() { this.burst(4000, 0.3, 0.2, 'highpass'); }
  blip(f = 880, d = 0.12, g = 0.08) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.frequency.value = f; o.type = 'triangle';
    const gg = c.createGain(); gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(gg).connect(this.master); o.start(t); o.stop(t + d);
  }
}
