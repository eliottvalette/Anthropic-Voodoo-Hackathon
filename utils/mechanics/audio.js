// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTIL: audio
// TYPE: mechanic
// PURPOSE: Web Audio API helpers — looped background music + layered SFX.
//          Two separate gain busses so SFX play OVER music without interrupting.
//          No external audio files: tones / noise are synthesized procedurally,
//          keeping playable HTML small.
// USAGE:
//   // First user interaction is required to unlock audio (browser autoplay rules):
//   canvas.addEventListener("pointerdown", () => { startMusic(); }, { once: true });
//
//   // Layer SFX whenever you want, music keeps playing:
//   playSfx("shoot");      // short chirp
//   playSfx("hit");        // tone + noise burst
//   playSfx("destroy");    // low boom + noise
//   playSfx("win");        // ascending notes
//   playSfx("lose");       // descending notes
//   playSfx("ui");          // tap blip
//
//   setMusicVolume(0.18); setSfxVolume(0.5);
//   stopMusic();
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _audioCtx = null;
let _musicGain = null;
let _sfxGain = null;
let _musicPlaying = false;
let _musicTimer = null;
let _melodyIdx = 0;

// [freq, durationMs, restMs]  — simple 8-step bassline-ish loop in A minor
const _MELODY = [
  [220, 220, 80], [330, 220, 80], [294, 220, 80], [220, 220, 360],
  [196, 220, 80], [330, 220, 80], [262, 220, 80], [220, 220, 360],
];

function _initAudio() {
  if (_audioCtx) return _audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  _audioCtx = new AC();
  _musicGain = _audioCtx.createGain();
  _musicGain.gain.value = 0.16;
  _musicGain.connect(_audioCtx.destination);
  _sfxGain = _audioCtx.createGain();
  _sfxGain.gain.value = 0.5;
  _sfxGain.connect(_audioCtx.destination);
  return _audioCtx;
}

function _resumeIfNeeded() {
  if (_audioCtx && _audioCtx.state === "suspended") _audioCtx.resume();
}

function _toneSweep(fStart, fEnd, durSec, vol, type) {
  if (!_audioCtx) return;
  const t0 = _audioCtx.currentTime;
  const osc = _audioCtx.createOscillator();
  osc.type = type || "square";
  osc.frequency.setValueAtTime(fStart, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t0 + durSec);
  const g = _audioCtx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
  osc.connect(g);
  g.connect(_sfxGain);
  osc.start(t0);
  osc.stop(t0 + durSec + 0.05);
}

function _noiseBurst(durSec, vol, lowpass) {
  if (!_audioCtx) return;
  const t0 = _audioCtx.currentTime;
  const sr = _audioCtx.sampleRate;
  const buf = _audioCtx.createBuffer(1, Math.max(1, Math.floor(sr * durSec)), sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = _audioCtx.createBufferSource();
  src.buffer = buf;
  const g = _audioCtx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
  let last = src;
  if (lowpass) {
    const lp = _audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = lowpass;
    src.connect(lp);
    last = lp;
  }
  last.connect(g);
  g.connect(_sfxGain);
  src.start(t0);
}

function _toneStep(freqs, stepSec, vol, type) {
  freqs.forEach((f, i) => {
    setTimeout(() => _toneSweep(f, f, stepSec, vol, type || "triangle"), i * stepSec * 1000);
  });
}

function playSfx(kind) {
  const ctx = _initAudio();
  if (!ctx) return;
  _resumeIfNeeded();
  switch (kind) {
    case "shoot":
      _toneSweep(260, 90, 0.12, 0.4, "square");
      _noiseBurst(0.05, 0.18, 1800);
      break;
    case "hit":
      _toneSweep(380, 110, 0.16, 0.45, "sawtooth");
      _noiseBurst(0.12, 0.45, 2200);
      break;
    case "destroy":
      _toneSweep(110, 35, 0.45, 0.6, "sawtooth");
      _noiseBurst(0.30, 0.55, 800);
      break;
    case "win":
      _toneStep([440, 554, 660, 880], 0.16, 0.32, "triangle");
      break;
    case "lose":
      _toneStep([440, 380, 320, 220], 0.18, 0.28, "triangle");
      break;
    case "ui":
      _toneSweep(720, 980, 0.05, 0.25, "triangle");
      break;
  }
}

function _scheduleNextMusicNote() {
  if (!_musicPlaying || !_audioCtx) return;
  const note = _MELODY[_melodyIdx];
  const [f, durMs, restMs] = note;
  const t0 = _audioCtx.currentTime;
  const osc = _audioCtx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = f;
  const g = _audioCtx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.22, t0 + 0.025);
  g.gain.linearRampToValueAtTime(0.0, t0 + durMs / 1000);
  osc.connect(g);
  g.connect(_musicGain);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.05);
  _melodyIdx = (_melodyIdx + 1) % _MELODY.length;
  _musicTimer = setTimeout(_scheduleNextMusicNote, durMs + restMs);
}

function startMusic() {
  const ctx = _initAudio();
  if (!ctx || _musicPlaying) return;
  _resumeIfNeeded();
  _musicPlaying = true;
  _melodyIdx = 0;
  _scheduleNextMusicNote();
}

function stopMusic() {
  _musicPlaying = false;
  if (_musicTimer) clearTimeout(_musicTimer);
  _musicTimer = null;
}

function setMusicVolume(v) { if (_musicGain) _musicGain.gain.value = Math.max(0, Math.min(1, v)); }
function setSfxVolume(v) { if (_sfxGain) _sfxGain.gain.value = Math.max(0, Math.min(1, v)); }
