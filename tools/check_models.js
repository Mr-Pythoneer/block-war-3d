// Headless check of src/models.js: every factory, every variant, the userData contract.
global.window = global;
global.THREE = require("../vendor/three.min.js");
global.document = { createElement: () => ({ getContext: () => null }) };
require("../src/models.js");
const M = window.Models;
const count = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh) n++; }); return n; };
const rows = [];
const fail = [];
const creature = (name, g, muzzle) => {
  const u = g.userData;
  for (const k of ["body", "head", "armL", "armR", "legL", "legR"]) if (!u.parts || !u.parts[k]) fail.push(`${name}: parts.${k}`);
  if (!(u.radius > 0) || !(u.height > 0)) fail.push(`${name}: radius/height`);
  if (!u.mats || !u.mats.length) fail.push(`${name}: mats`);
  if (!u.headTop) fail.push(`${name}: headTop`);
  if (muzzle && !u.muzzle) fail.push(`${name}: muzzle`);
};
const add = (name, g) => rows.push([name, count(g), g.userData.radius ? g.userData.radius.toFixed(2) : "", g.userData.height ? g.userData.height.toFixed(2) : ""]);
let g;
g = M.player({ armored: false }); creature("player", g); if (!g.userData.handR) fail.push("player handR"); add("player", g);
g = M.player({ armored: true }); creature("player armored", g); add("player armored", g);
for (let s = 1; s <= 5; s++) add("helmet " + s, M.helmet(s));
for (let t = 1; t <= 10; t++) { g = M.zombie(t); creature("zombie " + t, g); add("zombie " + t, g); }
for (const k of ["snow", "wall", "flame", "glide", "bounty", "king"]) { g = M.boss(k); creature("boss " + k, g, k !== "bounty"); add("boss " + k, g); }
if (!M.boss("flame").userData.flames.length) fail.push("flame flames");
g = M.minion(); creature("minion", g, true); add("minion", g);
for (const k of ["pistol", "mg", "op", "sniper", "snow", "shotgun", "laser"]) { g = M.gun(k); if (!g.userData.muzzle) fail.push("gun muzzle " + k); add("gun " + k, g); }
add("muzzleFlash", M.muzzleFlash());
g = M.turret(); if (!g.userData.parts.head || !g.userData.muzzle) fail.push("turret"); add("turret", g);
g = M.fortress(); if (g.userData.segments.length !== 3) fail.push("fortress segments"); add("fortress", g);
console.log("fortress segments", JSON.stringify(g.userData.segments.map((s) => ({ x: +s.x.toFixed(2), z: +s.z.toFixed(2), len: +s.len.toFixed(2), angle: +s.angle.toFixed(2) }))));
add("shield", M.shield());
for (const s of ["short", "middle", "large"]) { g = M.wall(s); if (!g.userData.halfLen || !g.userData.mats.length) fail.push("wall " + s); add("wall " + s, g); }
for (let s = 1; s <= 3; s++) add("gold " + s, M.gold(s));
add("apple", M.apple());
g = M.godApple(); if (!g.userData.mats.length) fail.push("godApple mats"); add("godApple", g);
add("laserWall", M.laserWall(0xff2020));
for (const k of ["bullet", "sniper", "turret", "ai", "snowball", "enemySnowball", "fireball", "bossLaser", "tnt", "pellet", "goo", "freeze"]) add("proj " + k, M.projectile(k));
add("mine", M.mine()); add("luckyBlock", M.luckyBlock()); g = M.rubble(); if (!g.userData.mats.length) fail.push("rubble mats"); add("rubble", g); add("beam", M.beam(0xff2020));
if (!M.zombie(8).userData.fuse) fail.push("boomer fuse"); if (!M.zombie(10).userData.shield) fail.push("shield guy shield"); if (!M.zombie(9).userData.muzzle) fail.push("spitter muzzle");
const env = M.environment(48, 36); add("environment", env.group);
console.log("env lights", env.lights.map((l) => l.type).join(", "));
console.table(rows.map(([n, m, r, h]) => ({ model: n, meshes: m, radius: r, height: h })));
if (fail.length) { console.error("FAIL", fail); process.exit(1); }
console.log("ALL OK");
