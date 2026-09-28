// sounds.js — synthesized chess sound effects via Web Audio (no files, works offline).
// Exposes a global `Sound`.

(function () {
  "use strict";

  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // browsers start the context suspended until a user gesture
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // One synthesized tone.
  function tone(opts) {
    const c = ac();
    if (!c) return;
    const {
      freq = 440,
      type = "sine",
      start = 0,
      dur = 0.12,
      gain = 0.2,
      freqEnd = null,
    } = opts;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    // quick attack, smooth decay so it sounds like a soft "click", not a beep
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Short filtered noise burst — used for the "wood knock" of a normal move / capture.
  function knock(opts) {
    const c = ac();
    if (!c) return;
    const { start = 0, dur = 0.07, gain = 0.35, cutoff = 1400 } = opts || {};
    const t0 = c.currentTime + start;
    const frames = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, frames, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // decaying noise
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.5);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    src.start(t0);
  }

  const play = {
    move() {
      knock({ cutoff: 1200, gain: 0.3, dur: 0.06 });
    },
    capture() {
      knock({ cutoff: 2200, gain: 0.45, dur: 0.09 });
      tone({ freq: 180, type: "square", gain: 0.12, dur: 0.08 });
    },
    castle() {
      knock({ cutoff: 1200, gain: 0.3, dur: 0.06 });
      knock({ cutoff: 1200, gain: 0.25, dur: 0.06, start: 0.11 });
    },
    check() {
      tone({ freq: 660, type: "triangle", gain: 0.22, dur: 0.12 });
      tone({ freq: 990, type: "triangle", gain: 0.2, dur: 0.14, start: 0.1 });
    },
    promote() {
      tone({ freq: 523, type: "sine", gain: 0.2, dur: 0.1 });
      tone({ freq: 784, type: "sine", gain: 0.2, dur: 0.12, start: 0.09 });
      tone({ freq: 1046, type: "sine", gain: 0.2, dur: 0.16, start: 0.18 });
    },
    gameEnd() {
      tone({ freq: 523, type: "sine", gain: 0.22, dur: 0.18 });
      tone({ freq: 659, type: "sine", gain: 0.22, dur: 0.18, start: 0.14 });
      tone({ freq: 784, type: "sine", gain: 0.22, dur: 0.3, start: 0.28 });
    },
    start() {
      tone({ freq: 392, type: "sine", gain: 0.18, dur: 0.12 });
      tone({ freq: 587, type: "sine", gain: 0.18, dur: 0.16, start: 0.1 });
    },
  };

  // Pick the right sound for a committed move + resulting status.
  function forMove(move, status) {
    if (!enabled) return;
    try {
      if (status === "checkmate" || status === "stalemate" || status === "draw50") {
        play.gameEnd();
      } else if (move.promotion) {
        play.promote();
      } else if (move.castle || (move.piece && move.piece[1] === "K" && Math.abs(move.to[1] - move.from[1]) === 2)) {
        play.castle();
      } else if (move.captured || move.enPassant) {
        play.capture();
        if (status === "check") play.check();
      } else if (status === "check") {
        play.check();
      } else {
        play.move();
      }
    } catch (e) {
      /* audio is best-effort; never break the game */
    }
  }

  function setEnabled(on) {
    enabled = on;
    if (on) ac(); // unlock the context on the enabling gesture
  }
  function isEnabled() {
    return enabled;
  }
  // Call once on a user gesture to unlock audio (autoplay policies).
  function unlock() {
    ac();
  }

  window.Sound = { forMove, play, setEnabled, isEnabled, unlock };
})();
