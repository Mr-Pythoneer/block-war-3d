/* Block War 3D — procedural sound (Web Audio, no audio files).
 *
 *   SFX.init()                    create/resume the AudioContext (call from a click)
 *   SFX.play(name, {vol, x, z})   play a sound; x/z make it positional
 *   SFX.setListener(x, z, yaw)    where the player is; forward = (sin yaw, cos yaw)
 *   SFX.music(on)  SFX.setIntensity(0..1)  SFX.heartbeat(on)
 *   SFX.setMaster(v)  SFX.mute(bool)  SFX.isMuted()  SFX.names
 * Every call is a safe no-op when Web Audio is missing.
 */
"use strict";
(function () {
  let ctx = null, master = null, sfxBus = null, musicBus = null, hbGain = null;
  let white = null, brown = null, shaper = null;
  let muted = false, masterVol = 0.8, voices = 0;
  const MAX_VOICES = 32;
  const listener = { x: 0, z: 0, yaw: 0 };
  const lastPlay = {};
  const GAP = { block_hop: 0.06, block_land: 0.1, block_pop: 0.03, hit: 0.025, op: 0.04, mg: 0.05, turret: 0.06, minion_shot: 0.05, zombie_groan: 0.4, zombie_spawn: 0.15, boss_hit: 0.05, kill: 0.03, empty: 0.12, shield_hit: 0.06, player_hurt: 0.15, pickup: 0.05 };
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init() {
    try {
      if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : masterVol;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
      hbGain = ctx.createGain(); hbGain.gain.value = 0; hbGain.connect(master);
      // reusable noise buffers
      const len = ctx.sampleRate * 2;
      white = ctx.createBuffer(1, len, ctx.sampleRate);
      brown = ctx.createBuffer(1, len, ctx.sampleRate);
      const w = white.getChannelData(0), b = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        w[i] = Math.random() * 2 - 1;
        last = (last + 0.02 * w[i]) / 1.02;
        b[i] = last * 3.5;
      }
      shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3.5); }
      shaper.curve = curve;
    } catch (e) { ctx = null; }
  }
  const ok = () => ctx && ctx.state !== "closed";

  // ---------------------------------------------------------------- building blocks
  function env(t, a, peak, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  function tone(out, type, f0, f1, t, dur, peak, a) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = env(t, a || 0.004, peak, dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(out, t, dur, peak, ftype, f0, f1, q, a, buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf || white;
    s.loop = true;
    s.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = ftype || "lowpass";
    f.frequency.setValueAtTime(f0 || 1000, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = q || 0.8;
    const g = env(t, a || 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }
  // per-sound output: gain + stereo pan from the listener
  function output(vol, x, z) {
    const g = ctx.createGain();
    let v = vol;
    let pan = 0;
    if (x !== undefined && z !== undefined) {
      const dx = x - listener.x, dz = z - listener.z, d = Math.hypot(dx, dz);
      if (d > 60) return null;
      v *= 1 / (1 + d / 8);
      if (d > 0.01) {
        const rx = -Math.cos(listener.yaw), rz = Math.sin(listener.yaw); // right of forward (sin y, cos y)
        pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d));
      }
    }
    if (v < 0.004) return null;
    g.gain.value = v;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan * 0.85;
      g.connect(p); p.connect(sfxBus);
    } else g.connect(sfxBus);
    voices++;
    return g;
  }

  // ---------------------------------------------------------------- the sounds: (out, t) => duration
  const S = {
    pistol(o, t) { noise(o, t, 0.13, 0.9, "bandpass", 2200, 500, 0.9); tone(o, "sine", 170, 45, t, 0.11, 0.8); noise(o, t, 0.02, 0.5, "highpass", 4000); return 0.15; },
    mg(o, t) { noise(o, t, 0.09, 0.75, "bandpass", 2600, 700, 1); tone(o, "sine", 190, 60, t, 0.07, 0.6); return 0.1; },
    op(o, t) { noise(o, t, 0.05, 0.55, "highpass", 3200, 1500, 0.7); tone(o, "square", 900, 260, t, 0.045, 0.18); tone(o, "sine", 150, 60, t, 0.05, 0.4); return 0.06; },
    sniper(o, t) { noise(o, t, 0.03, 1, "highpass", 3000); noise(o, t, 0.5, 0.9, "lowpass", 4500, 250, 0.7); tone(o, "sine", 95, 32, t, 0.4, 1); return 0.55; },
    snow(o, t) { noise(o, t, 0.16, 0.6, "lowpass", 900, 300, 0.7, 0.02); tone(o, "sine", 230, 110, t, 0.12, 0.35); return 0.18; },
    tnt_throw(o, t) { noise(o, t, 0.3, 0.5, "bandpass", 350, 1600, 1.5, 0.08); noise(o, t + 0.05, 0.4, 0.15, "highpass", 5000, 7000, 0.5, 0.05); return 0.45; },
    explosion(o, t) {
      noise(o, t, 1.4, 1.2, "lowpass", 1400, 90, 0.7, 0.005, brown);
      noise(o, t, 0.5, 0.6, "lowpass", 3500, 400, 0.6);
      tone(o, "sine", 75, 24, t, 0.9, 1.1);
      for (let i = 0; i < 6; i++) noise(o, t + 0.1 + Math.random() * 0.6, 0.04, 0.25, "highpass", 2500);
      return 1.5;
    },
    turret(o, t) { tone(o, "square", 620, 200, t, 0.05, 0.22); noise(o, t, 0.04, 0.4, "bandpass", 1800, 900, 1.2); return 0.07; },
    minion_shot(o, t) { tone(o, "square", 1400, 480, t, 0.08, 0.14); return 0.1; },
    empty(o, t) { tone(o, "square", 2100, 2100, t, 0.015, 0.12); tone(o, "square", 1300, 1300, t + 0.03, 0.015, 0.1); return 0.06; },
    hit(o, t) { noise(o, t, 0.07, 0.6, "lowpass", 1100, 300, 1); tone(o, "sine", 210, 90, t, 0.07, 0.45); return 0.08; },
    kill(o, t) { noise(o, t, 0.32, 0.7, "lowpass", 700, 140, 3, 0.01); tone(o, "sine", 130, 38, t, 0.28, 0.7); noise(o, t + 0.12, 0.15, 0.35, "bandpass", 500, 200, 2); return 0.4; },
    boss_hit(o, t) { tone(o, "triangle", 190, 70, t, 0.16, 0.6); noise(o, t, 0.12, 0.5, "bandpass", 450, 200, 1.5); return 0.18; },
    zombie_groan(o, t) {
      const dur = rnd(0.6, 1.2), f0 = rnd(68, 125);
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.linearRampToValueAtTime(f0 * rnd(0.7, 0.9), t + dur);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = rnd(4, 7); lg.gain.value = f0 * 0.06;
      lfo.connect(lg); lg.connect(osc.frequency);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass"; f.Q.value = 4;
      f.frequency.setValueAtTime(rnd(420, 600), t);
      f.frequency.linearRampToValueAtTime(rnd(700, 950), t + dur * 0.4);
      f.frequency.linearRampToValueAtTime(rnd(350, 500), t + dur);
      const g = env(t, dur * 0.3, 0.55, dur);
      osc.connect(f); f.connect(g); g.connect(o);
      osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      noise(o, t, dur * 0.8, 0.06, "bandpass", 1200, 800, 2, dur * 0.3);
      return dur;
    },
    zombie_spawn(o, t) { noise(o, t, 0.7, 0.7, "lowpass", 320, 120, 1, 0.08, brown); for (let i = 0; i < 4; i++) noise(o, t + i * 0.12, 0.05, 0.22, "bandpass", rnd(600, 1400), 400, 2); return 0.8; },
    player_hurt(o, t) { tone(o, "sine", 230, 105, t, 0.2, 0.8); noise(o, t, 0.16, 0.5, "lowpass", 800, 200, 1); return 0.22; },
    knockback(o, t) { noise(o, t, 0.28, 0.6, "highpass", 2200, 5000, 0.7); noise(o, t, 0.35, 0.5, "bandpass", 500, 1500, 1.2, 0.03); return 0.4; },
    helmet_crack(o, t) { noise(o, t, 0.07, 0.8, "highpass", 3200); tone(o, "square", 1900, 900, t, 0.04, 0.2); return 0.08; },
    shield_hit(o, t) { tone(o, "sine", 1500, 2600, t, 0.16, 0.45); tone(o, "triangle", 3100, 3100, t, 0.1, 0.15); return 0.18; },
    boss_roar(o, t) {
      const dur = 1.5;
      const osc = ctx.createOscillator(); osc.type = "sawtooth";
      osc.frequency.setValueAtTime(58, t); osc.frequency.linearRampToValueAtTime(72, t + 0.4); osc.frequency.exponentialRampToValueAtTime(38, t + dur);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 9; lg.gain.value = 6; lfo.connect(lg); lg.connect(osc.frequency);
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700; f.Q.value = 2;
      const pre = ctx.createGain(); pre.gain.value = 1.5;
      const ws = ctx.createWaveShaper(); ws.curve = shaper.curve;
      const g = env(t, 0.15, 0.7, dur);
      osc.connect(pre); pre.connect(ws); ws.connect(f); f.connect(g); g.connect(o);
      osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      noise(o, t, dur, 0.4, "lowpass", 500, 120, 1, 0.2, brown);
      return dur;
    },
    boss_die(o, t) { tone(o, "sawtooth", 90, 22, t, 2.0, 0.5, 0.05); noise(o, t, 2.2, 0.9, "lowpass", 600, 60, 0.8, 0.05, brown); noise(o, t + 0.2, 1.2, 0.3, "bandpass", 300, 80, 1); return 2.3; },
    snow_throw(o, t) { noise(o, t, 0.3, 0.55, "bandpass", 550, 1300, 1.5, 0.05); return 0.35; },
    fire_throw(o, t) { noise(o, t, 0.5, 0.7, "bandpass", 280, 900, 1, 0.06); tone(o, "sine", 110, 60, t, 0.35, 0.3); return 0.55; },
    laser_shot(o, t) { tone(o, "sawtooth", 1700, 180, t, 0.26, 0.3); tone(o, "square", 850, 90, t, 0.26, 0.12); return 0.3; },
    wall_rise(o, t) {
      const s = ctx.createBufferSource(); s.buffer = brown; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 280;
      const am = ctx.createGain(); am.gain.value = 0.5;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 17; lg.gain.value = 0.45; lfo.connect(lg); lg.connect(am.gain);
      const g = env(t, 0.1, 1.2, 0.85);
      s.connect(f); f.connect(am); am.connect(g); g.connect(o);
      s.start(t); lfo.start(t); s.stop(t + 0.9); lfo.stop(t + 0.9);
      tone(o, "sine", 60, 40, t + 0.6, 0.3, 0.6);
      return 0.95;
    },
    warning(o, t) { for (let i = 0; i < 3; i++) { tone(o, "square", 440, 440, t + i * 0.3, 0.14, 0.16); tone(o, "square", 330, 330, t + i * 0.3 + 0.15, 0.14, 0.16); } return 0.95; },
    pickup(o, t) { tone(o, "sine", 880, 1320, t, 0.12, 0.35); return 0.14; },
    heal(o, t) { [523, 659, 784].forEach((f, i) => tone(o, "triangle", f, f, t + i * 0.07, 0.2, 0.25)); return 0.4; },
    gold(o, t) { for (let i = 0; i < 7; i++) tone(o, "sine", rnd(1300, 2300), null, t + i * 0.05 + Math.random() * 0.02, 0.18, 0.2); return 0.6; },
    buy(o, t) { noise(o, t, 0.03, 0.3, "highpass", 4000); tone(o, "sine", 1047, 1047, t + 0.02, 0.18, 0.35); tone(o, "sine", 1568, 1568, t + 0.1, 0.3, 0.3); return 0.42; },
    deny(o, t) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900; f.connect(o); tone(f, "square", 140, 120, t, 0.28, 0.25); return 0.3; },
    ui_click(o, t) { tone(o, "square", 1800, 1800, t, 0.012, 0.08); return 0.03; },
    shop_open(o, t) { tone(o, "triangle", 392, 392, t, 0.12, 0.3); tone(o, "triangle", 523, 523, t + 0.08, 0.2, 0.3); return 0.3; },
    shop_close(o, t) { tone(o, "triangle", 523, 523, t, 0.12, 0.3); tone(o, "triangle", 392, 392, t + 0.08, 0.2, 0.3); return 0.3; },
    win(o, t) { [523, 659, 784, 1047].forEach((f, i) => tone(o, "triangle", f, f, t + i * 0.12, i === 3 ? 0.6 : 0.2, 0.35)); return 1.0; },
    game_over(o, t) {
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1200; f.connect(o);
      [392, 330, 262, 196].forEach((fr, i) => tone(f, "sawtooth", fr, fr * (i === 3 ? 0.9 : 1), t + i * 0.28, i === 3 ? 1.1 : 0.3, 0.25));
      return 2;
    },
    shield_up(o, t) { tone(o, "sine", 200, 820, t, 0.45, 0.4, 0.05); tone(o, "sine", 410, 1640, t, 0.45, 0.15, 0.05); return 0.5; },
    fortress_up(o, t) { for (let i = 0; i < 3; i++) { noise(o, t + i * 0.13, 0.22, 0.9, "lowpass", 260, 90, 1, 0.003, brown); tone(o, "sine", 85, 40, t + i * 0.13, 0.18, 0.7); } return 0.6; },
    fortress_warn(o, t) { tone(o, "square", 880, 880, t, 0.1, 0.2); tone(o, "square", 880, 880, t + 0.18, 0.1, 0.2); return 0.32; },
    turret_deploy(o, t) { noise(o, t, 0.05, 0.6, "bandpass", 1500, 700, 2); tone(o, "square", 180, 620, t + 0.08, 0.3, 0.12); noise(o, t + 0.35, 0.04, 0.5, "bandpass", 2000, 900, 2); return 0.45; },
    minion_die(o, t) { tone(o, "square", 800, 55, t, 0.6, 0.22); for (let i = 0; i < 5; i++) noise(o, t + Math.random() * 0.5, 0.03, 0.25, "highpass", 3000); return 0.7; },
    shotgun(o, t) { noise(o, t, 0.22, 1.1, "lowpass", 3000, 300, 0.8); tone(o, "sine", 120, 35, t, 0.2, 1); noise(o, t, 0.03, 0.6, "highpass", 3500); noise(o, t + 0.3, 0.06, 0.25, "bandpass", 1200, 800, 3); noise(o, t + 0.4, 0.05, 0.25, "bandpass", 900, 600, 3); return 0.5; },
    laser_gun(o, t) { tone(o, "sawtooth", 2400, 300, t, 0.3, 0.3); tone(o, "square", 1200, 150, t, 0.3, 0.12); noise(o, t, 0.12, 0.3, "highpass", 4000); return 0.32; },
    mine_place(o, t) { noise(o, t, 0.05, 0.5, "bandpass", 900, 500, 2); tone(o, "square", 1400, 1400, t + 0.15, 0.05, 0.12); tone(o, "square", 1400, 1400, t + 0.3, 0.05, 0.12); return 0.4; },
    freeze(o, t) { noise(o, t, 0.6, 0.8, "highpass", 2500, 6000, 0.7); tone(o, "sine", 1800, 600, t, 0.5, 0.25); for (let i = 0; i < 5; i++) tone(o, "triangle", rnd(2500, 4200), null, t + i * 0.05, 0.15, 0.08); return 0.7; },
    spit(o, t) { noise(o, t, 0.2, 0.6, "bandpass", 700, 300, 3, 0.01); tone(o, "sine", 300, 140, t, 0.12, 0.3); return 0.25; },
    goo_hit(o, t) { noise(o, t, 0.25, 0.7, "lowpass", 900, 200, 4, 0.005); return 0.3; },
    boomer_fuse(o, t) { for (let i = 0; i < 5; i++) tone(o, "square", 1500 + i * 150, null, t + i * 0.13, 0.05, 0.16); noise(o, t, 0.7, 0.15, "highpass", 5000, 8000, 0.5, 0.05); return 0.75; },
    lucky(o, t) { [659, 784, 988, 1319].forEach((f, i) => tone(o, "square", f, f, t + i * 0.07, 0.12, 0.12)); tone(o, "sine", 1319, 1319, t + 0.28, 0.4, 0.25); return 0.7; },
    block_fall(o, t) { noise(o, t, 0.45, 1.1, "lowpass", 600, 80, 1, 0.003, brown); tone(o, "sine", 90, 35, t, 0.35, 0.9); noise(o, t, 0.08, 0.5, "bandpass", 1800, 600, 1.5); return 0.5; },
    split(o, t) { noise(o, t, 0.15, 0.6, "bandpass", 1500, 500, 2); tone(o, "square", 400, 900, t, 0.12, 0.12); return 0.2; },
    mana_empty(o, t) { tone(o, "sine", 600, 140, t, 0.35, 0.25); noise(o, t, 0.3, 0.15, "bandpass", 1200, 300, 3); return 0.4; },
    mana_back(o, t) { tone(o, "sine", 520, 780, t, 0.18, 0.15); tone(o, "sine", 780, 1040, t + 0.08, 0.18, 0.12); return 0.3; },
    // living cubes
    block_hop(o, t) { const f = rnd(260, 360); tone(o, "sine", f, f * 1.9, t, 0.07, 0.3); tone(o, "sine", f * 1.9, f * 0.9, t + 0.06, 0.08, 0.22); return 0.16; },
    block_land(o, t) { noise(o, t, 0.2, 0.7, "lowpass", 380, 90, 1, 0.003, brown); tone(o, "sine", rnd(85, 110), 42, t, 0.16, 0.6); return 0.24; },
    block_pop(o, t) { noise(o, t, 0.06, 0.8, "highpass", 1800, 5000, 0.8); tone(o, "square", rnd(700, 900), 1700, t, 0.06, 0.16); for (let i = 0; i < 3; i++) tone(o, "triangle", rnd(1800, 3200), null, t + 0.04 + i * 0.03, 0.05, 0.08); tone(o, "sine", 160, 60, t, 0.12, 0.35); return 0.2; },
    minion_spawn(o, t) { tone(o, "square", 300, 1200, t, 0.2, 0.16); tone(o, "sine", 1200, 1600, t + 0.18, 0.1, 0.2); return 0.32; },
  };

  function play(name, opts) {
    try {
      if (!ok() || !S[name]) return;
      if (ctx.state === "suspended") return;
      const now = ctx.currentTime;
      const gap = GAP[name] || 0.02;
      if (lastPlay[name] !== undefined && now - lastPlay[name] < gap) return;
      if (voices >= MAX_VOICES) return;
      lastPlay[name] = now;
      const o = opts || {};
      const out = output(o.vol === undefined ? 1 : o.vol, o.x, o.z);
      if (!out) return;
      // slight random colouring so repeats don't sound identical
      const bend = ctx.createBiquadFilter();
      bend.type = "peaking"; bend.frequency.value = rnd(800, 3000); bend.gain.value = rnd(-3, 3);
      bend.connect(out);
      let dur = 1;
      try { dur = S[name](bend, now + 0.005) || 1; } finally {
        // free the voice when this sound has actually finished
        setTimeout(() => { voices--; try { out.disconnect(); } catch (e) { /* ignore */ } }, (dur + 0.15) * 1000);
      }
    } catch (e) { /* never let sound break the game */ }
  }

  // ---------------------------------------------------------------- music bed
  const M = { on: false, timer: null, nextT: 0, step: 0, intensity: 0, target: 0, drone: null, filt: null, drumBus: null, hbNext: 0, hb: false };
  const SCALE = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3]; // A minor pentatonic-ish
  function musicOn() {
    if (!ok() || M.on) return;
    M.on = true;
    const t = ctx.currentTime;
    M.filt = ctx.createBiquadFilter(); M.filt.type = "lowpass"; M.filt.frequency.value = 380; M.filt.Q.value = 3;
    const dg = ctx.createGain(); dg.gain.setValueAtTime(0.0001, t); dg.gain.linearRampToValueAtTime(0.11, t + 3);
    M.filt.connect(dg); dg.connect(musicBus);
    M.drone = [55, 55.4, 82.4].map((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? "triangle" : "sawtooth"; o.frequency.value = f; o.connect(M.filt); o.start(t); return o; });
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 160; lfo.connect(lg); lg.connect(M.filt.frequency); lfo.start(t);
    M.drone.push(lfo);
    M.droneGain = dg;
    M.drumBus = ctx.createGain(); M.drumBus.gain.value = 0; M.drumBus.connect(musicBus);
    M.nextT = t + 0.1;
    if (!M.timer) M.timer = setInterval(schedule, 25);
  }
  function musicOff() {
    if (!M.on) return;
    M.on = false;
    if (!M.hb) { clearInterval(M.timer); M.timer = null; }
    const t = ctx.currentTime;
    M.droneGain.gain.cancelScheduledValues(t);
    M.droneGain.gain.setValueAtTime(M.droneGain.gain.value, t);
    M.droneGain.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    for (const o of M.drone) o.stop(t + 1.6);
    M.drumBus.gain.linearRampToValueAtTime(0, t + 1);
  }
  function pluck(t, f, g) { tone(musicBus, "triangle", f, f, t, 1.4, g, 0.005); tone(musicBus, "sine", f * 2, f * 2, t, 0.6, g * 0.3, 0.005); }
  function schedule() {
    if (!ok()) return;
    const ahead = ctx.currentTime + 0.15;
    while (M.on && M.nextT < ahead) {
      M.intensity += (M.target - M.intensity) * 0.04;
      const i = M.intensity, t = M.nextT, s = M.step;
      if (s % 16 === 0 && Math.random() < 0.55) pluck(t, SCALE[(Math.random() * SCALE.length) | 0], 0.06);
      if (s % 16 === 6 && Math.random() < 0.3) pluck(t, SCALE[(Math.random() * 4) | 0], 0.04);
      if (s % 64 === 0 && Math.random() < 0.6) noise(musicBus, t, 5, 0.05, "bandpass", 300, 900, 2, 2);
      if (i > 0.25) {
        if (s % 4 === 0) tone(M.drumBus, "sine", 120, 38, t, 0.3, 0.9);
        if (s % 8 === 6) noise(M.drumBus, t, 0.18, 0.5, "bandpass", 260, 140, 2);
        if (i > 0.55 && s % 2 === 1) tone(M.drumBus, "square", s % 8 < 4 ? 110 : 98, null, t, 0.12, 0.08);
        if (s % 4 === 2) noise(M.drumBus, t, 0.04, 0.15, "highpass", 6000);
      }
      M.drumBus.gain.setTargetAtTime(Math.max(0, (i - 0.2) * 0.5), t, 0.5);
      M.filt.frequency.setTargetAtTime(380 + i * 900, t, 1);
      const bpm = 80 + 40 * i;
      M.nextT += 60 / bpm / 2;
      M.step++;
    }
    // heartbeat
    if (M.hb) {
      while (M.hbNext < ahead) {
        tone(hbGain, "sine", 62, 38, M.hbNext, 0.13, 0.9);
        tone(hbGain, "sine", 55, 35, M.hbNext + 0.24, 0.12, 0.6);
        M.hbNext += 60 / 75;
      }
    }
  }
  function heartbeat(on) {
    if (!ok()) return;
    const t = ctx.currentTime;
    if (on && !M.hb) M.hbNext = t + 0.05;
    M.hb = !!on;
    hbGain.gain.setTargetAtTime(on ? 0.7 : 0, t, 0.3);
    if (on && !M.on) { // keep the scheduler running even if music is off
      if (!M.timer) M.timer = setInterval(schedule, 25);
    }
  }

  function setListener(x, z, yaw) { listener.x = x; listener.z = z; listener.yaw = yaw; }
  function setIntensity(v) { M.target = Math.max(0, Math.min(1, v || 0)); }
  function setMaster(v) { masterVol = Math.max(0, Math.min(1, v)); if (ok() && !muted) master.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.05); }
  function mute(b) { muted = !!b; if (ok()) master.gain.setTargetAtTime(muted ? 0 : masterVol, ctx.currentTime, 0.05); }

  window.SFX = {
    init,
    play,
    setListener,
    music(on) { try { if (on) musicOn(); else musicOff(); } catch (e) { /* ignore */ } },
    setIntensity,
    setMaster,
    mute,
    isMuted: () => muted,
    heartbeat(on) { try { heartbeat(on); } catch (e) { /* ignore */ } },
    names: Object.keys(S),
  };
})();
