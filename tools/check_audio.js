// Headless smoke test for src/audio.js with a fake AudioContext: every sound, music, heartbeat.
global.window = global;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), pan: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), type: "", curve: null, buffer: null, loop: false });
class FakeCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = "running"; this.destination = node(); }
  createGain() { return node(); } createOscillator() { return node(); } createBiquadFilter() { return node(); } createBufferSource() { return node(); }
  createDynamicsCompressor() { return node(); } createStereoPanner() { return node(); } createWaveShaper() { return node(); }
  createBuffer(c, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  resume() {}
}
global.AudioContext = FakeCtx;
require("../src/audio.js");
SFX.init();
let n = 0;
for (const name of SFX.names) { SFX.play(name, { vol: 1, x: 3, z: 4 }); SFX.play(name); n++; }
SFX.setListener(1, 2, 0.5); SFX.music(true); SFX.setIntensity(1); SFX.heartbeat(true); SFX.heartbeat(false); SFX.music(false); SFX.mute(true); SFX.setMaster(0.5);
console.log("played", n, "sounds:", SFX.names.join(", "));
setTimeout(() => process.exit(0), 100);
