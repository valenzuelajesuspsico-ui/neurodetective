import { useState, useEffect } from "react";

// ===== Motor de sonido (Web Audio API, sintetizado — sin archivos) =====
export const SFX = (() => {
  let ctx = null, enabled = false;
  const ac = () => { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); } return ctx; };
  function tone(freq, dur, type = "sine", gain = 0.14, slideTo = null) {
    if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
  }
  function swish(dur = 0.3) {
    if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(450, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(c.destination); src.start(t); src.stop(t + dur);
  }
  return {
    setEnabled(v) { enabled = v; if (v) { const c = ac(); if (c && c.state === "suspended") c.resume(); } },
    isEnabled: () => enabled,
    pageTurn: () => swish(0.3),
    correct() { tone(523.25, 0.12, "sine", 0.15); setTimeout(() => tone(783.99, 0.16, "sine", 0.14), 85); },
    wrong() { tone(180, 0.26, "sawtooth", 0.12, 110); },
    streak() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.14, "triangle", 0.13), i * 65)); },
    stamp() { swish(0.08); tone(95, 0.15, "square", 0.2); },
    click() { tone(660, 0.04, "sine", 0.05); },
  };
})();

export const NO_MOTION = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

export // Revela un texto letra por letra (respeta prefers-reduced-motion).
function Typewriter({ text, speed = 16 }) {
  const [n, setN] = useState(NO_MOTION ? text.length : 0);
  useEffect(() => {
    if (NO_MOTION) { setN(text.length); return; }
    setN(0);
    let i = 0;
    const id = setInterval(() => { i += 1; setN(i); if (i >= text.length) clearInterval(id); }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  const done = n >= text.length;
  return <span className={done ? "" : "nd-caret"}>{text.slice(0, n)}</span>;
}
