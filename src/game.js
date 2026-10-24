/* Block War 3D — game logic.
 *
 * A 3D remake of the Scratch game "Block War". Every gameplay number here comes from the
 * original project (see the CFG / table comments) unless a comment starts with "3D:" —
 * those are changes needed to make it play as a first-person game.
 *
 * Loaded after three.min.js (global THREE), models.js (global Models), audio.js (global SFX).
 */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  if (!window.THREE || !window.Models) {
    $("loading").textContent = "Could not load the 3D engine.";
    return;
  }
  const noop = () => {};
  const SFX = window.SFX || { init: noop, play: noop, setListener: noop, music: noop, setIntensity: noop, setMaster: noop, mute: noop, isMuted: () => false, heartbeat: noop };

  // ---------------------------------------------------------------- helpers
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1)); // Scratch "pick random" with whole numbers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const tmpV = V3(), tmpV2 = V3(), tmpV3 = V3();

  // ---------------------------------------------------------------- config
  // The Scratch stage was 480x360. 3D: the arena keeps the 4:3 shape at 0.1 m per pixel.
  const ARENA_W = 48, ARENA_D = 36, HX = ARENA_W / 2, HZ = ARENA_D / 2;
  // Scratch moved things N pixels per tick (30 ticks/s). 3D: 1 px/tick = 1.4 m/s, so the
  // player's 5 px/tick becomes 7 m/s and every enemy keeps its speed relative to you.
  const SPEED = 1.4;
  const PLAYER_R = 0.4, EYE = 1.62;
  // Sprinting (new): hold Shift to run faster; it burns mana, which refills when you stop.
  const MANA = { max: 100, drain: 25, regen: 16, delay: 0.8, resume: 25, speed: 1.6 };

  // Zombie types = the original "enemy" costumes 1..6 (lives + "move enemy" speeds).
  const ZTYPES = {
    1: { name: "mini", hp: 3, speed: 3 },
    2: { name: "mini helmet", hp: 3, speed: 2 },
    3: { name: "normal", hp: 8, speed: 1 },
    4: { name: "normal helmet", hp: 14, speed: 2 },
    5: { name: "big", hp: 14, speed: 2.5 },
    6: { name: "big helmet", hp: 17, speed: 1.5 },
    // new zombies, mixed into the horde the longer you survive
    7: { name: "Splitter", hp: 10, speed: 1.2, reward: 3, at: 20, intro: "Breaks into 3 minis when it dies" },
    8: { name: "Boomer", hp: 6, speed: 2.2, reward: 2, at: 45, intro: "Blows up next to you. Shoot it near other zombies" },
    9: { name: "Spitter", hp: 6, speed: 1.4, reward: 3, at: 90, intro: "Spits goo from far away. Goo slows you down" },
    10: { name: "Shield guy", hp: 10, speed: 1.5, reward: 4, at: 150, intro: "Blocks bullets from the front. Flank it or use TNT" },
  };
  const NEW_TYPES = [7, 8, 9, 10];
  // Money for a gun kill: type 3 pays 4, type 2 pays 2, everything else 1.
  // Kills by laser / shield / sniper / TNT always pay 1 (they used a separate script).
  const gunReward = (t) => (t >= 7 ? ZTYPES[t].reward : t === 3 ? 4 : t === 2 ? 2 : 1);
  const ZCOLOR = { 1: 0x7bac00, 2: 0x7bac00, 3: 0x9cda00, 4: 0x9cda00, 5: 0x00d9b1, 6: 0x00d9b1, 7: 0xff8a00, 8: 0xe8231a, 9: 0xffd400, 10: 0x9aa3ad };

  // Guns by key. Delay = the gun's "wait" + the 0.05 s muzzle flash.
  const GUNS = [
    null,
    { slot: 1, key: "1", id: "pistol", name: "Pistol", damage: 3, delay: 0.25, shot: "bullet", sfx: "pistol", item: null },
    { slot: 2, key: "2", id: "mg", name: "Machine gun", damage: 2, delay: 0.1, shot: "bullet", sfx: "mg", item: "mg" },
    { slot: 3, key: "3", id: "op", name: "OP gun", damage: 3, delay: 0.1, shot: "bullet", sfx: "op", item: "op" },
    { slot: 4, key: "4", id: "sniper", name: "Sniper", damage: 5, delay: 0.55, shot: "sniper", sfx: "sniper", item: "sniper" },
    { slot: 5, key: "5", id: "snow", name: "Snow gun", damage: 2, delay: 0.15, shot: "snowball", sfx: "snow", item: "snow" },
    // new guns (not in the Scratch game)
    { slot: 6, key: "6", id: "shotgun", name: "Shotgun", damage: 3, delay: 0.75, shot: "pellets", sfx: "shotgun", item: "shotgun" },
    { slot: 7, key: "0", id: "laser", name: "Laser gun", damage: 4, delay: 0.7, shot: "laser", sfx: "laser_gun", item: "laser" },
  ];
  const NG = GUNS.length - 1;
  const KEY_TO_SLOT = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Digit0: 7 };

  // 3D: projectile speeds. Bullets got faster (20 px/tick felt like paintballs in first person);
  // boss projectiles keep the original 10 px/tick = 14 m/s so you can still dodge them.
  const PROJ = {
    bullet: { speed: 70, r: 0.08, life: 1.2, team: "p", model: "bullet" },
    sniper: { speed: 160, r: 0.1, life: 0.6, team: "p", model: "sniper" },
    snowball: { speed: 34, r: 0.24, life: 1.6, team: "p", model: "snowball", gravity: 2.5 },
    turret: { speed: 55, r: 0.08, life: 1.2, team: "p", model: "turret" },
    ai: { speed: 60, r: 0.08, life: 1.2, team: "p", model: "ai" },
    tnt: { speed: 22, r: 0.25, life: 2.5, team: "p", model: "tnt", gravity: 11 },
    pellet: { speed: 65, r: 0.07, life: 0.42, team: "p", model: "pellet" },
    freeze: { speed: 20, r: 0.22, life: 2.5, team: "p", model: "freeze", gravity: 11 },
    goo: { speed: 13, r: 0.3, life: 4, team: "e", model: "goo", gravity: 5 },
    eSnow: { speed: 14, r: 0.45, life: 5, team: "e", model: "enemySnowball" },
    fire: { speed: 13, r: 0.45, life: 5, team: "e", model: "fireball" },
    bLaser: { speed: 16, r: 0.3, life: 5, team: "e", model: "bossLaser" },
  };

  // Bosses: lives, reward, and when they show up (seconds into a round).
  // 3D: wall/flame/glide speeds were 0.2/0.1/0.1 px per tick, which in 3D is basically standing still.
  const BOSS = {
    snow: { name: "Snow Boss", hp: [100, 200], speed: 1.6, reward: [60, 80], shot: "eSnow", sfx: "snow_throw", clears: false, contact: false },
    wall: { name: "Wall Boss", hp: [200, 300], speed: 0.9, reward: [120, 150], shot: null, clears: false, contact: false },
    flame: { name: "Flame Boss", hp: [400, 500], speed: 0.6, reward: [200, 250], shot: "fire", sfx: "fire_throw", clears: true, contact: true },
    glide: { name: "Glide Boss", hp: [600, 700], speed: 0.6, reward: [250, 300], shot: "bLaser", sfx: "laser_shot", clears: true, contact: false },
    // new: comes 20 s into the round after you've beaten 3 bosses
    king: { name: "Block King", hp: [800, 900], speed: 0.8, reward: [400, 500], shot: null, clears: false, contact: true },
  };
  const BOSS_AT = { snow: 35, wall: 100, flame: 200 };

  // Shop: same two pages, prices and wording as the original shop cards.
  const SHOP = [
    { id: "op", page: 1, price: 1000, name: "OP gun", desc: "OP fire rate", key: "3" },
    { id: "tnt", page: 1, price: 750, name: "TNT", desc: "Explosive", key: "Q" },
    { id: "heal", page: 1, price: 15, name: "Heals", desc: "Heals 1 hp", repeat: true },
    { id: "mg", page: 1, price: 750, name: "Machine gun", desc: "Faster fire rate", key: "2" },
    { id: "shield", page: 1, price: 1500, name: "SHIELD", desc: "5 s energy shield: blocks boss shots, shreds zombies", key: "9" },
    { id: "turret", page: 1, price: 2000, name: "Turret", desc: "Spinning sentry, 500 shots", key: "8" },
    { id: "sniper", page: 1, price: 1500, name: "Sniper", desc: "15 damage a shot, right-click to scope", key: "4" },
    { id: "fortress", page: 1, price: 4000, name: "Port a fortress", desc: "Barricade that holds for 100 s", key: "7" },
    { id: "snow", page: 2, price: 100, name: "Snow gun", desc: "Shoots snow balls", key: "5" },
    { id: "bounty", page: 2, price: 150, name: "Bounty hunt", desc: "Kill the target to get money", repeat: true },
    { id: "minion", page: 2, price: 500, name: "Minion", desc: "Get a helper" },
    { id: "helmet", page: 2, price: 3000, name: "Helmet", desc: "Takes 5 hits, halves damage" },
    { id: "damage", page: 2, price: 5000, name: "Damage", desc: "*2 damage. The horde grows." },
    { id: "selfheal", page: 2, price: 5000, name: "Self heal", desc: "Regenerate up to 25 HP. The horde grows." },
    { id: "armored", page: 2, price: 5000, name: "Armored", desc: "Armor plating, regenerate up to 50 HP" },
    // page 3: new stuff
    { id: "shotgun", page: 3, price: 1200, name: "Shotgun", desc: "Shoots 7 bullets at once", key: "6" },
    { id: "laser", page: 3, price: 2500, name: "Laser gun", desc: "Shoots the red laser. Goes through every zombie", key: "0" },
    { id: "mine", page: 3, price: 600, name: "Land mine", desc: "3 mines a round. Boom when they step on it", key: "F" },
    { id: "freeze", page: 3, price: 1200, name: "Freeze bomb", desc: "Freezes zombies for 4 s", key: "E" },
    { id: "lucky", page: 3, price: 400, name: "Lucky block", desc: "Could be anything!!", repeat: true },
  ];

  // ---------------------------------------------------------------- settings
  const settings = { sens: 1, vol: 0.8, third: false };
  try { Object.assign(settings, JSON.parse(localStorage.getItem("bw3d.settings") || "{}")); } catch (e) { /* private mode */ }
  const saveSettings = () => { try { localStorage.setItem("bw3d.settings", JSON.stringify(settings)); } catch (e) { /* ignore */ } };
  let best = { time: 0, money: 0 };
  try { Object.assign(best, JSON.parse(localStorage.getItem("bw3d.best") || "{}")); } catch (e) { /* ignore */ }

  // ---------------------------------------------------------------- renderer / scenes
  const canvas = $("view");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const SKY = 0x16202e;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(SKY, 0.022);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 260);
  camera.rotation.order = "YXZ";

  const env = Models.environment(ARENA_W, ARENA_D);
  scene.add(env.group);
  (env.lights || []).forEach((l) => { scene.add(l); if (l.target) scene.add(l.target); });

  // First-person gun lives in its own scene so it never clips into walls.
  const vmScene = new THREE.Scene();
  vmScene.add(new THREE.HemisphereLight(0xcfdcff, 0x2a3324, 0.95));
  const vmSun = new THREE.DirectionalLight(0xffffff, 0.75);
  vmSun.position.set(0.4, 1, 0.6);
  vmScene.add(vmSun);
  const vm = new THREE.Group();
  vmScene.add(vm);

  const muzzleLight = new THREE.PointLight(0xffc870, 0, 9, 2);
  const boomLight = new THREE.PointLight(0xff8a3a, 0, 22, 2);
  scene.add(muzzleLight, boomLight);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------------- game state
  const G = {
    mode: "loading", // title | playing | paused | shop | info | dead
    money: 500, hp: 14, time: 0, timeAcc: 0, kills: 0,
    owned: {}, gun: 1, dmgMult: 1,
    helmet: 0, armored: false, selfheal: false,
    wave: false, spawners: 1, spawnT: [1],
    round: { t: 0, snow: false, wall: false, flame: false },
    cd: { contact: 0, laser: 0, bounty: 0, bossLaser: 0, helmet: 0, apple: 0, god: 0, beam: 0, boom: 0, goo: 0, rain: 0 },
    minesLeft: 0, freezeCd: 0, moneyMult: 1, moneyMultT: 0, bossKills: 0, kingDue: false, kingWarned: false, seenZ: {}, slowT: 0, luckyZombies: 0, pendingApples: 0,
    mana: 100, manaDelay: 0, exhausted: false, sprinting: false, sprintK: 0, hordeGrow: 0,
    fireT: 0, tntCd: 0,
    regenSelf: 0, regenArmor: 0,
    bountyTime: 0, bountyAcc: 0, bountySpawnT: 0,
    appleT: 0, godT: 0, goldT: 0, goldCount: 0,
    wonShown: false,
    trauma: 0, recoil: 0, ads: 0, walkPhase: 0,
  };
  const P = { pos: V3(), yaw: -Math.PI / 2, pitch: 0, knock: V3(), moving: 0 };

  let zombies = [], bosses = [], projectiles = [], walls = [], apples = [], golds = [], decals = [];
  let bounty = null;
  let mines = [], beams = [], falling = [], pendingSpawns = [], pendingBooms = [];
  const turret = { mesh: null, shots: 0, t: 0, dir: 0, cd: 0 };
  const shield = { mesh: null, t: 0, cd: 0 };
  const fortress = { mesh: null, hp: 0, t: 0, cd: 0, segs: [], warned: false };
  const minion = { mesh: null, alive: false, hp: 100, respawn: 0, from: V3(), to: V3(), t: 0, phase: 0, hurtT: 0, bar: null, fill: null };
  const lasers = [];

  // ---------------------------------------------------------------- creature helpers
  function setEmissive(mesh, hex, k) {
    for (const m of mesh.userData.mats || []) {
      if (!m.emissive) continue;
      if (m.userData.baseEm === undefined) m.userData.baseEm = m.emissive.getHex();
      if (k > 0) m.emissive.setHex(hex).multiplyScalar(k);
      else m.emissive.setHex(m.userData.baseEm);
    }
  }
  function setOpacity(mesh, a) {
    const t = a < 1;
    for (const m of mesh.userData.mats || []) {
      if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; } // r149 bakes "opaque" into the shader
      m.opacity = a;
      m.depthWrite = a > 0.5;
    }
  }
  function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.parent) mesh.parent.remove(mesh);
    for (const m of mesh.userData.mats || []) m.dispose();
  }
  function parts(mesh) { return mesh.userData.parts || {}; }
  function animateWalk(mesh, phase, amount, armBase) {
    const p = parts(mesh);
    const s = Math.sin(phase) * amount;
    if (p.legL) p.legL.rotation.x = s;
    if (p.legR) p.legR.rotation.x = -s;
    const ab = armBase !== undefined ? armBase : mesh.userData.armBase || 0;
    if (p.armL) p.armL.rotation.x = ab - s * 0.35;
    if (p.armR) p.armR.rotation.x = ab + s * 0.35;
    if (p.body) p.body.position.y = Math.abs(Math.cos(phase)) * amount * 0.06;
  }
  const faceYaw = (dx, dz) => Math.atan2(dx, dz); // models face +Z

  // ---------------------------------------------------------------- collisions (XZ plane)
  // Oriented boxes: {x, z, hx, hz, ang, h}. ang = rotation.y of the box.
  function toLocal(b, x, z, out) {
    const dx = x - b.x, dz = z - b.z, c = Math.cos(b.ang), s = Math.sin(b.ang);
    out.x = dx * c - dz * s;
    out.z = dx * s + dz * c;
    return out;
  }
  const _l = { x: 0, z: 0 };
  // Push a circle out of a box. Returns true if it was touching.
  function pushOut(pos, r, b) {
    toLocal(b, pos.x, pos.z, _l);
    const cx = clamp(_l.x, -b.hx, b.hx), cz = clamp(_l.z, -b.hz, b.hz);
    let dx = _l.x - cx, dz = _l.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    let nx, nz, pen;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      nx = dx / d; nz = dz / d; pen = r - d;
    } else { // centre inside the box: leave by the shortest side
      const ex = b.hx - Math.abs(_l.x), ez = b.hz - Math.abs(_l.z);
      if (ex < ez) { nx = Math.sign(_l.x) || 1; nz = 0; pen = ex + r; } else { nx = 0; nz = Math.sign(_l.z) || 1; pen = ez + r; }
    }
    const c = Math.cos(b.ang), s = Math.sin(b.ang);
    pos.x += (nx * c + nz * s) * pen;
    pos.z += (-nx * s + nz * c) * pen;
    return true;
  }
  function circleHitsBox(x, z, r, b) {
    toLocal(b, x, z, _l);
    const dx = _l.x - clamp(_l.x, -b.hx, b.hx), dz = _l.z - clamp(_l.z, -b.hz, b.hz);
    return dx * dx + dz * dz < r * r;
  }
  let solidCache = [];
  function refreshSolids() {
    solidCache = [];
    for (const w of walls) if (w.solid) solidCache.push(w.box);
    for (const s of fortress.segs) solidCache.push(s);
  }
  const solids = () => solidCache;
  function keepInArena(pos, r) {
    pos.x = clamp(pos.x, -HX + r, HX - r);
    pos.z = clamp(pos.z, -HZ + r, HZ - r);
  }
  function rayBox(o, d, b, maxT) {
    toLocal(b, o.x, o.z, _l);
    const c = Math.cos(b.ang), s = Math.sin(b.ang);
    const dx = d.x * c - d.z * s, dz = d.x * s + d.z * c;
    let t0 = 0, t1 = maxT;
    const slab = (o1, d1, h) => {
      if (Math.abs(d1) < 1e-9) return o1 >= -h && o1 <= h;
      let a = (-h - o1) / d1, bb = (h - o1) / d1;
      if (a > bb) { const t = a; a = bb; bb = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, bb);
      return t0 <= t1;
    };
    if (!slab(_l.x, dx, b.hx) || !slab(_l.z, dz, b.hz)) return maxT;
    const y = o.y + d.y * t0;
    return y >= 0 && y <= (b.h || 3) ? t0 : maxT;
  }
  function rayCyl(o, d, x, z, r, y0, h, maxT) {
    const ox = o.x - x, oz = o.z - z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return maxT;
    const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
    if (c < 0) return maxT;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return maxT;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t <= 0 || t >= maxT) return maxT;
    const y = o.y + d.y * t;
    return y >= y0 && y <= y0 + h ? t : maxT;
  }
  // Is a wall / fortress segment between two points? (y defaults to chest height)
  const _bo = V3(), _bd = V3();
  function wallBetween(ax, ay, az, bx, by, bz) {
    _bo.set(ax, ay, az);
    _bd.set(bx - ax, by - ay, bz - az);
    const len = _bd.length();
    if (len < 1e-4) return false;
    _bd.multiplyScalar(1 / len);
    for (const b of solids()) if (rayBox(_bo, _bd, b, len) < len) return true;
    return false;
  }
  // The view ray. In third person it starts level with the player, so walls between the
  // camera and you don't eat your shots.
  function viewRay() {
    const o = camera.position.clone(), d = V3(0, 0, -1).applyQuaternion(camera.quaternion);
    if (settings.third) o.addScaledVector(d, Math.max(0, tmpV2.set(P.pos.x, 1.6, P.pos.z).sub(o).dot(d)));
    return { o, d };
  }
  // What's under the crosshair? Used so bullets from the gun muzzle converge on it.
  function aimPoint(out) {
    const { o, d } = viewRay();
    let t = 120;
    if (d.y < -1e-4) t = Math.min(t, -o.y / d.y);
    for (const b of solids()) t = rayBox(o, d, b, t);
    for (const e of zombies) if (!e.dying && e.emerge > 0.3) t = rayCyl(o, d, e.x, e.z, e.r, e.mesh.position.y, e.h, t);
    for (const b of bosses) if (b.hittable) t = rayCyl(o, d, b.x, b.z, b.r, b.mesh.position.y, b.h, t);
    if (bounty && bounty.visible) t = rayCyl(o, d, bounty.x, bounty.z, bounty.r, 0, bounty.h, t);
    for (const g of golds) t = rayCyl(o, d, g.x, g.z, g.r, 0, g.r * 1.2, t);
    return out.copy(o).addScaledVector(d, t);
  }

  // ---------------------------------------------------------------- particles (one instanced mesh)
  const MAXP = 900;
  const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAXP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  const parts_ = [];
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V3(), _e = new THREE.Euler(), _c = new THREE.Color();
  for (let i = 0; i < MAXP; i++) {
    parts_.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, g: 9, rx: 0, ry: 0, spin: 0, glow: false });
    pMesh.setColorAt(i, _c.setHex(0xffffff));
    _m4.makeScale(0, 0, 0);
    pMesh.setMatrixAt(i, _m4);
  }
  scene.add(pMesh);
  let pNext = 0;
  function emit(x, y, z, color, n, speed, size, life, gravity = 9) {
    for (let i = 0; i < n; i++) {
      const idx = pNext;
      const p = parts_[idx];
      pNext = (pNext + 1) % MAXP;
      const a = Math.random() * TAU, u = rand(-0.2, 1);
      const sp = speed * rand(0.35, 1);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * sp * Math.sqrt(1 - u * u); p.vz = Math.sin(a) * sp * Math.sqrt(1 - u * u); p.vy = u * sp + speed * 0.3;
      p.size = size * rand(0.6, 1.3); p.life = p.max = life * rand(0.7, 1.2); p.g = gravity;
      p.rx = Math.random() * TAU; p.ry = Math.random() * TAU; p.spin = rand(-8, 8);
      pMesh.setColorAt(idx, _c.setHex(Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color));
    }
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  }
  function updateParticles(dt) {
    for (let i = 0; i < MAXP; i++) {
      const p = parts_[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.size * 0.5) { p.y = p.size * 0.5; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.rx += p.spin * dt; p.ry += p.spin * dt;
      const k = p.life <= 0 ? 0 : Math.min(1, p.life / (p.max * 0.4)) * p.size;
      _q.setFromEuler(_e.set(p.rx, p.ry, 0));
      _m4.compose(_s.set(p.x, p.y, p.z), _q, tmpV.set(k, k, k));
      pMesh.setMatrixAt(i, _m4);
    }
    pMesh.instanceMatrix.needsUpdate = true;
  }

  // Snow Boss trail (the original drew it with the pen, 50 px wide, white).
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  const decalMat = new THREE.MeshLambertMaterial({ color: 0xf4f9ff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  function addDecal(x, z, size) {
    const m = new THREE.Mesh(decalGeo, decalMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * TAU;
    m.position.set(x, 0.02 + Math.random() * 0.01, z);
    m.scale.setScalar(size);
    m.receiveShadow = true;
    scene.add(m);
    decals.push({ mesh: m, life: 40, size });
    if (decals.length > 260) { const d = decals.shift(); scene.remove(d.mesh); }
  }
  function clearDecals() { for (const d of decals) scene.remove(d.mesh); decals = []; }

  // ---------------------------------------------------------------- floating money popups
  const popEls = [];
  const popLayer = $("popups");
  function popup(text, x, y, z, color) {
    let el = popEls.find((p) => p.life <= 0);
    if (!el) {
      if (popEls.length > 24) return;
      el = { node: document.createElement("div"), life: 0, pos: V3() };
      el.node.className = "pop";
      popLayer.appendChild(el.node);
      popEls.push(el);
    }
    el.node.textContent = text;
    el.node.style.color = color || "";
    el.pos.set(x, y, z);
    el.life = 1.1;
    el.node.style.display = "block";
  }
  function updatePopups(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const p of popEls) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.pos.y += dt * 1.1;
      tmpV.copy(p.pos).project(camera);
      if (p.life <= 0 || tmpV.z > 1) { p.node.style.display = "none"; continue; }
      p.node.style.left = ((tmpV.x + 1) / 2) * w + "px";
      p.node.style.top = ((1 - tmpV.y) / 2) * h + "px";
      p.node.style.opacity = Math.min(1, p.life * 2);
    }
  }

  // ---------------------------------------------------------------- player model + guns
  let playerMesh = null, helmetMesh = null;
  function buildPlayer() {
    if (playerMesh) disposeMesh(playerMesh);
    playerMesh = Models.player({ armored: G.armored });
    scene.add(playerMesh);
    for (const g of guns3p) if (g) { if (g.parent) g.parent.remove(g); (playerMesh.userData.handR || parts(playerMesh).armR || playerMesh).add(g); }
    buildHelmet();
  }
  function buildHelmet() {
    if (helmetMesh && helmetMesh.parent) helmetMesh.parent.remove(helmetMesh);
    helmetMesh = null;
    if (G.helmet <= 0 || !playerMesh) return;
    helmetMesh = Models.helmet(6 - G.helmet); // 5 lives = stage 1 (fresh) ... 1 life = stage 5 (cracked)
    const top = playerMesh.userData.headTop;
    if (top) { top.add(helmetMesh); helmetMesh.position.y = -0.29; } else { playerMesh.add(helmetMesh); helmetMesh.position.y = 1.5; }
  }
  const gunsVM = [null], guns3p = [null];
  for (let i = 1; i <= NG; i++) {
    const a = Models.gun(GUNS[i].id);
    a.visible = false;
    vm.add(a);
    gunsVM.push(a);
    const b = Models.gun(GUNS[i].id);
    b.visible = false;
    guns3p.push(b);
  }
  const vmFlash = Models.muzzleFlash();
  vmFlash.visible = false;
  vm.add(vmFlash);
  const tpFlash = Models.muzzleFlash();
  tpFlash.visible = false;
  scene.add(tpFlash);
  let flashT = 0;

  function currentGunMesh() { return settings.third ? guns3p[G.gun] : gunsVM[G.gun]; }
  function muzzleWorld(out) {
    const g = currentGunMesh();
    g.updateWorldMatrix(true, true);
    return (g.userData.muzzle || g).getWorldPosition(out);
  }
  const curDamage = () => GUNS[G.gun].damage * G.dmgMult;
  // where a shot really starts: the gun muzzle, unless that's through a wall or past the target
  function shotOrigin(muzzle, aim) {
    const eye = settings.third ? tmpV.set(P.pos.x, 1.5, P.pos.z) : camera.position;
    const tooFar = eye.distanceTo(aim) < eye.distanceTo(muzzle) + 0.05;
    if (tooFar || wallBetween(eye.x, eye.y, eye.z, muzzle.x, muzzle.y, muzzle.z)) return muzzle.copy(eye);
    return muzzle;
  }

  // ---------------------------------------------------------------- input
  const keys = {};
  const mouse = [false, false, false];
  let locked = false, ignoreUnlockUntil = 0, testMode = false;
  function lockFailed() { if (G.mode === "playing" && !locked && !testMode) pauseGame(); }
  function lockPointer() {
    if (testMode) return;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(lockFailed); } catch (e) { lockFailed(); }
  }
  document.addEventListener("pointerlockerror", lockFailed);
  function unlockPointer() {
    // the "unlocked" event arrives later; don't mistake it for the player pressing Esc
    ignoreUnlockUntil = performance.now() + 350;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvas;
    if (!locked && G.mode === "playing" && performance.now() > ignoreUnlockUntil && !testMode) pauseGame();
  });
  canvas.addEventListener("click", () => { if (G.mode === "playing" && !locked) lockPointer(); });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("mousedown", (e) => { if (locked) mouse[e.button] = true; });
  window.addEventListener("mouseup", (e) => { mouse[e.button] = false; });
  window.addEventListener("mousemove", (e) => {
    if (!locked || G.mode !== "playing") return;
    const k = 0.0022 * settings.sens * (camera.fov / 75);
    P.yaw -= e.movementX * k;
    P.pitch = clamp(P.pitch - e.movementY * k, -1.45, 1.45);
  });
  let wheelAcc = 0;
  window.addEventListener("wheel", (e) => {
    if (G.mode !== "playing" || !e.deltaY) return;
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // lines -> pixels
    if (Math.abs(wheelAcc) < 50) return;
    const dir = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    for (let i = 1; i <= NG; i++) {
      const s = ((G.gun - 1 + dir * i + NG * 10) % NG) + 1;
      if (gunOwned(s)) { equip(s); break; }
    }
  }, { passive: true });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; mouse.fill(false); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && G.mode === "playing" && !testMode) pauseGame(); });

  window.addEventListener("keydown", (e) => {
    if ((e.code === "Space" || e.code === "Tab") && G.mode === "playing") e.preventDefault();
    const first = !keys[e.code];
    keys[e.code] = true;
    if (!first) return;
    if (G.mode === "playing") {
      if (KEY_TO_SLOT[e.code]) trySwitch(KEY_TO_SLOT[e.code]);
      if (e.code.startsWith("Digit")) {
        const n = +e.code.slice(5);
        if (n === 7) deployFortress();
        if (n === 8) deployTurret();
        if (n === 9) raiseShield();
      }
      if (e.code === "KeyQ") throwTNT();
      if (e.code === "KeyE") throwFreeze();
      if (e.code === "KeyF") placeMine();
      if (e.code === "KeyB") openShop();
      if (e.code === "KeyI") openInfo();
      if (e.code === "KeyV") toggleCamera();
      if (e.code === "KeyM") { SFX.mute(!SFX.isMuted()); toast(SFX.isMuted() ? "Sound off" : "Sound on"); }
    } else if (G.mode === "shop" && (e.code === "KeyB" || e.code === "Escape")) closeShop();
    else if (G.mode === "info" && (e.code === "KeyI" || e.code === "Escape")) closeInfo();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  // ---------------------------------------------------------------- UI helpers
  let toastT = 0, bannerT = 0;
  function toast(msg, secs = 2.2) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); toastT = secs; }
  function banner(big, sub, secs = 3) { $("bannerBig").textContent = big; $("bannerSub").textContent = sub || ""; $("banner").classList.add("on"); bannerT = secs; }
  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  let hitT = 0;
  function hitmarker(kill) { const h = $("hitmarker"); h.classList.toggle("kill", !!kill); h.classList.add("on"); hitT = 0.09; }
  let hurtFx = 0, healFx = 0, frostFx = 0, gooFx = 0;

  // ---------------------------------------------------------------- guns
  function gunOwned(slot) { return slot === 1 || !!G.owned[GUNS[slot].item]; }
  function equip(slot) {
    G.gun = slot;
    for (let i = 1; i <= NG; i++) { gunsVM[i].visible = i === slot; guns3p[i].visible = i === slot && settings.third; }
    G.fireT = Math.max(G.fireT, 0.12);
    refreshSlots();
  }
  function trySwitch(slot) {
    if (gunOwned(slot)) { equip(slot); return; }
    const it = SHOP.find((s) => s.id === GUNS[slot].item);
    SFX.play("empty");
    toast(`${it.name} is in the shop (${it.price}$)`);
  }
  function tryFire(dt) {
    G.fireT -= dt;
    if (!(mouse[0] || keys.Space) || G.fireT > 0) return;
    const gun = GUNS[G.gun];
    G.fireT = gun.delay;
    const flashAt = muzzleWorld(V3());
    const aim = aimPoint(V3());
    const from = shotOrigin(flashAt.clone(), aim);
    const dir = aim.clone().sub(from).normalize();
    if (gun.shot === "pellets") {
      for (let i = 0; i < 7; i++) {
        const d = dir.clone();
        d.x += rand(-1, 1) * 0.075; d.y += rand(-1, 1) * 0.045; d.z += rand(-1, 1) * 0.075;
        spawnProjectile("pellet", from, d.normalize());
      }
      G.trauma = Math.min(1, G.trauma + 0.12);
    } else if (gun.shot === "laser") fireLaserGun(flashAt);
    else spawnProjectile(gun.shot, from, dir);
    // The minion's gun copied your trigger in the original (only bullet guns - the snow and
    // sniper guns set "ammo" to 0 which deleted plain bullets).
    if (minion.alive && gun.shot === "bullet") minionFire(aim);
    SFX.play(gun.sfx);
    G.recoil = Math.min(1, G.recoil + (gun.id === "sniper" || gun.id === "shotgun" ? 1 : gun.id === "op" ? 0.25 : 0.45));
    if (gun.id === "sniper") { P.pitch = clamp(P.pitch + 0.03, -1.45, 1.45); G.trauma = Math.min(1, G.trauma + 0.15); }
    flashT = 0.05;
    muzzleLight.position.copy(flashAt);
    muzzleLight.intensity = 2.2;
  }

  // Laser gun: an instant red beam that goes through every zombie (-15 each, like the Laser),
  // hits the first boss for 5x damage and stops at walls.
  function fireLaserGun(from) {
    const { o, d } = viewRay();
    let end = 80;
    for (const b of solids()) end = rayBox(o, d, b, end);
    let boss = null;
    for (const b of bosses) if (b.hittable) { const t = rayCyl(o, d, b.x, b.z, b.r, b.mesh.position.y, b.h, end); if (t < end) { end = t; boss = b; } }
    if (d.y < -1e-4) end = Math.min(end, -o.y / d.y);
    const hit = [];
    for (const e of zombies) if (!e.dying && e.emerge > 0.3 && rayCyl(o, d, e.x, e.z, e.r + 0.1, e.mesh.position.y, e.h, end) < end) hit.push(e);
    for (const e of hit) damageZombie(e, 15, "flat");
    if (boss) damageBoss(boss, curDamage() * 5);
    if (bounty && bounty.visible && rayCyl(o, d, bounty.x, bounty.z, bounty.r, 0, bounty.h, end) < end) damageBounty(1);
    const to = o.clone().addScaledVector(d, end);
    const mesh = Models.beam(0xff2020);
    mesh.position.copy(from);
    mesh.lookAt(to);
    mesh.scale.set(1, 1, from.distanceTo(to));
    scene.add(mesh);
    beams.push({ mesh, life: 0.16 });
    emit(to.x, to.y, to.z, [0xff2020, 0xffb0a0], 8, 3, 0.08, 0.35, 2);
  }
  function updateBeams(dt) {
    for (const b of beams) { b.life -= dt; b.mesh.scale.x = b.mesh.scale.y = Math.max(0.05, b.life / 0.16); if (b.life <= 0) scene.remove(b.mesh); }
    beams = beams.filter((b) => b.life > 0);
  }

  // ---------------------------------------------------------------- projectiles
  function spawnProjectile(kind, from, dir, extra) {
    const def = PROJ[kind];
    const mesh = Models.projectile(def.model);
    mesh.position.copy(from);
    scene.add(mesh);
    const p = { kind, def, pos: from.clone(), vel: dir.clone().multiplyScalar(def.speed), life: def.life, mesh, dead: false, r: def.r };
    if (kind === "tnt" || kind === "freeze") p.vel.y += 4.5;
    if (extra) Object.assign(p, extra);
    projectiles.push(p);
    return p;
  }
  function killProjectile(p) { p.dead = true; scene.remove(p.mesh); }
  function popProjectile(p) {
    const { x, y, z } = p.pos;
    if (p.kind === "tnt") { explode(x, Math.max(0.3, y), z); killProjectile(p); return; }
    if (p.kind === "freeze") { freezeBurst(x, Math.max(0.3, y), z); killProjectile(p); return; }
    if (p.kind === "goo") emit(x, y, z, [0x6cff2a, 0x2a8a00], 10, 3, 0.1, 0.5);
    if (p.kind === "snowball" || p.kind === "eSnow") emit(x, y, z, [0xffffff, 0xe6f3ff], p.kind === "eSnow" ? 14 : 6, 3, 0.12, 0.6);
    else if (p.kind === "fire") emit(x, y, z, [0xfb0000, 0xf48d0d, 0xffdd78], 12, 4, 0.14, 0.5, 2);
    else if (p.kind === "bLaser") emit(x, y, z, [0xff0000, 0xff7a6a], 8, 3, 0.08, 0.4, 0);
    else emit(x, y, z, [0xffdd78, 0xfff2c4], 3, 2.5, 0.05, 0.25);
    killProjectile(p);
  }

  function updateProjectiles(dt) {
    const solidList = solids();
    for (const p of projectiles) {
      if (p.dead) continue;
      p.life -= dt;
      if (p.life <= 0) { if (p.kind === "tnt" || p.kind === "freeze") popProjectile(p); else killProjectile(p); continue; }
      const sp = p.vel.length();
      const steps = Math.max(1, Math.ceil((sp * dt) / 0.3));
      const sdt = dt / steps;
      for (let i = 0; i < steps && !p.dead; i++) {
        if (p.def.gravity) p.vel.y -= p.def.gravity * sdt;
        p.pos.addScaledVector(p.vel, sdt);
        // "touching edge" deletes projectiles
        if (Math.abs(p.pos.x) > HX + 1.5 || Math.abs(p.pos.z) > HZ + 1.5 || p.pos.y > 30) { killProjectile(p); break; }
        if (p.pos.y < p.r * 0.5) { popProjectile(p); break; }
        let hitSolid = false;
        for (const b of solidList) if (p.pos.y < (b.h || 3) && circleHitsBox(p.pos.x, p.pos.z, p.r, b)) { hitSolid = true; break; }
        if (hitSolid) { popProjectile(p); break; }
        if (p.def.team === "p") playerShotStep(p);
        else enemyShotStep(p);
      }
      if (!p.dead) {
        p.mesh.position.copy(p.pos);
        if (p.kind === "tnt" || p.kind === "freeze") { p.mesh.rotation.x += dt * 9; p.mesh.rotation.y += dt * 4; } else p.mesh.lookAt(tmpV.copy(p.pos).add(p.vel));
        if (p.kind === "tnt" && Math.random() < 0.6) emit(p.pos.x, p.pos.y + 0.3, p.pos.z, [0xffdd78, 0x777777], 1, 0.6, 0.06, 0.3, -1);
        if (p.kind === "fire" && Math.random() < 0.7) emit(p.pos.x, p.pos.y, p.pos.z, [0xfb0000, 0xf48d0d], 1, 0.8, 0.12, 0.35, -2);
      }
    }
    projectiles = projectiles.filter((p) => !p.dead);
  }

  const hitsCyl = (p, x, z, r, y0, h) => {
    const dx = p.pos.x - x, dz = p.pos.z - z, rr = r + p.r;
    return dx * dx + dz * dz < rr * rr && p.pos.y > y0 - p.r && p.pos.y < y0 + h + p.r;
  };

  const isBullet = (k) => k === "bullet" || k === "pellet";
  const BLOCKABLE = { bullet: 1, pellet: 1, turret: 1, ai: 1, snowball: 1 };
  function playerShotStep(p) {
    // zombies
    for (const e of zombies) {
      if (e.dying || e.emerge < 0.3) continue;
      if (!hitsCyl(p, e.x, e.z, e.r, e.mesh.position.y, e.h)) continue;
      if (p.kind === "tnt" || p.kind === "freeze") { popProjectile(p); return; }
      // Shield guy: shots from its front bounce off the shield (sniper bullets punch through)
      if (e.type === 10 && BLOCKABLE[p.kind] && !e.frozen) {
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), ax = p.pos.x - e.x, az = p.pos.z - e.z, al = Math.hypot(ax, az) || 1;
        if ((fx * ax + fz * az) / al > 0.3) {
          emit(p.pos.x, p.pos.y, p.pos.z, [0xffdd78, 0xffffff], 4, 3, 0.05, 0.25);
          SFX.play("shield_hit", { x: e.x, z: e.z, vol: 0.6 });
          popProjectile(p);
          return;
        }
      }
      if (p.kind === "sniper") damageZombie(e, 15, "flat"); // sniper bullets did a flat 15
      else damageZombie(e, curDamage(), "gun"); // bullets, turret, minion and snow balls used "damage"
      popProjectile(p);
      return;
    }
    // bosses
    for (const b of bosses) {
      if (!b.hittable || !hitsCyl(p, b.x, b.z, b.r, b.mesh.position.y, b.h)) continue;
      if (p.kind === "tnt" || p.kind === "freeze") { popProjectile(p); return; }
      if (isBullet(p.kind)) damageBoss(b, curDamage());
      else if (p.kind === "turret" || p.kind === "sniper") damageBoss(b, curDamage() * 5);
      else if (p.kind === "snowball" && b.kind === "snow") damageBoss(b, curDamage());
      popProjectile(p); // minion bullets and snow balls just splat on the other bosses
      return;
    }
    // bounty target
    if (bounty && bounty.visible && hitsCyl(p, bounty.x, bounty.z, bounty.r, 0, bounty.h)) {
      if (p.kind === "tnt" || p.kind === "freeze") { popProjectile(p); return; }
      if (isBullet(p.kind) || p.kind === "sniper" || p.kind === "turret") damageBounty(1);
      popProjectile(p);
      return;
    }
    // gold ore: only plain bullets mine it
    for (const g of golds) {
      if (g.dead || !hitsCyl(p, g.x, g.z, g.r, 0, g.r * 1.2)) continue;
      if (isBullet(p.kind)) mineGold(g);
      if (p.kind === "tnt" || p.kind === "freeze") { popProjectile(p); return; }
      popProjectile(p);
      return;
    }
  }

  function enemyShotStep(p) {
    // the shield deletes boss shots
    if (shield.mesh && circleHitsBox(p.pos.x, p.pos.z, p.r, shield.box) && p.pos.y < 2.2) {
      SFX.play("shield_hit", { x: p.pos.x, z: p.pos.z });
      popProjectile(p);
      return;
    }
    if (G.mode !== "playing") return;
    const dx = p.pos.x - P.pos.x, dz = p.pos.z - P.pos.z, rr = PLAYER_R + p.r;
    if (dx * dx + dz * dz < rr * rr && p.pos.y < 1.95 + p.r) {
      if (p.kind === "eSnow") knockback(p.vel);
      else if (p.kind === "fire") hurt(1, "contact");
      else if (p.kind === "bLaser") hurt(1, "bossLaser");
      else if (p.kind === "goo") { hurt(1, "goo"); G.slowT = 2; gooFx = 1; SFX.play("goo_hit"); }
      popProjectile(p);
    }
  }

  // opts: { r: blast radius, boss: hurt bosses?, player: damage to the player if close }
  function explode(x, y, z, opts) {
    const o = opts || {};
    SFX.play("explosion", { x, z, vol: 1.3 });
    emit(x, y, z, [0xfb0000, 0xf48d0d, 0xffdd78, 0x444444, 0x222222], 60, 9, 0.22, 0.9, 6);
    emit(x, y, z, [0x5a4a35, 0x3a3024], 20, 6, 0.16, 1.1, 12);
    boomLight.position.set(x, y + 1, z);
    boomLight.intensity = 6;
    const dist = Math.hypot(P.pos.x - x, P.pos.z - z);
    G.trauma = Math.min(1, G.trauma + clamp(1 - dist / 22, 0, 0.7));
    const R = o.r || 4.5; // 3D: TNT ("Explosive") blows up instead of flying through zombies
    for (const e of zombies) if (!e.dying && e.emerge > 0.3 && Math.hypot(e.x - x, e.z - z) < R + e.r) damageZombie(e, 15, "flat");
    if (o.boss !== false) for (const b of bosses) if (b.hittable && Math.hypot(b.x - x, b.z - z) < R + b.r) damageBoss(b, curDamage() * 5);
    if (o.player && G.mode === "playing" && dist < R * 0.85) hurt(o.player, "boom");
    if (bounty && bounty.visible && Math.hypot(bounty.x - x, bounty.z - z) < R + bounty.r) damageBounty(1);
    for (const g of golds) if (!g.dead && Math.hypot(g.x - x, g.z - z) < R + g.r) { g.dead = true; emit(g.x, 0.5, g.z, [0xffe500, 0x888888], 14, 4, 0.14, 0.8); } // TNT wrecks gold for nothing
  }

  // ---------------------------------------------------------------- zombies
  function pickZombieType() {
    // The original's nested "pick random" chain, kept exactly.
    if (randInt(1, 3) === 1) return 1;
    if (randInt(2, 4) === 2) return 2;
    if (randInt(3, 5) === 3) return 4;
    if (randInt(4, 6) === 4) return 5;
    if (randInt(5, 7) === 5) return 3;
    return 6;
  }
  function randomSpot(minDist, margin = 1.5) {
    for (let i = 0; i < 30; i++) {
      const x = rand(-HX + margin, HX - margin), z = rand(-HZ + margin, HZ - margin);
      if (Math.hypot(x - P.pos.x, z - P.pos.z) >= minDist) return { x, z };
    }
    return { x: -P.pos.x * 0.8, z: -P.pos.z * 0.8 };
  }
  function spawnZombie(type, x, z) {
    const mesh = Models.zombie(type);
    const ud = mesh.userData;
    const e = { type, hp: ZTYPES[type].hp, speed: ZTYPES[type].speed * SPEED * rand(0.92, 1.08), mesh,
      r: ud.radius || 0.45, h: ud.height || 1.8, x, z, yaw: Math.random() * TAU,
      emerge: 0, dying: 0, flash: 0, hazardT: 0, groanT: rand(1.5, 6), phase: Math.random() * 10, wander: null,
      frozen: 0, fuse: 0, spitT: rand(2, 3.5), strafe: Math.random() < 0.5 ? 1 : -1 };
    mesh.position.set(x, -e.h, z);
    scene.add(mesh);
    zombies.push(e);
    if (G.mode === "playing") SFX.play("zombie_spawn", { x, z, vol: 0.7 });
    return e;
  }
  // 3D: zombies rise out of the ground at least 8 m away instead of popping in on top of you.
  function spawnFromHorde() {
    if (zombies.length >= 90) return;
    const s = randomSpot(8);
    spawnZombie(pickSpawnType(), s.x, s.z);
  }
  // the original chain picks types 1-6; the longer you survive, the more of the new zombies get mixed in
  function pickSpawnType() {
    const t = pickZombieType();
    const open = NEW_TYPES.filter((n) => G.time >= ZTYPES[n].at);
    if (!open.length || Math.random() > Math.min(0.35, G.time / 500)) return t;
    const n = open[(Math.random() * open.length) | 0];
    if (!G.seenZ[n]) { G.seenZ[n] = true; banner("NEW ZOMBIE: " + ZTYPES[n].name.toUpperCase(), ZTYPES[n].intro, 3.5); }
    return n;
  }
  function earn(n) { const v = n * G.moneyMult; G.money += v; return v; }
  function damageZombie(e, amount, how) {
    if (e.dying) return;
    e.hp -= amount;
    e.flash = 0.08;
    SFX.play("hit", { x: e.x, z: e.z, vol: 0.8 });
    emit(e.x, e.mesh.position.y + e.h * 0.6, e.z, [0x2f4a10, ZCOLOR[e.type], ZCOLOR[e.type]], 3, 2.5, 0.08, 0.4);
    if (e.hp < 1) {
      const pay = earn(how === "gun" ? gunReward(e.type) : 1);
      G.kills++;
      popup("+" + pay, e.x, e.mesh.position.y + e.h + 0.2, e.z);
      killZombie(e);
      hitmarker(true);
    } else hitmarker(false);
  }
  function killZombie(e) {
    e.dying = 0.0001;
    SFX.play("kill", { x: e.x, z: e.z });
    const col = ZCOLOR[e.type] || 0x7bac00;
    emit(e.x, e.h * 0.5, e.z, [col, col, 0x111111, 0x3a2a1a], 16, 4.5, 0.14 * (e.h / 1.8), 1.0);
    // Splitter breaks into three minis, Boomer goes off (queued: these can happen mid-loop)
    if (e.type === 7) {
      SFX.play("split", { x: e.x, z: e.z });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.random(); pendingSpawns.push({ type: 1, x: e.x + Math.cos(a) * 0.9, z: e.z + Math.sin(a) * 0.9, emerge: 0.75 }); }
    }
    if (e.type === 8 && !e.exploded) { e.exploded = true; pendingBooms.push({ x: e.x, z: e.z, t: e.fuse > 0 ? 0 : 0.12 }); }
  }
  function removeZombie(e) { disposeMesh(e.mesh); e.removed = true; }
  function clearZombies(sink) {
    for (const e of zombies) {
      if (sink && !e.dying) { e.dying = 0.0001; e.sinkOnly = true; } else removeZombie(e);
    }
    if (!sink) zombies = [];
  }

  function updateZombies(dt) {
    const playing = G.mode === "playing";
    const lasersHurt = lasers.filter((l) => l.kind === "hurt");
    let touchingPlayer = 0, touchingMinion = false;
    for (const e of zombies) {
      if (e.removed) continue;
      const m = e.mesh;
      if (e.dying) {
        if (e.dieY === undefined) e.dieY = Math.min(0, m.position.y);
        e.dying += dt / (e.sinkOnly ? 0.8 : 0.75);
        if (!e.sinkOnly) m.rotation.x = -Math.min(1, e.dying * 1.6) * Math.PI / 2;
        m.position.y = e.dieY - Math.max(0, e.dying - (e.sinkOnly ? 0 : 0.45)) * e.h * 1.2;
        if (e.dying > 0.55) setOpacity(m, clamp(1 - (e.dying - 0.55) / 0.45, 0, 1));
        if (e.dying >= 1) removeZombie(e);
        continue;
      }
      if (e.flash > 0) { e.flash -= dt; setEmissive(m, 0xffffff, e.flash > 0 ? 0.65 : 0); if (e.flash <= 0 && e.frozen > 0) setEmissive(m, 0x3a8ac0, 0.7); }
      // frozen by a Freeze bomb: no moving, no biting
      if (e.frozen > 0 && e.emerge >= 1) {
        if (G.mode === "playing") e.frozen -= dt;
        if (e.frozen <= 0) setEmissive(m, 0xffffff, 0);
        if (Math.random() < 0.05) emit(e.x, e.h * rand(0.2, 1), e.z, [0xdff4ff, 0xa9d8f5], 1, 0.6, 0.06, 0.6, 1);
        continue;
      }
      // rising from the ground
      if (e.emerge < 1) {
        e.emerge = Math.min(1, e.emerge + dt / 0.8);
        m.position.y = (e.emerge - 1) * e.h;
        m.position.x = e.x + Math.sin(e.emerge * 60) * 0.03;
        if (Math.random() < 0.5) emit(e.x + rand(-0.4, 0.4), 0.05, e.z + rand(-0.4, 0.4), [0x3a2a1a, 0x5a4a35, 0x2f4a1f], 1, 2.5, 0.1, 0.6);
        m.rotation.y = e.yaw;
        continue;
      }
      // pick a target: the player ("point towards player"), or wander on the title screen
      let tx, tz;
      if (playing || G.mode === "paused" || G.mode === "dead") { tx = P.pos.x; tz = P.pos.z; } else {
        if (!e.wander || Math.hypot(e.wander.x - e.x, e.wander.z - e.z) < 1) e.wander = randomSpot(0, 4);
        tx = e.wander.x; tz = e.wander.z;
      }
      const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
      let sp = e.speed * (G.mode === "title" ? 0.35 : 1);
      const ox = e.x, oz = e.z;
      let mx = dx / d, mz = dz / d;
      if (playing && e.type === 9) {
        // Spitter keeps its distance and circles, spitting goo
        const want = d < 9 ? -1 : d > 13 ? 1 : 0;
        mx = (dx / d) * want - (dz / d) * e.strafe * 0.6;
        mz = (dz / d) * want + (dx / d) * e.strafe * 0.6;
        e.spitT -= dt;
        if (e.spitT <= 0 && d < 22) { e.spitT = rand(2.5, 3.5); spit(e); }
        if (Math.random() < dt * 0.3) e.strafe *= -1;
      }
      if (playing && e.type === 8 && e.fuse > 0) {
        // Boomer fuse: stand still, blink, then blow
        sp = 0;
        e.fuse -= dt;
        setEmissive(m, 0xffffff, Math.sin(e.fuse * 40) > 0 ? 0.8 : 0);
        if (e.fuse <= 0) { e.exploded = true; e.hp = 0; pendingBooms.push({ x: e.x, z: e.z, t: 0 }); killZombie(e); continue; }
      }
      {
        e.x += mx * sp * dt;
        e.z += mz * sp * dt;
        // keep zombies from stacking on top of each other
        for (const o of zombies) {
          if (o === e || o.dying || o.emerge < 1) continue;
          const sx = e.x - o.x, sz = e.z - o.z, rr = e.r + o.r, s2 = sx * sx + sz * sz;
          if (s2 < rr * rr && s2 > 1e-6) { const s = Math.sqrt(s2), push = (rr - s) * 0.5; e.x += (sx / s) * push; e.z += (sz / s) * push; }
        }
        tmpV.set(e.x, 0, e.z);
        for (const b of solids()) pushOut(tmpV, e.r, b);
        keepInArena(tmpV, e.r);
        e.x = tmpV.x; e.z = tmpV.z;
      }
      // can't walk through the player
      if (playing) {
        const px = e.x - P.pos.x, pz = e.z - P.pos.z, rr = e.r + PLAYER_R + 0.32, p2 = px * px + pz * pz; // stop at arm's length
        if (p2 < rr * rr && p2 > 1e-6) { const s = Math.sqrt(p2); e.x = P.pos.x + (px / s) * rr; e.z = P.pos.z + (pz / s) * rr; }
        if (p2 < (rr + 0.18) * (rr + 0.18) && !wallBetween(e.x, 1, e.z, P.pos.x, 1, P.pos.z)) {
          if (e.type === 8) { if (e.fuse <= 0) { e.fuse = 0.7; SFX.play("boomer_fuse", { x: e.x, z: e.z }); } } else touchingPlayer++;
        }
        if (minion.alive && Math.hypot(e.x - minion.mesh.position.x, e.z - minion.mesh.position.z) < e.r + 0.55) touchingMinion = true;
      }
      const moved = Math.hypot(e.x - ox, e.z - oz);
      e.yaw = faceYaw(dx, dz);
      m.rotation.y = e.yaw;
      m.position.set(e.x, 0, e.z);
      e.phase += moved * (e.type <= 2 ? 6 : e.type === 5 || e.type === 6 || e.type === 7 ? 2.6 : 3.8);
      animateWalk(m, e.phase, Math.min(0.7, moved / dt / 3 + 0.12));
      // red laser wall and the shield: -15 every ~0.08 s while touching
      if (playing) {
        e.hazardT -= dt;
        if (e.hazardT <= 0) {
          let hazard = false;
          for (const l of lasersHurt) if (circleHitsBox(e.x, e.z, e.r, l.box)) hazard = true;
          if (shield.mesh && circleHitsBox(e.x, e.z, e.r, shield.box)) hazard = true;
          if (hazard) { e.hazardT = 0.083; damageZombie(e, 15, "flat"); }
        }
        e.groanT -= dt;
        if (e.groanT <= 0) { e.groanT = rand(4, 10); if (Math.hypot(e.x - P.pos.x, e.z - P.pos.z) < 26) SFX.play("zombie_groan", { x: e.x, z: e.z, vol: e.type >= 5 ? 1 : 0.7 }); }
      }
    }
    zombies = zombies.filter((e) => !e.removed);
    if (playing) {
      if (touchingPlayer) {
        // balance: 1 a second for one zombie, +0.5 for each extra one on you (max 3)
        hurt(Math.min(3, 1 + 0.5 * (touchingPlayer - 1)), "contact");
        // helmet loses a life for every second it's touching a zombie
        if (G.helmet > 0 && G.cd.helmet <= 0) {
          G.cd.helmet = 1;
          G.helmet--;
          SFX.play("helmet_crack");
          buildHelmet();
          if (G.helmet === 0) toast("Your helmet broke");
          refreshExtras();
        }
      }
      if (touchingMinion && minion.hurtT <= 0) { minion.hurtT = 1; minion.hp -= 10; if (minion.hp <= 0) killMinion(); }
    }
  }

  function spit(e) {
    const mz = e.mesh.userData.muzzle;
    const from = V3();
    if (mz) { e.mesh.updateWorldMatrix(true, true); mz.getWorldPosition(from); } else from.set(e.x, e.h * 0.85, e.z);
    const dist = Math.hypot(P.pos.x - from.x, P.pos.z - from.z);
    const dir = V3(P.pos.x - from.x, 1.0 - from.y + dist * 0.18, P.pos.z - from.z).normalize(); // lob it a bit
    spawnProjectile("goo", from, dir);
    SFX.play("spit", { x: e.x, z: e.z });
  }
  // things queued during loops: Splitter minis and Boomer blasts
  function flushPending(dt) {
    if (pendingSpawns.length) {
      for (const s of pendingSpawns) {
        if (zombies.length >= 110) break;
        const x = clamp(s.x, -HX + 0.5, HX - 0.5), z = clamp(s.z, -HZ + 0.5, HZ - 0.5);
        const e = spawnZombie(s.type, x, z);
        e.emerge = s.emerge || 0;
      }
      pendingSpawns = [];
    }
    for (const b of pendingBooms) {
      b.t -= dt;
      if (b.t <= 0) { b.done = true; explode(b.x, 0.8, b.z, { r: 3.5, boss: false, player: 3 }); }
    }
    pendingBooms = pendingBooms.filter((b) => !b.done);
  }

  // ---------------------------------------------------------------- the horde ("Start wave" / "Stop wave")
  function startWave(heal = true) {
    G.wave = true;
    G.spawnT = [];
    for (let i = 0; i < G.spawners; i++) G.spawnT.push(randInt(1, 2));
    if (heal) healPlayer(4, null); // every "Start wave" gave the player +4 health
  }
  function stopWave() {
    G.wave = false;
    clearZombies(true);
    removeBounty();
  }
  function updateSpawners(dt) {
    if (!G.wave) return;
    while (G.spawnT.length < G.spawners) G.spawnT.push(randInt(1, 2));
    for (let i = 0; i < G.spawnT.length; i++) {
      G.spawnT[i] -= dt;
      if (G.spawnT[i] <= 0) { G.spawnT[i] = randInt(1, 2); spawnFromHorde(); }
    }
  }

  // ---------------------------------------------------------------- player damage / healing
  const HURT_CD = { contact: 1, laser: 1.5, bounty: 1.5, bossLaser: 1.5, boom: 0.5, goo: 1, rain: 0.5 };
  function hurt(amount, src) {
    if (G.mode !== "playing" || G.cd[src] > 0) return;
    G.cd[src] = HURT_CD[src];
    const dmg = G.helmet > 0 ? amount / 2 : amount; // with a helmet every hit counted half
    G.hp -= dmg;
    hurtFx = 1;
    G.trauma = Math.min(1, G.trauma + 0.35);
    SFX.play("player_hurt");
    refreshHP();
    if (G.hp < 1) gameOver();
  }
  function healPlayer(amount, src) {
    if (src) { if (G.cd[src] > 0) return; G.cd[src] = 1; }
    G.hp += amount;
    healFx = Math.min(1, healFx + 0.6);
    if (src) SFX.play("heal");
    refreshHP();
  }
  function knockback(vel) {
    // snow balls shoved the player back instead of hurting
    tmpV.set(vel.x, 0, vel.z).normalize().multiplyScalar(13);
    P.knock.add(tmpV);
    frostFx = 1;
    G.trauma = Math.min(1, G.trauma + 0.3);
    SFX.play("knockback");
  }

  // ---------------------------------------------------------------- bosses
  function spawnBoss(kind) {
    const def = BOSS[kind];
    const mesh = Models.boss(kind);
    const ud = mesh.userData;
    const hp = randInt(def.hp[0], def.hp[1]);
    // they came in from the right edge of the stage (x = 240, random y)
    const b = { kind, def, hp, maxHp: hp, mesh, r: ud.radius || 1.4, h: ud.height || 4, x: HX - 2.5, z: rand(-HZ + 3, HZ - 3),
      rise: 0, hittable: false, dying: 0, retreating: false, flash: 0, volleyT: randInt(1, 2), volleyLeft: 0, gapT: 0,
      wallT: randInt(1, 4), trailX: 0, trailZ: 0, hue: 0, phase: 0, yaw: -Math.PI / 2, slowT: 0, summonT: 4, rainT: 3 };
    b.trailX = b.x; b.trailZ = b.z;
    mesh.position.set(b.x, -b.h, b.z);
    scene.add(mesh);
    bosses.push(b);
    addBossBar(b);
    SFX.play("warning");
    SFX.play("boss_roar", { x: b.x, z: b.z, vol: 1.2 });
    banner(def.name.toUpperCase(), "Shop locked until it's beaten");
    if (def.clears) stopWave(); // Flame and Glide bosses broadcast "Stop wave"
    G.trauma = Math.min(1, G.trauma + 0.4);
    return b;
  }
  function damageBoss(b, amount) {
    b.hp -= amount;
    b.flash = 0.08;
    SFX.play("boss_hit", { x: b.x, z: b.z, vol: 0.7 });
    hitmarker(false);
    if (b.hp < 1) killBoss(b);
  }
  function killBoss(b) {
    if (b.dying) return;
    b.dying = 0.0001;
    b.hittable = false;
    const pay = earn(randInt(b.def.reward[0], b.def.reward[1]));
    // every 3 bosses beaten, the Block King comes next round
    if (b.kind === "king") G.bossKills = 0; else G.bossKills++;
    G.kills++;
    popup("+" + pay, b.x, b.h + 0.5, b.z);
    hitmarker(true);
    SFX.play("boss_die", { x: b.x, z: b.z, vol: 1.3 });
    const col = { snow: 0xffffff, wall: 0x8ca2eb, flame: 0x9e0000, glide: 0x1bff20, king: 0xffe500 }[b.kind];
    emit(b.x, b.h * 0.5, b.z, [col, col, 0x111111, 0xffdd78], 70, 8, 0.3, 1.5);
    G.trauma = Math.min(1, G.trauma + 0.6);
    banner(b.def.name.toUpperCase() + " DOWN", "+" + pay + "$  ·  new round");
    if (b.kind === "snow") clearDecals(); // "erase all" when the Snow Boss died
    // Beating any boss broadcast "go shop" -> "START GAME": the round (and its boss timers)
    // restarts. In Scratch that also sent every other boss away; now they stay and keep fighting.
    // The Glide Boss also restarted the horde; 3D: so does the Flame Boss.
    roundReset(b);
    if (!G.wave && !bosses.some((o) => o !== b && !o.dying && !o.retreating && o.def.clears)) startWave();
  }
  function bossFire(b) {
    const mz = b.mesh.userData.muzzle;
    const from = V3();
    if (mz) { b.mesh.updateWorldMatrix(true, true); mz.getWorldPosition(from); } else from.set(b.x, b.h * 0.7, b.z);
    const dir = V3(P.pos.x - from.x, 1.1 - from.y, P.pos.z - from.z).normalize();
    spawnProjectile(b.def.shot, from, dir);
    SFX.play(b.def.sfx, { x: b.x, z: b.z });
  }
  function updateBosses(dt) {
    const playing = G.mode === "playing";
    for (const b of bosses) {
      const m = b.mesh;
      if (b.dying || b.retreating) {
        if (b.dieY === undefined) b.dieY = Math.min(0, m.position.y);
        b.dying += dt / (b.retreating ? 1.2 : 1.6);
        if (!b.retreating) m.rotation.x = -Math.min(1, b.dying * 1.4) * 0.5 * Math.PI;
        m.position.y = b.dieY - Math.max(0, b.dying - (b.retreating ? 0 : 0.4)) * b.h * 1.1;
        if (b.dying > 0.6) setOpacity(m, clamp(1 - (b.dying - 0.6) / 0.4, 0, 1));
        if (b.dying >= 1) b.removed = true;
        continue;
      }
      if (b.rise < 1) {
        b.rise = Math.min(1, b.rise + dt / 1.6);
        m.position.set(b.x + Math.sin(b.rise * 80) * 0.06, (b.rise - 1) * b.h, b.z);
        m.rotation.y = b.yaw;
        if (Math.random() < 0.8) emit(b.x + rand(-b.r, b.r), 0.1, b.z + rand(-b.r, b.r), [0x3a2a1a, 0x5a4a35, 0x2f4a1f], 1, 4, 0.18, 0.8);
        b.hittable = b.rise > 0.5;
        continue;
      }
      b.hittable = true;
      if (!playing) continue;
      // "move N steps, point towards player"
      const dx = P.pos.x - b.x, dz = P.pos.z - b.z, d = Math.hypot(dx, dz) || 1;
      const ox = b.x, oz = b.z;
      if (b.slowT > 0) b.slowT -= dt;
      const bsp = b.def.speed * (b.slowT > 0 ? 0.4 : 1);
      if (d > b.r + PLAYER_R) { b.x += (dx / d) * bsp * dt; b.z += (dz / d) * bsp * dt; }
      tmpV.set(b.x, 0, b.z); keepInArena(tmpV, b.r); b.x = tmpV.x; b.z = tmpV.z;
      const px = P.pos.x - b.x, pz = P.pos.z - b.z, pd = Math.hypot(px, pz), rr = b.r + PLAYER_R;
      if (pd < rr && pd > 1e-4) { P.pos.x = b.x + (px / pd) * rr; P.pos.z = b.z + (pz / pd) * rr; keepInArena(P.pos, PLAYER_R); }
      b.yaw = faceYaw(dx, dz);
      const moved = Math.hypot(b.x - ox, b.z - oz);
      b.phase += moved * (2.2 / Math.max(1, b.h / 3));
      const bob = b.kind === "glide" ? 0.6 + Math.sin(performance.now() / 500) * 0.35 : 0;
      m.position.set(b.x, bob, b.z);
      m.rotation.y = b.yaw;
      animateWalk(m, b.phase, 0.35, 0);
      // hit flash; the Flame Boss cycles colour ("change color effect by 2")
      if (b.flash > 0) b.flash -= dt;
      if (b.kind === "flame") {
        b.hue = (b.hue + dt * 0.3) % 1;
        for (const mat of m.userData.mats || []) if (mat.userData && mat.userData.base === undefined) mat.userData.base = mat.color.getHex();
        for (const f of m.userData.flames || []) { f.scale.y = 0.75 + Math.random() * 0.6; }
        for (const mat of m.userData.mats || []) {
          _c.setHex(mat.userData.base);
          const hsl = {}; _c.getHSL(hsl);
          if (hsl.s > 0.3) mat.color.setHSL((hsl.h + b.hue) % 1, hsl.s, hsl.l);
        }
      }
      setEmissive(m, 0xffffff, b.flash > 0 ? 0.6 : 0);
      // volleys of 1-3 shots, 0.1 s apart, then wait 1 or 2 s
      if (b.def.shot) {
        if (b.volleyLeft > 0) {
          b.gapT -= dt;
          if (b.gapT <= 0) { bossFire(b); b.volleyLeft--; b.gapT = 0.13; if (b.volleyLeft === 0) b.volleyT = randInt(1, 2); }
        } else {
          b.volleyT -= dt;
          if (b.volleyT <= 0) { b.volleyLeft = randInt(1, 3); b.gapT = 0; }
        }
      }
      // the Wall Boss makes a wall every 1-4 s
      if (b.kind === "wall") {
        b.wallT -= dt;
        if (b.wallT <= 0) { b.wallT = randInt(1, 4); spawnWall(); }
      }
      // the Block King calls minis out of the ground and drops blocks on you
      if (b.kind === "king") {
        b.summonT -= dt;
        if (b.summonT <= 0) {
          b.summonT = 7;
          for (let i = 0; i < 3; i++) { const a = Math.random() * TAU; pendingSpawns.push({ type: 1, x: b.x + Math.cos(a) * (b.r + 1.5), z: b.z + Math.sin(a) * (b.r + 1.5), emerge: 0 }); }
          SFX.play("boss_roar", { x: b.x, z: b.z, vol: 0.6 });
        }
        b.rainT -= dt;
        if (b.rainT <= 0) { b.rainT = 5; blockRain(); }
      }
      // the Snow Boss left a white pen trail
      if (b.kind === "snow" && Math.hypot(b.x - b.trailX, b.z - b.trailZ) > 0.7) { b.trailX = b.x; b.trailZ = b.z; addDecal(b.x, b.z, rand(2.2, 3.2)); }
      // touching the Flame Boss hurts like a zombie
      if (b.def.contact && d < b.r + PLAYER_R + 0.25) hurt(b.kind === "king" ? 2 : 1, "contact");
    }
    const gone = bosses.filter((b) => b.removed);
    for (const b of gone) { disposeMesh(b.mesh); removeBossBar(b); }
    if (gone.length) bosses = bosses.filter((b) => !b.removed);
  }
  const bossAlive = () => bosses.some((b) => !b.dying && !b.retreating);

  // Block King: blocks fall where the red squares appear
  const warnGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.5, depthWrite: false });
  function blockRain() {
    const spots = [{ x: P.pos.x, z: P.pos.z }];
    for (let i = 0; i < 4; i++) spots.push({ x: P.pos.x + rand(-6, 6), z: P.pos.z + rand(-6, 6) });
    for (const s of spots) {
      const x = clamp(s.x, -HX + 1, HX - 1), z = clamp(s.z, -HZ + 1, HZ - 1);
      const warn = new THREE.Mesh(warnGeo, warnMat);
      warn.rotation.x = -Math.PI / 2;
      warn.position.set(x, 0.04, z);
      scene.add(warn);
      const block = Models.rubble();
      block.position.set(x, 18, z);
      block.rotation.y = Math.random() * TAU;
      block.visible = false;
      scene.add(block);
      falling.push({ x, z, t: 1.1 + Math.random() * 0.3, y: 18, warn, block });
    }
  }
  function updateFalling(dt) {
    for (const f of falling) {
      f.warn.scale.setScalar(1 + Math.sin(performance.now() / 60) * 0.06);
      if (f.t > 0) { f.t -= dt; if (f.t <= 0.35) f.block.visible = true; if (f.t > 0.35) continue; }
      f.y = Math.max(0, f.y - dt * 52);
      f.block.position.y = f.y;
      if (f.y > 0) continue;
      f.done = true;
      scene.remove(f.warn);
      SFX.play("block_fall", { x: f.x, z: f.z });
      emit(f.x, 0.2, f.z, [0x6b4c30, 0x4a3523, 0x3a2a1a], 14, 5, 0.16, 0.8);
      const dist = Math.hypot(P.pos.x - f.x, P.pos.z - f.z);
      G.trauma = Math.min(1, G.trauma + clamp(0.5 - dist / 20, 0, 0.4));
      if (dist < 1.4) hurt(2, "rain");
      for (const e of zombies) if (!e.dying && Math.hypot(e.x - f.x, e.z - f.z) < 1.3) damageZombie(e, 15, "flat");
      // it stays as a crate for a few seconds (works like a Wall Boss wall)
      const ang = f.block.rotation.y;
      walls.push({ mesh: f.block, box: { x: f.x, z: f.z, hx: 0.7, hz: 0.7, ang, h: 1.4 }, rise: 1, life: 4, fade: 0, solid: true, h: 1.4 });
    }
    falling = falling.filter((f) => !f.done);
  }
  function clearFalling() { for (const f of falling) { scene.remove(f.warn); disposeMesh(f.block); } falling = []; }

  // Freeze bomb: zombies in the blast freeze for 4 s, bosses slow down
  function freezeBurst(x, y, z) {
    SFX.play("freeze", { x, z, vol: 1.1 });
    emit(x, y, z, [0xffffff, 0xdff4ff, 0xa9d8f5, 0x7fd8ff], 50, 7, 0.16, 1.0, 3);
    for (let i = 0; i < 6; i++) addDecal(x + rand(-3, 3), z + rand(-3, 3), rand(1.5, 2.6));
    const R = 5;
    for (const e of zombies) if (!e.dying && e.emerge > 0.3 && Math.hypot(e.x - x, e.z - z) < R + e.r) { e.frozen = 4; e.fuse = 0; setEmissive(e.mesh, 0x3a8ac0, 0.7); }
    for (const b of bosses) if (b.hittable && Math.hypot(b.x - x, b.z - z) < R + b.r) b.slowT = 4;
  }
  function throwFreeze() {
    if (!G.owned.freeze) return notOwned("freeze");
    if (G.freezeCd > 0) return cooldownToast("Freeze bomb", G.freezeCd);
    G.freezeCd = 10;
    const aim = aimPoint(V3());
    const from = shotOrigin(muzzleWorld(V3()), aim);
    spawnProjectile("freeze", from, aim.sub(from).normalize());
    SFX.play("tnt_throw");
    refreshSlots();
  }
  // Land mines: 3 a round, armed after a second, go off when a zombie or boss steps close
  function placeMine() {
    if (!G.owned.mine) return notOwned("mine");
    if (G.minesLeft <= 0) { SFX.play("empty"); toast("No mines left. You get 3 every round"); return; }
    G.minesLeft--;
    const mesh = Models.mine();
    mesh.position.set(P.pos.x, 0, P.pos.z);
    scene.add(mesh);
    mines.push({ mesh, x: P.pos.x, z: P.pos.z, arm: 1, t: 0 });
    SFX.play("mine_place");
    refreshSlots();
  }
  function updateMines(dt) {
    for (const m of mines) {
      m.t += dt;
      if (m.arm > 0) { m.arm -= dt; continue; }
      const light = m.mesh.userData.light;
      if (light) light.visible = Math.floor(m.t * 3) % 2 === 0;
      let boom = false;
      for (const e of zombies) if (!e.dying && e.emerge >= 1 && Math.hypot(e.x - m.x, e.z - m.z) < e.r + 0.6) { boom = true; break; }
      if (!boom) for (const b of bosses) if (b.hittable && Math.hypot(b.x - m.x, b.z - m.z) < b.r + 0.5) { boom = true; break; }
      if (boom) { m.done = true; scene.remove(m.mesh); explode(m.x, 0.3, m.z); }
    }
    mines = mines.filter((m) => !m.done);
  }
  function clearMines() { for (const m of mines) scene.remove(m.mesh); mines = []; }

  // Boss HP bars
  function addBossBar(b) {
    const el = document.createElement("div");
    el.className = "bossbar";
    el.innerHTML = `<div class="bname"><span>${b.def.name}</span><small class="num"></small></div><div class="track"><div class="fill"></div></div>`;
    $("bossbars").appendChild(el);
    b.bar = el;
  }
  function removeBossBar(b) { if (b.bar) b.bar.remove(); b.bar = null; }

  // Wall Boss walls: 1 in 7 large, then about a quarter middle, the rest short; gone after 3-10 s
  function spawnWall() {
    let size = "short";
    if (randInt(1, 7) === 1) size = "large";
    else if (randInt(1, 7) === 2 || randInt(1, 7) === 3) size = "middle";
    const mesh = Models.wall(size);
    const ud = mesh.userData;
    const hx = ud.halfLen || 1.5, hz = ud.halfThick || 0.3;
    let x = 0, z = 0, ang = rand(-Math.PI, Math.PI);
    for (let i = 0; i < 20; i++) {
      x = rand(-HX + 2, HX - 2); z = rand(-HZ + 2, HZ - 2);
      const box = { x, z, hx, hz, ang };
      if (!circleHitsBox(P.pos.x, P.pos.z, PLAYER_R + 1, box)) break;
    }
    mesh.position.set(x, -3.5, z);
    mesh.rotation.y = ang;
    scene.add(mesh);
    const h = { short: 2.4, middle: 2.8, large: 3.2 }[size];
    walls.push({ mesh, box: { x, z, hx, hz, ang, h }, rise: 0, life: randInt(3, 10), fade: 0, solid: false, h });
    SFX.play("wall_rise", { x, z });
    emit(x, 0.1, z, [0x3a2a1a, 0x5a4a35, 0x222222], 14, 4, 0.16, 0.8);
  }
  function updateWalls(dt) {
    for (const w of walls) {
      if (w.rise < 1) { w.rise = Math.min(1, w.rise + dt / 0.45); w.mesh.position.y = (w.rise - 1) * w.h * 1.05; }
      else if (G.mode === "playing") {
        w.life -= dt;
        if (w.life <= 0) {
          w.fade += dt / 0.33; // "change ghost effect by 10" x10
          setOpacity(w.mesh, clamp(1 - w.fade, 0, 1));
          if (w.fade >= 1) w.dead = true;
        }
      }
      w.solid = w.rise > 0.6 && w.fade < 0.5;
      if (w.solid && G.mode === "playing") pushOut(P.pos, PLAYER_R, w.box);
    }
    for (const w of walls) if (w.dead) disposeMesh(w.mesh);
    walls = walls.filter((w) => !w.dead);
  }
  function clearWalls() { for (const w of walls) disposeMesh(w.mesh); walls = []; }

  // ---------------------------------------------------------------- rounds ("START GAME")
  // In the original, START GAME was broadcast at the start, every time you closed the shop,
  // and whenever a boss died. It restarted the boss timers and the pickup spawners.
  function roundReset(killed) {
    G.round = { t: 0, snow: false, wall: false, flame: false };
    if (G.bossKills >= 3) G.kingDue = true;
    G.kingWarned = false;
    if (G.owned.mine) G.minesLeft = 3;
    G.appleT = randInt(10, 20);
    G.godT = randInt(30, 50);
    G.goldT = randInt(10, 25);
    G.goldCount = 0;
    // the Glide Boss only appears if the round starts while you have exactly 300-305 money
    if (G.money >= 300 && G.money <= 305 && !bossOut("glide")) spawnBoss("glide");
  }
  // a boss that's still out doesn't get a twin when its timer comes round again
  function bossOut(k) { return bosses.some((b) => b.kind === k && !b.dying && !b.retreating); }
  function updateRound(dt) {
    const r = G.round;
    r.t += dt;
    if (!r.snow && r.t >= BOSS_AT.snow) { r.snow = true; if (!bossOut("snow")) spawnBoss("snow"); }
    if (!r.wall && r.t >= BOSS_AT.wall && G.money > 0) { r.wall = true; if (!bossOut("wall")) spawnBoss("wall"); }
    if (!r.flame && r.t >= BOSS_AT.flame && G.money > 0) { r.flame = true; if (!bossOut("flame")) spawnBoss("flame"); }
    if (G.kingDue && !G.kingWarned && r.t >= 15) { G.kingWarned = true; banner("THE BLOCK KING IS COMING", "You beat 3 bosses. He noticed.", 4); SFX.play("warning"); }
    if (G.kingDue && r.t >= 20) { G.kingDue = false; if (!bossOut("king")) spawnBoss("king"); }
  }

  // ---------------------------------------------------------------- pickups
  function spawnApple(god) {
    const mesh = god ? Models.godApple() : Models.apple();
    // Apple: x -180..180, y -270..270 (clamped to the stage). God Apple: -150..150 both ways.
    const x = god ? rand(-15, 15) : rand(-18, 18), z = god ? rand(-15, 15) : clamp(rand(-27, 27), -HZ + 1, HZ - 1);
    mesh.position.set(x, 0.35, z);
    scene.add(mesh);
    apples.push({ mesh, god, x, z, life: 10, t: Math.random() * 10 });
    if (god) SFX.play("pickup", { x, z, vol: 0.5 });
  }
  function updateApples(dt) {
    for (const a of apples) {
      a.t += dt;
      a.life -= dt;
      a.mesh.position.y = 0.35 + Math.sin(a.t * 3) * 0.12;
      a.mesh.rotation.y += dt * 1.6;
      if (a.god) for (const m of a.mesh.userData.mats || []) m.color.setHSL((a.t * 0.8) % 1, 0.9, 0.55); // "change color effect by 5"
      if (a.life < 2) a.mesh.visible = Math.floor(a.life * 8) % 2 === 0;
      if (a.life <= 0) { a.dead = true; continue; }
      if (G.mode === "playing" && Math.hypot(a.x - P.pos.x, a.z - P.pos.z) < 1.1) {
        a.dead = true;
        healPlayer(a.god ? 5 : 1, null);
        SFX.play("heal");
        popup(a.god ? "+5 HP" : "+1 HP", a.x, 1.2, a.z, "#5dff8a");
        SFX.play("pickup");
      }
    }
    for (const a of apples) if (a.dead) disposeMesh(a.mesh);
    apples = apples.filter((a) => !a.dead);
  }
  function spawnGold() {
    const size = randInt(1, 3);
    const mesh = Models.gold(size);
    const s = randomSpot(4, 2);
    mesh.position.set(s.x, 0, s.z);
    mesh.rotation.y = Math.random() * TAU;
    scene.add(mesh);
    golds.push({ mesh, x: s.x, z: s.z, r: mesh.userData.radius || 0.4 * size + 0.2 });
  }
  function mineGold(g) {
    if (g.dead) return;
    g.dead = true;
    const pay = earn(randInt(100, 250));
    popup("+" + pay, g.x, 1.4, g.z);
    SFX.play("gold", { x: g.x, z: g.z });
    emit(g.x, 0.6, g.z, [0xffe500, 0xfff27a, 0x9a9a9a], 26, 5, 0.14, 1.0);
  }
  function updateGold() {
    for (const g of golds) if (g.dead) disposeMesh(g.mesh);
    golds = golds.filter((g) => !g.dead);
  }
  function updatePickupSpawners(dt) {
    G.appleT -= dt; if (G.appleT <= 0) { G.appleT = randInt(10, 20); spawnApple(false); }
    G.godT -= dt; if (G.godT <= 0) { G.godT = randInt(30, 50); spawnApple(true); }
    G.goldT -= dt;
    if (G.goldT <= 0) { G.goldT = randInt(10, 25); if (G.goldCount < 10 && golds.length < 10) { G.goldCount++; spawnGold(); } } // "max gold" 10
  }

  // ---------------------------------------------------------------- laser walls
  // "Laser" glided to a random spot every 2 s (+1 s wait) and hurt; "Laser2" (2.5 s) healed.
  // 3D: the healing one is green so you can tell them apart.
  function makeLasers() {
    for (const l of lasers) scene.remove(l.mesh);
    lasers.length = 0;
    for (const kind of ["hurt", "heal"]) {
      const mesh = Models.laserWall(kind === "hurt" ? 0xff2020 : 0x30ff60);
      const s = randomSpot(10, 3);
      mesh.position.set(s.x, 0, s.z);
      scene.add(mesh);
      lasers.push({ kind, mesh, from: V3(s.x, 0, s.z), to: V3(s.x, 0, s.z), t: 0, dur: kind === "hurt" ? 2 : 2.5, wait: 1, box: { x: s.x, z: s.z, hx: 0.3, hz: 2, ang: 0 } });
    }
  }
  function updateLasers(dt) {
    const now = performance.now() / 1000;
    for (const l of lasers) {
      if (G.mode === "playing" || G.mode === "title") {
        if (l.wait > 0) {
          l.wait -= dt;
          if (l.wait <= 0) { l.from.copy(l.mesh.position); const s = randomSpot(0, 2.5); l.to.set(s.x, 0, s.z); l.t = 0; }
        } else {
          l.t = Math.min(1, l.t + dt / l.dur);
          l.mesh.position.lerpVectors(l.from, l.to, l.t);
          if (l.t >= 1) l.wait = 1;
        }
      }
      l.box.x = l.mesh.position.x; l.box.z = l.mesh.position.z;
      l.mesh.children.forEach((c, i) => {
        const m = c.material;
        if (!m || m.blending !== THREE.AdditiveBlending) return;
        if (m.userData.baseOp === undefined) m.userData.baseOp = m.opacity;
        m.opacity = m.userData.baseOp * (0.8 + Math.sin(now * 9 + i) * 0.2);
      });
      if (G.mode === "playing" && circleHitsBox(P.pos.x, P.pos.z, PLAYER_R, l.box)) {
        if (l.kind === "hurt") hurt(1, "laser");
        else if (G.hp < 30) healPlayer(Math.min(2, 30 - G.hp), "beam"); // balance: was +5/s with no limit
      }
    }
  }

  // ---------------------------------------------------------------- gadgets
  const fwd = (out) => out.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  function cooldownToast(name, secs) { SFX.play("empty"); toast(`${name} recharging (${Math.ceil(secs)} s)`); }
  function notOwned(id) {
    const it = SHOP.find((s) => s.id === id);
    SFX.play("empty");
    toast(`${it.name} is in the shop (${it.price}$)`);
  }

  function throwTNT() {
    if (!G.owned.tnt) return notOwned("tnt");
    if (G.tntCd > 0) return cooldownToast("TNT", G.tntCd);
    G.tntCd = 3.5;
    const aim = aimPoint(V3());
    const from = shotOrigin(muzzleWorld(V3()), aim);
    spawnProjectile("tnt", from, aim.sub(from).normalize());
    SFX.play("tnt_throw");
    refreshSlots();
  }

  function raiseShield() {
    if (!G.owned.shield) return notOwned("shield");
    if (shield.cd > 0) return cooldownToast("Shield", shield.cd);
    shield.cd = 12.5; // "wait 12.5" after making the shield
    shield.t = 5; // 150 ticks
    if (!shield.mesh) { shield.mesh = Models.shield(); scene.add(shield.mesh); shield.box = { x: 0, z: 0, hx: 1.2, hz: 0.25, ang: 0 }; }
    placeShield();
    SFX.play("shield_up");
    refreshSlots();
  }
  function placeShield() {
    fwd(tmpV);
    const x = P.pos.x + tmpV.x * 1.3, z = P.pos.z + tmpV.z * 1.3;
    shield.mesh.position.set(x, 0, z);
    shield.mesh.rotation.y = P.yaw + Math.PI;
    Object.assign(shield.box, { x, z, ang: P.yaw + Math.PI });
  }
  function dropShield() { if (shield.mesh) { scene.remove(shield.mesh); shield.mesh = null; } }

  function deployTurret() {
    if (!G.owned.turret) return notOwned("turret");
    if (turret.mesh) return toast(`Turret is firing (${turret.shots} shots left)`);
    if (turret.cd > 0) return cooldownToast("Turret", turret.cd);
    fwd(tmpV);
    turret.mesh = Models.turret();
    turret.mesh.position.set(P.pos.x + tmpV.x * 0.6 - tmpV.z * 1.6, 0, P.pos.z + tmpV.z * 0.6 + tmpV.x * 1.6); // set down at your right side
    tmpV2.copy(turret.mesh.position); keepInArena(tmpV2, 0.6); turret.mesh.position.copy(tmpV2);
    scene.add(turret.mesh);
    turret.shots = 500;
    turret.t = 0.3;
    turret.dir = P.yaw + Math.PI;
    SFX.play("turret_deploy");
    refreshSlots();
  }
  function updateTurret(dt) {
    if (!turret.mesh) { if (turret.cd > 0) turret.cd -= dt; return; }
    const head = parts(turret.mesh).head || turret.mesh;
    turret.t -= dt;
    if (turret.t <= 0) {
      turret.t = 0.283; // "wait 0.25" + a tick
      turret.dir -= (3 * Math.PI) / 180; // "turn 3 degrees" every shot
      head.rotation.y = turret.dir - turret.mesh.rotation.y;
      const from = V3();
      turret.mesh.updateWorldMatrix(true, true);
      (turret.mesh.userData.muzzle || head).getWorldPosition(from);
      spawnProjectile("turret", from, V3(Math.sin(turret.dir), 0, Math.cos(turret.dir)));
      SFX.play("turret", { x: from.x, z: from.z, vol: 0.6 });
      turret.shots--;
      if (turret.shots <= 0) { removeTurret(); turret.cd = 100; }
    }
  }
  function removeTurret() { if (turret.mesh) { emit(turret.mesh.position.x, 0.6, turret.mesh.position.z, [0x222222, 0xf48d0d], 12, 3, 0.1, 0.6); scene.remove(turret.mesh); turret.mesh = null; } refreshSlots(); }

  function deployFortress() {
    if (!G.owned.fortress) return notOwned("fortress");
    if (fortress.mesh) return toast(`Fortress holds for ${fortress.hp} s`);
    if (fortress.cd > 0) return cooldownToast("Port a fortress", fortress.cd);
    // "go to player, point towards mouse, move 5"
    fwd(tmpV);
    const mesh = Models.fortress();
    const x = P.pos.x + tmpV.x * 0.5, z = P.pos.z + tmpV.z * 0.5, ang = P.yaw + Math.PI;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = ang;
    scene.add(mesh);
    fortress.mesh = mesh;
    fortress.hp = 100;
    fortress.t = 1;
    fortress.warned = false;
    const c = Math.cos(ang), s = Math.sin(ang);
    fortress.segs = (mesh.userData.segments || []).map((g) => ({
      x: x + g.x * c + g.z * s, z: z - g.x * s + g.z * c, hx: g.len / 2, hz: g.thick / 2, ang: ang + (g.angle || 0), h: 2.2,
    }));
    refreshSolids();
    SFX.play("fortress_up");
    G.trauma = Math.min(1, G.trauma + 0.25);
    refreshSlots();
  }
  function updateFortress(dt) {
    if (!fortress.mesh) { if (fortress.cd > 0) fortress.cd -= dt; return; }
    fortress.t -= dt;
    if (fortress.t <= 0) {
      fortress.t = 1;
      fortress.hp--;
      if (fortress.hp === 5) { toast("fortress breached in 5 seconds", 2); SFX.play("fortress_warn"); }
      if (fortress.hp <= 0) { toast("fortress breached ", 2); removeFortress(); fortress.cd = 90; }
    }
  }
  function removeFortress() {
    if (!fortress.mesh) return;
    for (const s of fortress.segs) emit(s.x, 1, s.z, [0x111111, 0x333333, 0x555555], 10, 3, 0.2, 0.9);
    scene.remove(fortress.mesh);
    fortress.mesh = null;
    fortress.segs = [];
    refreshSlots();
  }

  // ---------------------------------------------------------------- minion
  function spawnMinion() {
    if (!minion.mesh) {
      minion.mesh = Models.minion();
      // health bar: two sprites over its head
      const mk = (color) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false })); s.center.set(0, 0.5); s.scale.set(1, 0.12, 1); s.renderOrder = 10; return s; };
      minion.bar = mk(0x0b1b1b); minion.fill = mk(0x00fff9);
      minion.bar.position.set(-0.5, 1.6, 0); minion.fill.position.set(-0.5, 1.6, 0.001);
      minion.mesh.add(minion.bar, minion.fill);
    }
    fwd(tmpV);
    minion.mesh.position.set(P.pos.x - tmpV.z * 1.5, 0, P.pos.z + tmpV.x * 1.5);
    minion.from.copy(minion.mesh.position); minion.to.copy(minion.mesh.position);
    minion.t = 1; minion.phase = 1; minion.hp = 100; minion.alive = true; minion.hurtT = 0;
    scene.add(minion.mesh);
    SFX.play("minion_spawn");
    refreshExtras();
  }
  function killMinion() {
    minion.alive = false;
    minion.respawn = 25; // "wait 25, broadcast get my minion"
    const p = minion.mesh.position;
    emit(p.x, 0.8, p.z, [0x00fff9, 0x111111, 0xffffff], 22, 4, 0.12, 0.9);
    SFX.play("minion_die", { x: p.x, z: p.z });
    scene.remove(minion.mesh);
    toast("Your minion went down. Back in 25 s");
    refreshExtras();
  }
  function minionFire(aim) {
    const m = minion.mesh;
    m.rotation.y = faceYaw(aim.x - m.position.x, aim.z - m.position.z);
    m.updateWorldMatrix(true, true);
    const from = (m.userData.muzzle || m).getWorldPosition(V3());
    spawnProjectile("ai", from, aim.clone().sub(from).normalize());
    SFX.play("minion_shot", { x: from.x, z: from.z, vol: 0.5 });
  }
  function updateMinion(dt) {
    if (!G.owned.minion) return;
    if (!minion.alive) {
      if (G.mode === "playing") { minion.respawn -= dt; if (minion.respawn <= 0) spawnMinion(); }
      return;
    }
    minion.hurtT -= dt;
    const m = minion.mesh;
    // "glide 1 secs to random position, wait 1"
    if (minion.phase === 0) {
      minion.t = Math.min(1, minion.t + dt);
      m.position.lerpVectors(minion.from, minion.to, minion.t);
      animateWalk(m, minion.t * 14, 0.5);
      if (minion.t >= 1) { minion.phase = 1; minion.t = 0; }
    } else {
      minion.t += dt;
      animateWalk(m, 0, 0);
      if (minion.t >= 1) {
        minion.phase = 0; minion.t = 0;
        minion.from.copy(m.position);
        minion.to.set(rand(-HX + 1, HX - 1), 0, rand(-HZ + 1, HZ - 1));
        m.rotation.y = faceYaw(minion.to.x - m.position.x, minion.to.z - m.position.z);
      }
    }
    minion.fill.scale.x = Math.max(0, minion.hp / 100);
    // round the health bar to the original's 10 steps
    minion.fill.material.color.setHex(minion.hp > 30 ? 0x00fff9 : 0xff4b3e);
  }

  // ---------------------------------------------------------------- bounty
  // Bought for 150: a 120 s "bounty time" starts; 5-15 s later the target appears and glides
  // at you in six 2-second hops, blinking out on the 3rd and 6th hop, then escapes.
  const BOUNTY_VIS = [true, true, false, true, true, false];
  function spawnBounty() {
    if (bounty) { disposeMesh(bounty.mesh); bounty = null; }
    const mesh = Models.boss("bounty");
    const s = randomSpot(14, 2);
    mesh.position.set(s.x, 0, s.z);
    scene.add(mesh);
    bounty = { mesh, x: s.x, z: s.z, r: mesh.userData.radius || 0.45, h: mesh.userData.height || 1.9, hp: 100, step: -1, t: 1, from: V3(), to: V3(), visible: true, flash: 0, phase: 0 };
    banner("BOUNTY", "Kill the target to get money", 2.5);
    SFX.play("warning");
  }
  function removeBounty() {
    if (bounty) { disposeMesh(bounty.mesh); bounty = null; }
    G.bountyTime = 0; // the hunt is over once the target is gone
    G.bountySpawnT = 0;
  }
  function damageBounty(n) {
    if (!bounty) return;
    // 3D: the original only counted one hit per second, which made the target unkillable in 12 s
    bounty.hp -= n;
    bounty.flash = 0.06;
    hitmarker(false);
    SFX.play("boss_hit", { x: bounty.x, z: bounty.z, vol: 0.5 });
    if (bounty.hp <= 0) {
      const pay = earn(250); // balance: it cost 150 and paid 100, so winning lost you money
      G.kills++;
      G.bountyTime = 0;
      popup("+" + pay, bounty.x, 2.4, bounty.z);
      emit(bounty.x, 1, bounty.z, [0x7bac00, 0xff0000, 0x111111], 30, 5, 0.14, 1);
      SFX.play("kill", { x: bounty.x, z: bounty.z });
      hitmarker(true);
      banner("BOUNTY CLAIMED", "+" + pay + "$", 2.5);
      removeBounty();
    }
  }
  function updateBounty(dt) {
    if (G.bountyTime > 0) {
      G.bountyAcc += dt;
      while (G.bountyAcc >= 1 && G.bountyTime > 0) { G.bountyAcc -= 1; G.bountyTime--; }
    }
    if (G.bountySpawnT > 0) { G.bountySpawnT -= dt; if (G.bountySpawnT <= 0 && G.bountyTime > 0) spawnBounty(); }
    if (!bounty) return;
    const b = bounty;
    b.t += dt / 2;
    if (b.t >= 1) {
      b.step++;
      if (b.step >= 6) { // escaped
        emit(b.x, 1, b.z, [0x222222, 0x444444], 14, 3, 0.12, 0.6);
        toast("The bounty got away");
        removeBounty();
        return;
      }
      b.t = 0;
      b.from.set(b.x, 0, b.z);
      b.to.set(P.pos.x, 0, P.pos.z);
      b.visible = BOUNTY_VIS[b.step];
    }
    const ox = b.x, oz = b.z;
    tmpV.lerpVectors(b.from, b.to, b.t);
    b.x = tmpV.x; b.z = tmpV.z;
    b.phase += Math.hypot(b.x - ox, b.z - oz) * 4;
    b.mesh.position.set(b.x, 0, b.z);
    b.mesh.rotation.y = faceYaw(P.pos.x - b.x, P.pos.z - b.z);
    animateWalk(b.mesh, b.phase, 0.6);
    if (b.flash > 0) b.flash -= dt;
    setEmissive(b.mesh, 0xffffff, b.flash > 0 ? 0.6 : 0);
    setOpacity(b.mesh, b.visible ? 1 : 0.08 + Math.random() * 0.06);
    // hidden sprites can't touch anything in Scratch
    if (b.visible && G.mode === "playing" && Math.hypot(b.x - P.pos.x, b.z - P.pos.z) < b.r + PLAYER_R + 0.15) hurt(5, "bounty");
  }

  // ---------------------------------------------------------------- player
  function updatePlayer(dt) {
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz += 1;
    if (keys.KeyS || keys.ArrowDown) mz -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    const f = fwd(tmpV), len = Math.hypot(mx, mz) || 1;
    const rx = -f.z, rz = f.x; // right vector
    // sprint: Shift while moving (not while aiming down sights)
    const wantSprint = (keys.ShiftLeft || keys.ShiftRight) && (mx || mz) && !mouse[2];
    if (wantSprint && !G.exhausted && G.mana > 0) {
      G.sprinting = true;
      G.mana = Math.max(0, G.mana - MANA.drain * dt);
      G.manaDelay = MANA.delay;
      if (G.mana <= 0) { G.exhausted = true; G.sprinting = false; SFX.play("mana_empty"); toast("Out of mana"); }
    } else {
      G.sprinting = false;
      if (G.manaDelay > 0) G.manaDelay -= dt;
      else G.mana = Math.min(MANA.max, G.mana + MANA.regen * dt);
      if (G.exhausted && G.mana >= MANA.resume) { G.exhausted = false; SFX.play("mana_back"); }
    }
    G.sprintK = lerp(G.sprintK, G.sprinting ? 1 : 0, 1 - Math.pow(0.001, dt));
    const speed = 7 * (G.sprinting ? MANA.speed : 1);
    let vx = ((f.x * mz + rx * mx) / len) * speed, vz = ((f.z * mz + rz * mx) / len) * speed;
    if (G.ads > 0.5) { vx *= 0.6; vz *= 0.6; }
    if (G.slowT > 0) { G.slowT -= dt; vx *= 0.55; vz *= 0.55; } // spitter goo
    const stepX = (vx + P.knock.x) * dt, stepZ = (vz + P.knock.z) * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(stepX, stepZ) / 0.2));
    for (let i = 0; i < n; i++) {
      P.pos.x += stepX / n;
      P.pos.z += stepZ / n;
      for (const b of solids()) pushOut(P.pos, PLAYER_R, b);
    }
    P.knock.multiplyScalar(Math.pow(0.02, dt));
    keepInArena(P.pos, PLAYER_R);
    P.moving = mx || mz ? 1 : 0;
    if (P.moving) G.walkPhase += dt * (G.sprinting ? 13 : 9.5);
    // timers
    for (const k in G.cd) if (G.cd[k] > 0) G.cd[k] -= dt;
    if (G.tntCd > 0) G.tntCd -= dt;
    if (G.freezeCd > 0) G.freezeCd -= dt;
    if (G.moneyMultT > 0) { G.moneyMultT -= dt; if (G.moneyMultT <= 0) { G.moneyMult = 1; toast("Double money is over"); refreshExtras(); } }
    if (shield.cd > 0) shield.cd -= dt;
    if (shield.mesh) { shield.t -= dt; placeShield(); if (shield.t <= 0) dropShield(); }
    // "Time" goes up once a second
    G.timeAcc += dt;
    while (G.timeAcc >= 1) { G.timeAcc -= 1; G.time++; }
    const grow = (G.time >= 180) + (G.time >= 360) + (G.time >= 600); // balance: +1 spawner at 3, 6 and 10 minutes
    if (grow > G.hordeGrow) { G.hordeGrow = grow; G.spawners++; banner("THE HORDE GROWS", "More zombies from now on", 3); SFX.play("warning"); }
    // regeneration upgrades
    if (G.selfheal && G.hp < 25) { G.regenSelf += dt; if (G.regenSelf >= 1) { G.regenSelf = 0; healPlayer(1, null); } }
    if (G.armored && G.hp < 50) { G.regenArmor += dt; if (G.regenArmor >= 5) { G.regenArmor = 0; healPlayer(1, null); } }
    // win at 1000 money
    if (!G.wonShown && G.money >= 1000) { G.wonShown = true; banner("YOU WIN", "1000 money. Keep going if you want.", 4); SFX.play("win"); }
    // ADS / scope
    const wantAds = mouse[2] && locked && !G.sprinting;
    G.ads = lerp(G.ads, wantAds ? 1 : 0, 1 - Math.pow(0.0001, dt));
  }

  // ---------------------------------------------------------------- camera + view model
  function updateCamera(dt) {
    G.trauma = Math.max(0, G.trauma - dt * 1.6);
    const sh = G.trauma * G.trauma;
    const scoped = G.gun === 4 && G.ads > 0.6;
    const targetFov = scoped ? 22 : 75 - G.ads * 18 + G.sprintK * 9;
    if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = lerp(camera.fov, targetFov, 1 - Math.pow(0.0005, dt)); camera.updateProjectionMatrix(); }
    const bob = P.moving ? Math.sin(G.walkPhase) * (0.045 + G.sprintK * 0.03) : 0;
    camera.rotation.set(P.pitch + (Math.random() - 0.5) * sh * 0.06, P.yaw + (Math.random() - 0.5) * sh * 0.06, 0);
    if (G.mode === "dead") {
      G.deathT = (G.deathT || 0) + dt;
      const k = Math.min(1, G.deathT * 1.4);
      camera.rotation.z = k * 0.6;
      camera.rotation.x = P.pitch * (1 - k) - k * 0.25;
    }
    if (!settings.third) {
      camera.position.set(P.pos.x, lerp(EYE + bob, 0.35, G.mode === "dead" ? Math.min(1, G.deathT * 1.4) : 0), P.pos.z);
    } else {
      const f = tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = tmpV2.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camera.position.set(P.pos.x, 1.75, P.pos.z).addScaledVector(f, -4.3).addScaledVector(right, 1.05);
      camera.position.y = Math.max(0.4, camera.position.y + 0.55);
    }
    camera.updateMatrixWorld();
    // player body (third person only)
    if (playerMesh) {
      playerMesh.visible = settings.third && G.mode !== "title";
      playerMesh.position.set(P.pos.x, 0, P.pos.z);
      playerMesh.rotation.y = P.yaw + Math.PI;
      playerMesh.rotation.x = G.mode === "dead" ? -Math.min(1, G.deathT * 1.8) * Math.PI / 2 : 0; // fall on your back
      animateWalk(playerMesh, G.walkPhase, P.moving ? (G.sprinting ? 0.8 : 0.55) : 0, 0);
      const pr = parts(playerMesh);
      if (pr.armR) pr.armR.rotation.x = -Math.PI / 2 - P.pitch * 0.9 - G.recoil * 0.2;
      if (pr.armL) pr.armL.rotation.x = -Math.PI / 2.4 - P.pitch * 0.9;
      for (let i = 1; i <= NG; i++) guns3p[i].visible = settings.third && i === G.gun;
    }
    // first-person gun: sway, bob, recoil, aim-down-sights
    G.recoil = Math.max(0, G.recoil - dt * 6);
    vm.position.copy(camera.position);
    vm.quaternion.copy(camera.quaternion);
    const g = gunsVM[G.gun];
    const ads = G.ads;
    const sk = G.sprintK;
    g.position.set(lerp(0.3, 0, ads) + sk * 0.04, lerp(-0.3, -0.17, ads) + (P.moving ? Math.abs(Math.cos(G.walkPhase)) * (0.02 + sk * 0.03) : 0) * (1 - ads) - sk * 0.07, -0.62 + G.recoil * 0.1 + sk * 0.06);
    g.rotation.set(G.recoil * 0.18 - sk * 0.35, Math.PI + (P.moving ? Math.sin(G.walkPhase) * (0.02 + sk * 0.04) : 0) + sk * 0.25, sk * 0.15); // gun barrels face +Z; camera looks -Z
    vm.updateMatrixWorld(true);
    // muzzle flash
    flashT -= dt;
    const showFlash = flashT > 0;
    const fp = !settings.third;
    vmFlash.visible = showFlash && fp && !scoped;
    tpFlash.visible = showFlash && !fp;
    if (showFlash) {
      const mz = currentGunMesh().userData.muzzle;
      if (fp && mz) { mz.getWorldPosition(tmpV); vmFlash.position.copy(vm.worldToLocal(tmpV)); vmFlash.rotation.set(0, 0, Math.random() * TAU); vmFlash.scale.setScalar(rand(0.8, 1.2)); }
      if (!fp && mz) { mz.getWorldPosition(tpFlash.position); tpFlash.quaternion.copy(camera.quaternion); }
    }
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 30);
    boomLight.intensity = Math.max(0, boomLight.intensity - dt * 9);
    show("scope", scoped && G.mode === "playing");
    $("crosshair").classList.toggle("dot", scoped);
    SFX.setListener(P.pos.x, P.pos.z, P.yaw + Math.PI);
  }

  // ---------------------------------------------------------------- HUD
  const hud = { money: -1, hp: -1, time: -1, bounty: -1, heart: false, intensity: -1 };
  function refreshMana() {
    const v = Math.round(G.mana);
    if (v === hud.mana && G.exhausted === hud.exhausted) return;
    hud.mana = v; hud.exhausted = G.exhausted;
    $("mana").textContent = v;
    $("manabar").style.width = (G.mana / MANA.max) * 100 + "%";
    $("manaStat").classList.toggle("empty", G.exhausted);
  }
  function refreshHP() {
    const v = Math.round(G.hp * 10) / 10;
    $("hp").textContent = v % 1 ? v.toFixed(1) : v;
    const max = Math.max(25, G.hp);
    $("hpbar").style.width = clamp((G.hp / max) * 100, 0, 100) + "%";
    $("hpStat").classList.toggle("low", G.hp <= 5);
  }
  function buildSlots() {
    $("gunSlots").innerHTML = GUNS.slice(1).map((g) => `<div class="slot" data-gun="${g.slot}"><span class="k">${g.key}</span><div class="n">${g.name}</div><div class="s">${g.damage} dmg</div></div>`).join("");
    const gadgets = [["tnt", "Q", "TNT"], ["freeze", "E", "Freeze"], ["mine", "F", "Mines"], ["fortress", "7", "Fortress"], ["turret", "8", "Turret"], ["shield", "9", "Shield"]];
    gadgetEls = null;
    $("gadgetSlots").innerHTML = gadgets.map(([id, k, n]) => `<div class="slot" data-gadget="${id}"><span class="k">${k}</span><div class="n">${n}</div><div class="s"></div><i class="cd"></i></div>`).join("");
  }
  const dmgLabel = (s) => (GUNS[s].id === "sniper" || GUNS[s].id === "laser" ? "15 dmg" : GUNS[s].id === "shotgun" ? `7x${GUNS[s].damage * G.dmgMult} dmg` : `${GUNS[s].damage * G.dmgMult} dmg`);
  function refreshSlots() {
    document.querySelectorAll("#gunSlots .slot").forEach((el) => {
      const s = +el.dataset.gun, owned = gunOwned(s);
      el.classList.toggle("on", s === G.gun);
      el.classList.toggle("locked", !owned);
      el.classList.toggle("hidden", !owned); // only show what you own; the shop shows the rest
      el.querySelector(".s").textContent = owned ? dmgLabel(s) : `${SHOP.find((i) => i.id === GUNS[s].item).price}$`;
    });
  }
  function gadgetState(id) {
    if (!G.owned[id]) return { cls: "locked", txt: SHOP.find((i) => i.id === id).price + "$", frac: 0 };
    if (id === "freeze") return G.freezeCd > 0 ? { cls: "", txt: Math.ceil(G.freezeCd) + " s", frac: G.freezeCd / 10 } : { cls: "ready", txt: "ready", frac: 0 };
    if (id === "mine") return G.minesLeft > 0 ? { cls: "ready", txt: G.minesLeft + " left", frac: 0 } : { cls: "", txt: "next round", frac: 1 };
    if (id === "tnt") return G.tntCd > 0 ? { cls: "", txt: Math.ceil(G.tntCd) + " s", frac: G.tntCd / 3.5 } : { cls: "ready", txt: "ready", frac: 0 };
    if (id === "shield") {
      if (shield.mesh) return { cls: "active", txt: "up " + Math.ceil(shield.t) + " s", frac: 0 };
      return shield.cd > 0 ? { cls: "", txt: Math.ceil(shield.cd) + " s", frac: shield.cd / 12.5 } : { cls: "ready", txt: "ready", frac: 0 };
    }
    if (id === "turret") {
      if (turret.mesh) return { cls: "active", txt: turret.shots + " shots", frac: 0 };
      return turret.cd > 0 ? { cls: "", txt: Math.ceil(turret.cd) + " s", frac: turret.cd / 100 } : { cls: "ready", txt: "ready", frac: 0 };
    }
    if (id === "fortress") {
      if (fortress.mesh) return { cls: "active", txt: fortress.hp + " s", frac: 0 };
      return fortress.cd > 0 ? { cls: "", txt: Math.ceil(fortress.cd) + " s", frac: fortress.cd / 90 } : { cls: "ready", txt: "ready", frac: 0 };
    }
    return { cls: "", txt: "", frac: 0 };
  }
  let gadgetEls = null;
  function refreshGadgets() {
    if (!gadgetEls) gadgetEls = [...document.querySelectorAll("#gadgetSlots .slot")];
    let anyGadget = false;
    for (const el of gadgetEls) {
      const st = gadgetState(el.dataset.gadget);
      const owned = !!G.owned[el.dataset.gadget];
      anyGadget = anyGadget || owned;
      const cls = "slot " + st.cls + (owned ? "" : " hidden");
      if (el.className !== cls) el.className = cls;
      const s = el.querySelector(".s");
      if (s.textContent !== st.txt) s.textContent = st.txt;
      const hgt = Math.round(st.frac * 100) + "%";
      const cd = el.querySelector(".cd");
      if (cd.style.height !== hgt) cd.style.height = hgt;
    }
    if (anyGadget !== hud.anyGadget) { hud.anyGadget = anyGadget; $("gadgetSlots").classList.toggle("hidden", !anyGadget); }
  }
  function refreshExtras() {
    show("helmetPill", G.helmet > 0);
    $("helmetPips").innerHTML = [1, 2, 3, 4, 5].map((i) => `<b class="${i <= G.helmet ? "on" : ""}"></b>`).join("");
    show("minionPill", !!G.owned.minion);
    const regen = [];
    if (G.selfheal) regen.push("Self heal to 25");
    if (G.armored) regen.push("Armored to 50");
    if (G.moneyMult > 1) regen.push("2x money");
    show("regenPill", regen.length > 0);
    $("regenPill").textContent = regen.join(" · ");
  }
  const radar = $("radar").getContext("2d");
  function drawRadar() {
    // a north-up top-down view: basically the original Scratch stage
    const W = 216, H = 162, sx = W / ARENA_W, sz = H / ARENA_D;
    const X = (x) => (x + HX) * sx, Z = (z) => (z + HZ) * sz;
    radar.fillStyle = "#8f8f8f";
    radar.fillRect(0, 0, W, H);
    radar.fillStyle = "rgba(255,255,255,.75)";
    for (const d of decals) radar.fillRect(X(d.mesh.position.x) - 2, Z(d.mesh.position.z) - 2, 4, 4);
    for (const l of lasers) { radar.fillStyle = l.kind === "hurt" ? "#ff1a1a" : "#30ff60"; radar.fillRect(X(l.box.x) - 1.5, Z(l.box.z) - 2 * sz, 3, 4 * sz); }
    radar.fillStyle = "#ffe500";
    for (const g of golds) radar.fillRect(X(g.x) - 3, Z(g.z) - 3, 6, 6);
    radar.fillStyle = "#ec1c2c";
    for (const a of apples) radar.fillRect(X(a.x) - 2, Z(a.z) - 2, 4, 4);
    radar.fillStyle = "#000";
    const box = (b) => { radar.save(); radar.translate(X(b.x), Z(b.z)); radar.rotate(-b.ang); radar.fillRect(-b.hx * sx, -b.hz * sz, b.hx * 2 * sx, Math.max(2, b.hz * 2 * sz)); radar.restore(); };
    for (const w of walls) box(w.box);
    for (const s of fortress.segs) box(s);
    const zc = { 1: "#7bac00", 2: "#4d6b00", 3: "#9cda00", 4: "#5f8500", 5: "#00d9b1", 6: "#00876e", 7: "#ff8a00", 8: "#e8231a", 9: "#ffd400", 10: "#9aa3ad" };
    for (const e of zombies) {
      if (e.dying) continue;
      const s = e.type <= 2 ? 3 : e.type === 5 || e.type === 6 || e.type === 7 ? 6 : 4;
      radar.fillStyle = zc[e.type];
      radar.fillRect(X(e.x) - s / 2, Z(e.z) - s / 2, s, s);
    }
    for (const b of bosses) {
      if (b.dying) continue;
      radar.fillStyle = { snow: "#ffffff", wall: "#8ca2eb", flame: "#9e0000", glide: "#1bff20", king: "#ffe500" }[b.kind];
      radar.fillRect(X(b.x) - 6, Z(b.z) - 6, 12, 12);
      radar.strokeStyle = "#000"; radar.strokeRect(X(b.x) - 6, Z(b.z) - 6, 12, 12);
    }
    for (const p of projectiles) {
      if (p.def.team !== "e") continue;
      radar.fillStyle = p.kind === "eSnow" ? "#fff" : p.kind === "goo" ? "#6cff2a" : "#ff3a1a";
      radar.fillRect(X(p.pos.x) - 1.5, Z(p.pos.z) - 1.5, 3, 3);
    }
    if (bounty && bounty.visible) { radar.fillStyle = "#ff0000"; radar.fillRect(X(bounty.x) - 3, Z(bounty.z) - 3, 6, 6); }
    if (minion.alive) { radar.fillStyle = "#00fff9"; radar.fillRect(X(minion.mesh.position.x) - 3, Z(minion.mesh.position.z) - 3, 6, 6); }
    radar.fillStyle = "#3d4232";
    for (const m of mines) radar.fillRect(X(m.x) - 2, Z(m.z) - 2, 4, 4);
    radar.fillStyle = "#ff2020";
    for (const f of falling) radar.fillRect(X(f.x) - 3, Z(f.z) - 3, 6, 6);
    if (turret.mesh) { radar.fillStyle = "#111"; radar.fillRect(X(turret.mesh.position.x) - 3, Z(turret.mesh.position.z) - 3, 6, 6); }
    // player + view direction
    const px = X(P.pos.x), pz = Z(P.pos.z);
    const f = fwd(tmpV);
    radar.strokeStyle = "#d3ff66"; radar.lineWidth = 2;
    radar.beginPath(); radar.moveTo(px, pz); radar.lineTo(px + f.x * 12, pz + f.z * 12); radar.stroke();
    radar.fillStyle = "#d3ff66"; radar.fillRect(px - 4, pz - 4, 8, 8);
    radar.strokeStyle = "#000"; radar.lineWidth = 1; radar.strokeRect(px - 4, pz - 4, 8, 8);
  }
  function updateHUD(dt) {
    if (hud.money !== G.money) { hud.money = G.money; $("money").textContent = G.money; }
    if (hud.time !== G.time) { hud.time = G.time; $("time").textContent = G.time; }
    if (hud.bounty !== G.bountyTime) { hud.bounty = G.bountyTime; show("bountyStat", G.bountyTime > 0); $("bounty").textContent = G.bountyTime; }
    refreshGadgets();
    refreshMana();
    for (const b of bosses) if (b.bar) {
      const hp = Math.max(0, Math.ceil(b.hp));
      if (b.barHp === hp) continue;
      b.barHp = hp;
      b.bar.querySelector(".fill").style.width = clamp((b.hp / b.maxHp) * 100, 0, 100) + "%";
      b.bar.querySelector("small").textContent = hp + " / " + b.maxHp;
    }
    if (G.owned.minion) {
      $("minionBar").style.width = (minion.alive ? Math.max(0, minion.hp) : 0) + "%";
      $("minionTxt").textContent = minion.alive ? "" : "back in " + Math.ceil(minion.respawn) + " s";
    }
    const zc = zombies.filter((e) => !e.dying).length;
    if (zc !== hud.zc) { hud.zc = zc; $("zcount").textContent = zc + " zombies"; }
    const needClick = G.mode === "playing" && !locked;
    if (needClick !== hud.click) { hud.click = needClick; show("clickPrompt", needClick); }
    drawRadar();
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $("toast").classList.remove("on"); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $("banner").classList.remove("on"); }
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) $("hitmarker").classList.remove("on"); }
    hurtFx = Math.max(0, hurtFx - dt * 2.2);
    healFx = Math.max(0, healFx - dt * 1.5);
    frostFx = Math.max(0, frostFx - dt * 1.1);
    gooFx = Math.max(0, gooFx - dt * 0.6);
    $("goofx").style.opacity = gooFx * 0.7;
    const low = G.mode === "playing" && G.hp <= 4;
    $("vignette").style.opacity = Math.max(hurtFx * 0.9, low ? 0.35 + Math.sin(performance.now() / 180) * 0.12 : 0);
    $("healfx").style.opacity = healFx;
    $("frost").style.opacity = frostFx * 0.8;
    if (low !== hud.heart) { hud.heart = low; SFX.heartbeat(low); }
    const inten = bossAlive() ? 1 : Math.round(clamp(zombies.length / 40, 0, 0.5) * 10) / 10;
    if (inten !== hud.intensity) { hud.intensity = inten; SFX.setIntensity(inten); }
  }

  // ---------------------------------------------------------------- shop
  let shopPage = 1;
  const thumbs = {};
  let thumbsDone = false;
  function makeThumbs() {
    thumbsDone = true;
    try { renderThumbs(); } catch (e) { /* cards just show without pictures */ }
  }
  function renderThumbs() {
    // render each item's 3D model once into a little picture for its shop card
    const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    tr.setSize(224, 168);
    const ts = new THREE.Scene();
    ts.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(2, 3, 4); ts.add(sun);
    const tc = new THREE.PerspectiveCamera(30, 4 / 3, 0.01, 100);
    const make = {
      op: () => Models.gun("op"), tnt: () => Models.projectile("tnt"), heal: () => Models.apple(), mg: () => Models.gun("mg"),
      shield: () => Models.shield(), turret: () => Models.turret(), sniper: () => Models.gun("sniper"), fortress: () => Models.fortress(),
      snow: () => Models.gun("snow"), bounty: () => Models.boss("bounty"), minion: () => Models.minion(), helmet: () => Models.helmet(1),
      damage: () => { const g = new THREE.Group(); g.add(Models.gun("pistol")); const b = Models.projectile("bullet"); b.position.set(0.12, 0.05, 0.5); b.scale.setScalar(1.6); g.add(b); const c = b.clone(); c.position.x = -0.12; g.add(c); return g; },
      selfheal: () => Models.godApple(), armored: () => Models.player({ armored: true }),
      shotgun: () => Models.gun("shotgun"), laser: () => Models.gun("laser"), mine: () => Models.mine(),
      freeze: () => Models.projectile("freeze"), lucky: () => Models.luckyBlock(),
    };
    for (const it of SHOP) {
      try {
        const obj = make[it.id]();
        const spin = new THREE.Group(); spin.add(obj); ts.add(spin);
        const isGun = ["op", "mg", "sniper", "snow", "damage", "shotgun", "laser"].includes(it.id);
        spin.rotation.y = isGun ? -Math.PI / 2 + 0.35 : 0.6;
        spin.rotation.x = 0.12;
        spin.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(spin);
        const size = box.getSize(V3()), ctr = box.getCenter(V3());
        const rad = Math.max(size.x, size.y, size.z) * (isGun ? 0.48 : 0.62) + 0.01;
        tc.position.set(ctr.x, ctr.y + rad * 0.25, ctr.z + rad / Math.tan((tc.fov * Math.PI) / 360));
        tc.lookAt(ctr);
        tr.clear();
        tr.render(ts, tc);
        thumbs[it.id] = tr.domElement.toDataURL();
        ts.remove(spin);
        for (const m of obj.userData.mats || []) m.dispose();
      } catch (e) { thumbs[it.id] = ""; }
    }
    tr.dispose();
    if (tr.forceContextLoss) tr.forceContextLoss();
  }
  function isOwned(it) {
    if (it.repeat) return false;
    if (it.id === "helmet") return G.helmet >= 5;
    return !!G.owned[it.id];
  }
  function renderShop() {
    $("shopMoney").textContent = G.money + "$";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", +t.dataset.page === shopPage));
    $("shopGrid").innerHTML = SHOP.filter((i) => i.page === shopPage).map((it) => {
      const owned = isOwned(it), poor = !owned && G.money < it.price;
      return `<button class="item ${owned ? "owned" : ""} ${poor ? "poor" : ""}" data-id="${it.id}">
        ${thumbs[it.id] ? `<img class="thumb" src="${thumbs[it.id]}" alt="">` : `<span class="thumb"></span>`}
        <span><div class="price">${it.price}$</div><div class="iname">${it.name}</div><div class="idesc">${it.desc}</div></span>
        ${it.key ? `<span class="ikey"><kbd>${it.key}</kbd></span>` : ""}<span class="stamp">OWNED</span></button>`;
    }).join("");
  }
  function buy(id, el) {
    const it = SHOP.find((s) => s.id === id);
    if (isOwned(it)) return;
    if (it.id === "bounty" && G.bountyTime > 0) { $("shopMsg").textContent = "A bounty is already running"; SFX.play("deny"); return; }
    if (G.money < it.price) {
      $("shopMsg").textContent = "Not enough kills!!";
      SFX.play("deny");
      if (el) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
      return;
    }
    G.money -= it.price;
    SFX.play("buy");
    $("shopMsg").textContent = "";
    $("shopMsg").classList.remove("good");
    switch (id) {
      case "heal": G.hp += 1; refreshHP(); break;
      case "op": case "mg": case "sniper": case "snow": case "shotgun": case "laser": G.owned[id] = true; equip(GUNS.findIndex((g) => g && g.item === id)); break;
      case "mine": G.owned.mine = true; G.minesLeft = 3; break;
      case "lucky": luckyBlock(); break;
      case "bounty": G.bountyTime = 120; G.bountyAcc = 0; G.bountySpawnT = randInt(5, 15); break;
      case "helmet": G.helmet = 5; buildHelmet(); break;
      case "damage": G.owned.damage = true; G.dmgMult = 2; G.spawners += 1; break; // balance: the original added two more spawners
      case "selfheal": G.owned.selfheal = true; G.selfheal = true; G.spawners += 1; break; // ...and this one, one more
      case "armored": G.owned.armored = true; G.armored = true; buildPlayer(); break;
      default: G.owned[id] = true;
    }
    refreshSlots();
    refreshExtras();
    renderShop();
  }
  // Lucky block: roll for something good (or not)
  const LUCK = [
    [20, "+600$!", () => { G.money += 600; }],
    [18, "+10 HP!", () => { G.hp += 10; refreshHP(); }],
    [14, "3 golden apples are waiting for you!", () => { G.pendingApples += 3; }],
    [14, "Double money for 60 s!", () => { G.moneyMult = 2; G.moneyMultT = 60; }],
    [8, "Free helmet!", () => { G.helmet = 5; buildHelmet(); refreshExtras(); }],
    [23, "Bad luck... 6 zombies are waiting for you", () => { G.luckyZombies += 6; }],
    [3, "JACKPOT!!! +2000$", () => { G.money += 2000; }],
  ];
  function luckyBlock() {
    let r = Math.random() * LUCK.reduce((a, l) => a + l[0], 0);
    let pick = LUCK[0];
    for (const l of LUCK) { r -= l[0]; if (r <= 0) { pick = l; break; } }
    pick[2]();
    const bad = pick === LUCK[5];
    SFX.play(bad ? "deny" : "lucky");
    setTimeout(() => { $("shopMsg").textContent = "Lucky block: " + pick[1]; $("shopMsg").classList.toggle("good", !bad); }, 0);
  }

  $("shopGrid").addEventListener("click", (e) => { const b = e.target.closest(".item"); if (b) buy(b.dataset.id, b); });
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => { shopPage = +t.dataset.page; SFX.play("ui_click"); renderShop(); }));

  function openShop() {
    if (bossAlive()) { SFX.play("deny"); toast("Shop locked. Beat the boss first!"); return; }
    if (!thumbsDone) makeThumbs();
    G.mode = "shop";
    unlockPointer();
    mouse.fill(false);
    // "pause game": the horde, the bounty and every deployed gadget were wiped
    G.wave = false;
    clearZombies(false);
    removeBounty();
    for (const p of projectiles) killProjectile(p);
    projectiles = [];
    removeTurret(); turret.cd = 0;
    dropShield(); shield.cd = 0;
    removeFortress(); fortress.cd = 0;
    G.freezeCd = 0;
    clearMines();
    clearFalling();
    pendingSpawns = []; pendingBooms = [];
    clearWalls();
    $("shopMsg").textContent = "";
    shopPage = 1;
    renderShop();
    show("shop", true);
    SFX.play("shop_open");
  }
  function closeShop() {
    show("shop", false);
    SFX.play("shop_close");
    G.mode = "playing";
    const earned = G.round.t >= 20; // balance: no free +4 HP from opening and closing the shop over and over
    startWave(earned);
    if (!earned) toast("No +4 HP: the round was shorter than 20 s");
    roundReset(null);
    if (G.owned.minion && !minion.alive) spawnMinion();
    // Lucky block results
    for (; G.pendingApples > 0; G.pendingApples--) {
      const a = Math.random() * TAU;
      spawnApple(true);
      const ap = apples[apples.length - 1];
      ap.x = clamp(P.pos.x + Math.cos(a) * 3, -HX + 1, HX - 1); ap.z = clamp(P.pos.z + Math.sin(a) * 3, -HZ + 1, HZ - 1);
      ap.mesh.position.set(ap.x, 0.35, ap.z);
    }
    for (; G.luckyZombies > 0; G.luckyZombies--) { const s = randomSpot(6); spawnZombie(pickSpawnType(), s.x, s.z); }
    lockPointer();
  }
  $("closeShopBtn").addEventListener("click", closeShop);

  // ---------------------------------------------------------------- screens
  function openInfo() {
    G.prevMode = G.mode;
    G.mode = "info";
    unlockPointer();
    show("pause", false);
    show("info", true);
  }
  function closeInfo() {
    show("info", false);
    if (G.prevMode === "title") { G.mode = "title"; return; }
    G.mode = "playing";
    lockPointer();
  }
  $("closeInfoBtn").addEventListener("click", closeInfo);
  function pauseGame() {
    if (G.mode !== "playing") return;
    G.mode = "paused";
    mouse.fill(false);
    G.ads = 0;
    show("pause", true);
    syncSettingsUI();
  }
  function resume() { show("pause", false); G.mode = "playing"; lockPointer(); }
  function syncSettingsUI() {
    $("sens").value = settings.sens; $("sensV").textContent = (+settings.sens).toFixed(2);
    $("vol").value = settings.vol; $("volV").textContent = Math.round(settings.vol * 100);
    $("camBtn").textContent = settings.third ? "Third person" : "First person";
  }
  $("sens").addEventListener("input", (e) => { settings.sens = +e.target.value; saveSettings(); syncSettingsUI(); });
  $("vol").addEventListener("input", (e) => { settings.vol = +e.target.value; SFX.setMaster(settings.vol); saveSettings(); syncSettingsUI(); });
  $("camBtn").addEventListener("click", () => { toggleCamera(); syncSettingsUI(); });
  $("resumeBtn").addEventListener("click", resume);
  $("infoBtn").addEventListener("click", () => { G.mode = "paused"; show("pause", false); G.prevMode = "playing"; G.mode = "info"; show("info", true); });
  $("restartBtn").addEventListener("click", () => { show("pause", false); startGame(); });
  $("quitBtn").addEventListener("click", () => { show("pause", false); toTitle(); });
  function toggleCamera() {
    settings.third = !settings.third;
    saveSettings();
    equip(G.gun);
    toast(settings.third ? "Third person" : "First person", 1.2);
  }

  function gameOver() {
    if (G.mode === "dead") return;
    G.mode = "dead";
    G.deathT = 0;
    G.ads = 0;
    unlockPointer();
    mouse.fill(false);
    for (const p of projectiles) killProjectile(p);
    projectiles = [];
    pendingBooms = []; pendingSpawns = [];
    SFX.play("game_over");
    SFX.heartbeat(false);
    const newBest = G.time > best.time;
    best.time = Math.max(best.time, G.time);
    best.money = Math.max(best.money, G.money);
    try { localStorage.setItem("bw3d.best", JSON.stringify(best)); } catch (e) { /* ignore */ }
    $("oTime").textContent = G.time;
    $("oMoney").textContent = G.money;
    $("oKills").textContent = G.kills;
    $("oBest").textContent = newBest ? "New best time!" : `Best: ${best.time} s, ${best.money} money`;
    setTimeout(() => { if (G.mode === "dead") show("over", true); }, 900);
  }
  $("againBtn").addEventListener("click", () => { show("over", false); startGame(); });
  $("titleBtn").addEventListener("click", () => { show("over", false); toTitle(); });

  // ---------------------------------------------------------------- start / reset
  function wipeWorld() {
    clearZombies(false);
    for (const b of bosses) { disposeMesh(b.mesh); removeBossBar(b); }
    bosses = [];
    for (const p of projectiles) killProjectile(p);
    projectiles = [];
    clearWalls();
    for (const a of apples) disposeMesh(a.mesh);
    apples = [];
    for (const g of golds) disposeMesh(g.mesh);
    golds = [];
    clearDecals();
    removeBounty();
    removeTurret(); dropShield(); removeFortress();
    turret.cd = shield.cd = fortress.cd = 0;
    clearMines(); clearFalling();
    for (const b of beams) scene.remove(b.mesh);
    beams = []; pendingSpawns = []; pendingBooms = [];
    if (minion.mesh) scene.remove(minion.mesh);
    minion.alive = false; minion.respawn = 0;
  }
  function startGame() {
    SFX.init();
    SFX.setMaster(settings.vol);
    SFX.music(true);
    wipeWorld();
    Object.assign(G, {
      money: 500, hp: 14, time: 0, timeAcc: 0, kills: 0, owned: {}, gun: 1, dmgMult: 1, helmet: 0, armored: false, selfheal: false,
      spawners: 1, fireT: 0.3, tntCd: 0, regenSelf: 0, regenArmor: 0, bountyTime: 0, bountySpawnT: 0, wonShown: false, trauma: 0, recoil: 0, ads: 0,
      minesLeft: 0, freezeCd: 0, moneyMult: 1, moneyMultT: 0, bossKills: 0, kingDue: false, kingWarned: false, seenZ: {}, slowT: 0, luckyZombies: 0, pendingApples: 0,
    mana: 100, manaDelay: 0, exhausted: false, sprinting: false, sprintK: 0, hordeGrow: 0,
    });
    for (const k in G.cd) G.cd[k] = 0;
    P.pos.set(0, 0, 0); P.yaw = -Math.PI / 2; P.pitch = 0; P.knock.set(0, 0, 0);
    buildPlayer();
    equip(1);
    makeLasers();
    refreshHP(); refreshExtras();
    show("title", false); show("over", false); show("hud", true);
    G.mode = "playing";
    startWave(); // 14 + 4 = 18 health, like the original after the green flag
    roundReset(null);
    banner("BLOCK WAR", "Survive. Kills are money. B opens the shop.", 3.2);
    lockPointer();
  }
  function toTitle() {
    wipeWorld();
    unlockPointer();
    G.mode = "title";
    show("hud", false);
    show("title", true);
    SFX.heartbeat(false); hud.heart = false;
    SFX.setIntensity(0); hud.intensity = 0;
    $("bestLine").textContent = best.time ? `Best: survived ${best.time} s · ${best.money} money` : "";
    for (let i = 0; i < 10; i++) { const s = randomSpot(3, 3); const e = spawnZombie(pickZombieType(), s.x, s.z); e.emerge = 1; }
    if (!lasers.length) makeLasers();
    if (playerMesh) playerMesh.visible = false;
  }
  $("startBtn").addEventListener("click", startGame);
  // phones and tablets can't play it (no keyboard / mouse lock)
  try { if (window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches) show("touchNote", true); } catch (e) { /* ignore */ }

  // ---------------------------------------------------------------- main loop
  let last = performance.now(), titleT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
  }
  function update(dt) {
    const playing = G.mode === "playing";
    refreshSolids();
    if (playing) {
      updatePlayer(dt);
      updateCamera(dt); // before firing, so shots go where you're looking this frame
      tryFire(dt);
      updateSpawners(dt);
      updateRound(dt);
      updatePickupSpawners(dt);
      updateTurret(dt);
      updateFortress(dt);
      updateBounty(dt);
      updateMinion(dt);
      updateMines(dt);
      updateFalling(dt);
    }
    if (playing || G.mode === "title" || G.mode === "dead") flushPending(dt);
    if (playing || G.mode === "title" || G.mode === "dead") {
      updateZombies(dt);
      updateBosses(dt);
      updateProjectiles(dt);
      updateWalls(dt);
      updateApples(dt);
      updateGold();
      updateLasers(dt);
      updateParticles(dt);
      updateBeams(dt);
    }
    for (const d of decals) { if (playing) d.life -= dt; if (d.life < 4) d.mesh.scale.setScalar(Math.max(0.01, d.size * (d.life / 4))); if (d.life <= 0) d.dead = true; }
    if (decals.some((d) => d.dead)) { for (const d of decals) if (d.dead) scene.remove(d.mesh); decals = decals.filter((d) => !d.dead); }

    if (G.mode === "title") {
      titleT += dt * 0.06;
      camera.fov = 60; camera.updateProjectionMatrix();
      camera.position.set(Math.cos(titleT) * 30, 11, Math.sin(titleT) * 24);
      camera.lookAt(0, 1.5, 0);
    } else if (!playing) updateCamera(dt);
    if (G.mode !== "title") updateHUD(dt);
    updatePopups(dt);
  }
  function render() {
    renderer.clear();
    renderer.render(scene, camera);
    const scoped = G.gun === 4 && G.ads > 0.6;
    if (G.mode !== "title" && !settings.third && !scoped && G.mode !== "dead") {
      renderer.clearDepth();
      renderer.render(vmScene, camera);
    }
  }

  // debugging hook for automated checks (read-only use)
  window.__bw = { G, P, get zombies() { return zombies; }, get bosses() { return bosses; }, get walls() { return walls; }, get bounty() { return bounty; }, turret, minion, fortress, scene, camera, guns3p, gunsVM, get playerMesh() { return playerMesh; }, get projectiles() { return projectiles; }, get apples() { return apples; }, get golds() { return golds; }, lasers, spawnBoss, spawnZombie, startGame, openShop, closeShop, buy, roundReset,
    // advance the game without requestAnimationFrame (hidden tabs pause it)
    step(seconds, fps = 60) { const n = Math.round(seconds * fps); for (let i = 0; i < n; i++) update(1 / fps); render(); },
    test(on) { testMode = on !== false; },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down === false ? "keyup" : "keydown", { code })); },
    mouse };

  buildSlots();
  refreshSlots();
  $("loading").remove();
  toTitle();
  requestAnimationFrame(frame);
})();
