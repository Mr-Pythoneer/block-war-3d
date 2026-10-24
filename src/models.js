/* Block War 3D — model factories.
 *
 * Everything is built from one shared unit cube, scaled. Like the Scratch original, every
 * character is a coloured block with black square eyes.
 *
 * Conventions: meters; origin at the feet (y = 0 on the ground); models face +Z.
 * Creatures get their own materials (userData.mats) so the game can flash, tint or fade one
 * of them. Props and projectiles share cached materials.
 */
"use strict";
(function () {
  const T = THREE;
  const UNIT = new T.BoxGeometry(1, 1, 1);
  // shared round shapes (made once: creating them per projectile leaked GPU memory)
  const SNOW_GEO = new T.IcosahedronGeometry(0.24, 0);
  const BIG_SNOW_GEO = new T.IcosahedronGeometry(0.5, 1);
  const GOO_GEO = new T.IcosahedronGeometry(0.28, 0);
  const LASER_FLOOR_GEO = new T.PlaneGeometry(0.9, 4.4);
  const PI = Math.PI;

  // ---------------------------------------------------------------- materials
  const cache = new Map();
  function shared(hex, opts) {
    const o = opts || {};
    const key = hex + "|" + JSON.stringify(o);
    let m = cache.get(key);
    if (!m) {
      const p = Object.assign({ color: hex }, o);
      delete p.basic;
      m = o.basic ? new T.MeshBasicMaterial(p) : new T.MeshLambertMaterial(p);
      cache.set(key, m);
    }
    return m;
  }
  const glow = (hex, opacity) => shared(hex, { basic: true, transparent: true, opacity: opacity === undefined ? 0.6 : opacity, blending: T.AdditiveBlending, depthWrite: false, fog: true });

  // Per-creature palette: one material per colour, all listed in .list
  function palette() {
    const list = [], byKey = {};
    return {
      list,
      get(hex, emissive) {
        const k = hex + ":" + (emissive || 0);
        if (!byKey[k]) {
          const m = new T.MeshLambertMaterial({ color: hex, emissive: emissive || 0 });
          list.push(m);
          byKey[k] = m;
        }
        return byKey[k];
      },
    };
  }
  function shade(hex, k) {
    const c = new T.Color(hex);
    c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
    return c.getHex();
  }

  // ---------------------------------------------------------------- builders
  function box(parent, w, h, d, mat, x, y, z, shadow) {
    const m = new T.Mesh(UNIT, mat);
    m.scale.set(w, h, d);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = shadow !== false;
    parent.add(m);
    return m;
  }
  function pivot(parent, x, y, z) {
    const g = new T.Group();
    g.position.set(x || 0, y || 0, z || 0);
    parent.add(g);
    return g;
  }
  function marker(parent, x, y, z) {
    const o = new T.Object3D();
    o.position.set(x || 0, y || 0, z || 0);
    parent.add(o);
    return o;
  }

  /* A blocky humanoid. Returns the root group with the creature userData contract filled in;
   * extra details are added by the callers through userData.dims. */
  function humanoid(o) {
    const H = o.H, pal = o.pal;
    const legH = 0.42 * H, legW = 0.13 * H * (o.legK || 1);
    const tw = (o.wide || 0.3) * H, td = 0.17 * H * (o.deep || 1), th = 0.32 * H;
    const hs = 0.24 * H * (o.headK || 1), aw = 0.11 * H * (o.armK || 1), ah = 0.33 * H;
    const hipY = legH, neckY = hipY + th;
    const root = new T.Group();

    let legL, legR;
    if (o.noLegs) {
      legL = pivot(root, tw * 0.25, hipY, 0);
      legR = pivot(root, -tw * 0.25, hipY, 0);
    } else {
      legL = pivot(root, tw * 0.25, hipY, 0);
      legR = pivot(root, -tw * 0.25, hipY, 0);
      for (const leg of [legL, legR]) {
        box(leg, legW, legH * 0.82, legW * 1.05, pal.get(o.pants), 0, -legH * 0.41, 0);
        box(leg, legW * 1.1, legH * 0.18, legW * 1.3, pal.get(o.shoe), 0, -legH * 0.91, legW * 0.1);
      }
    }
    const body = pivot(root, 0, 0, 0);
    box(body, tw, th, td, pal.get(o.shirt), 0, hipY + th / 2, 0);
    const head = pivot(body, 0, neckY, 0);
    box(head, hs, hs, hs, pal.get(o.skin), 0, hs / 2, 0);
    const fz = hs / 2 + 0.006 * H;
    const eyeM = pal.get(o.eye === undefined ? 0x000000 : o.eye, o.eyeGlow || 0);
    const e = hs * 0.2;
    if (o.creepy) {
      box(head, e * 1.15, e * 1.25, 0.012 * H, eyeM, -hs * 0.22, hs * 0.55, fz, false);
      box(head, e * 0.85, e * 0.85, 0.012 * H, eyeM, hs * 0.22, hs * 0.62, fz, false);
    } else {
      box(head, e, e, 0.012 * H, eyeM, -hs * 0.22, hs * 0.6, fz, false);
      box(head, e, e, 0.012 * H, eyeM, hs * 0.22, hs * 0.6, fz, false);
    }
    if (o.mouth !== null) box(head, hs * (o.mouthW || 0.42), hs * (o.mouthH || 0.08), 0.012 * H, pal.get(o.mouth === undefined ? 0x000000 : o.mouth), o.mouthX || 0, hs * 0.27, fz, false);
    const headTop = marker(head, 0, hs, 0);

    const shY = neckY - 0.02 * H;
    const armL = pivot(body, tw / 2 + aw / 2, shY, 0); // facing +Z, the character's left is +X
    const armR = pivot(body, -(tw / 2 + aw / 2), shY, 0);
    for (const arm of [armL, armR]) {
      box(arm, aw, ah * 0.62, aw, pal.get(o.sleeve || o.shirt), 0, -ah * 0.31, 0);
      box(arm, aw * 0.94, ah * 0.38, aw * 0.94, pal.get(o.hand || o.skin), 0, -ah * 0.81, 0);
    }
    // hands are rotated so a child's +Z runs down the arm (a gun held in it points where the arm points)
    const handR = pivot(armR, 0, -ah, 0); handR.rotation.x = PI / 2;
    const handL = pivot(armL, 0, -ah, 0); handL.rotation.x = PI / 2;

    const armBase = o.armBase || 0;
    armL.rotation.x = armR.rotation.x = armBase;
    root.userData = {
      parts: { body, head, armL, armR, legL, legR },
      armBase, radius: o.radius, height: neckY + hs, mats: pal.list,
      headTop, handR, handL, muzzle: marker(handR, 0, 0, 0.08 * H),
      dims: { H, tw, td, th, hs, hipY, neckY, aw, ah, fz },
    };
    return root;
  }

  // ---------------------------------------------------------------- player
  function player(opts) {
    const armored = !!(opts && opts.armored);
    const pal = palette();
    const g = humanoid({
      H: 1.8, pal, radius: 0.4, skin: 0xd3ff66, shirt: armored ? 0x2b2b2b : 0x4b5a2a, sleeve: armored ? 0x1a1a1a : 0x55652f,
      pants: armored ? 0x1f1f1f : 0x3a3f2a, shoe: 0x141414, mouthW: 0.5, mouthH: 0.07,
    });
    const d = g.userData.dims, p = g.userData.parts;
    // belt + a pocket so the soldier reads from behind
    box(p.body, d.tw * 1.04, 0.06, d.td * 1.06, pal.get(armored ? 0x111111 : 0x2a2414), 0, d.hipY + 0.04, 0);
    if (armored) {
      const plate = pal.get(0x1a1a1a), plate2 = pal.get(0x333333);
      box(p.body, d.tw * 1.1, d.th * 0.72, 0.06, plate, 0, d.hipY + d.th * 0.55, d.td / 2 + 0.03);
      box(p.body, d.tw * 1.1, d.th * 0.72, 0.06, plate, 0, d.hipY + d.th * 0.55, -d.td / 2 - 0.03);
      box(p.armL, d.aw * 1.5, 0.12, d.aw * 1.5, plate2, 0, -0.03, 0);
      box(p.armR, d.aw * 1.5, 0.12, d.aw * 1.5, plate2, 0, -0.03, 0);
      box(p.legL, 0.16, 0.14, 0.06, plate2, 0, -0.38, 0.09);
      box(p.legR, 0.16, 0.14, 0.06, plate2, 0, -0.38, 0.09);
    } else {
      box(p.body, d.tw * 0.3, d.th * 0.25, 0.05, pal.get(0x3c4822), d.tw * 0.22, d.hipY + d.th * 0.6, d.td / 2 + 0.02);
    }
    return g;
  }

  // Helmet stage 1 (fresh) .. 5 (nearly shattered). Origin at its bottom-centre.
  // Open at the front like the original's black arch, so the face still shows.
  function helmet(stage, size) {
    const s = size || 0.43; // head width it fits
    const g = new T.Group();
    const black = shared(0x0d0d0d), dark = shared(0x1d1d1d), white = shared(0xf2f2f2);
    const W = s * 1.16, Hh = s * 0.74, t = s * 0.09;
    box(g, W, t * 1.4, W, black, 0, Hh - t * 0.7, 0); // top
    box(g, t, Hh, W, dark, -W / 2 + t / 2, Hh / 2, 0); // left
    box(g, t, Hh, W, dark, W / 2 - t / 2, Hh / 2, 0); // right
    box(g, W, Hh, t, dark, 0, Hh / 2, -W / 2 + t / 2); // back
    box(g, W, t * 1.6, t, black, 0, Hh - t * 1.2, W / 2 - t / 2); // front brim
    const st = Math.max(1, Math.min(5, stage | 0));
    const cracks = [
      [0.1, Hh - t * 0.1, 0.05, 0.22, 0.4],
      [-W / 2 - 0.005, Hh * 0.6, 0, 0.18, 1.1, "side"],
      [-0.12, Hh - t * 0.1, -0.1, 0.2, -0.7],
      [W / 2 + 0.005, Hh * 0.45, 0.05, 0.2, -1.0, "side"],
      [0.05, Hh * 0.55, -W / 2 - 0.005, 0.24, 0.9, "back"],
      [0.16, Hh - t * 0.1, -0.14, 0.18, 1.3],
      [-0.14, Hh * 0.35, -W / 2 - 0.005, 0.16, -0.5, "back"],
      [W / 2 + 0.005, Hh * 0.8, -0.12, 0.14, 0.4, "side"],
    ];
    const n = [0, 0, 2, 4, 6, 8][st];
    for (let i = 0; i < n; i++) {
      const [x, y, z, len, ang, face] = cracks[i];
      const c = new T.Mesh(UNIT, white);
      if (face === "side") { c.scale.set(0.012, 0.016, len); c.position.set(x, y, z); c.rotation.x = ang; }
      else if (face === "back") { c.scale.set(len, 0.016, 0.012); c.position.set(x, y, z); c.rotation.z = ang; }
      else { c.scale.set(len, 0.012, 0.016); c.position.set(x, y + 0.012, z); c.rotation.y = ang; }
      g.add(c);
    }
    return g;
  }

  // ---------------------------------------------------------------- zombies
  const ZCOL = { 1: 0x7bac00, 2: 0x7bac00, 3: 0x9cda00, 4: 0x9cda00, 5: 0x00d9b1, 6: 0x00d9b1 };
  function zombie(type) {
    if ((type | 0) >= 7) return newZombie(type | 0);
    const t = Math.max(1, Math.min(6, type | 0));
    const size = t <= 2 ? "mini" : t <= 4 ? "normal" : "big";
    const skin = ZCOL[t];
    const pal = palette();
    const spec = {
      mini: { H: 1.3, radius: 0.35, wide: 0.3, headK: 1.18, armK: 1 },
      normal: { H: 1.9, radius: 0.45, wide: 0.3, headK: 1, armK: 1 },
      big: { H: 2.8, radius: 0.7, wide: 0.4, headK: 0.9, armK: 1.35, legK: 1.25, deep: 1.25 },
    }[size];
    const shirt = { mini: 0x5a4a3a, normal: 0x4a5560, big: 0x5b3f33 }[size];
    const pants = { mini: 0x2f3a4a, normal: 0x3a3226, big: 0x2b2b30 }[size];
    const g = humanoid(Object.assign({
      pal, skin, shirt, sleeve: shade(shirt, 0.85), pants, shoe: 0x1b1712, hand: shade(skin, 0.9),
      creepy: true, mouth: 0x2a0808, mouthW: 0.36, mouthH: 0.1, mouthX: 0.02, armBase: -PI / 2,
    }, spec));
    const d = g.userData.dims, p = g.userData.parts, H = d.H;
    // torn clothes: skin showing through and a dark stain
    box(p.body, d.tw * 0.3, d.th * 0.28, 0.02, pal.get(shade(skin, 0.85)), -d.tw * 0.18, d.hipY + d.th * 0.35, d.td / 2 + 0.008, false);
    box(p.body, d.tw * 0.22, d.th * 0.2, 0.02, pal.get(0x3a1410), d.tw * 0.22, d.hipY + d.th * 0.72, d.td / 2 + 0.008, false);
    if (t === 2 || t === 4 || t === 6) {
      // black helmet (same shape as the player's), sat on the head
      const helm = pal.get(0x0d0d0d);
      const hs = d.hs;
      box(p.head, hs * 1.16, hs * 0.42, hs * 1.16, helm, 0, hs * 0.86, -hs * 0.01);
      box(p.head, hs * 1.2, hs * 0.08, hs * 0.22, helm, 0, hs * 0.66, hs * 0.5);
    } else {
      // a little hair tuft on bare heads
      box(p.head, d.hs * 0.5, d.hs * 0.1, d.hs * 0.5, pal.get(shade(skin, 0.6)), -d.hs * 0.12, d.hs * 1.04, -d.hs * 0.1, false);
    }
    g.userData.height = d.neckY + d.hs * (t % 2 === 0 ? 1.08 : 1);
    void H;
    return g;
  }

  // ---------------------------------------------------------------- bosses
  function flame(parent, x, y, z, s, pal, list) {
    const fg = pivot(parent, x, y, z);
    box(fg, s, s * 1.1, s, pal.get(0xf48d0d, 0xc94210), 0, s * 0.55, 0, false);
    box(fg, s * 0.6, s * 0.9, s * 0.6, pal.get(0xffdd78, 0xf48d0d), s * 0.05, s * 1.25, -s * 0.05, false);
    box(fg, s * 0.3, s * 0.5, s * 0.3, pal.get(0xfb0000, 0x9e0000), -s * 0.18, s * 1.75, s * 0.1, false);
    list.push(fg);
    return fg;
  }
  function icicle(parent, x, y, z, s, mat, tilt) {
    const ig = pivot(parent, x, y, z);
    ig.rotation.z = tilt || 0;
    box(ig, s, s * 1.2, s, mat, 0, s * 0.6, 0, false);
    box(ig, s * 0.65, s * 1.1, s * 0.65, mat, 0, s * 1.65, 0, false);
    box(ig, s * 0.3, s * 0.9, s * 0.3, mat, 0, s * 2.6, 0, false);
    return ig;
  }

  function boss(kind) {
    const pal = palette();
    let g;
    if (kind === "snow") {
      g = humanoid({ H: 3.2, pal, radius: 1.0, wide: 0.36, skin: 0xffffff, shirt: 0xdff4ff, sleeve: 0xcfeaff, pants: 0xb9dcf2, shoe: 0x8fbfe0, hand: 0xf0f9ff, mouth: 0x1a3048, mouthW: 0.5, armK: 1.2, legK: 1.15 });
      const d = g.userData.dims, p = g.userData.parts;
      const ice = pal.get(0xe8f8ff, 0x203848);
      icicle(p.head, -d.hs * 0.3, d.hs, 0, 0.13, ice, 0.15);
      icicle(p.head, 0.02, d.hs, -d.hs * 0.1, 0.16, ice, 0);
      icicle(p.head, d.hs * 0.32, d.hs, 0.02, 0.12, ice, -0.2);
      icicle(p.armL, 0, 0.02, 0, 0.14, ice, 0.35);
      icicle(p.armR, 0, 0.02, 0, 0.14, ice, -0.35);
      // frosted belly + a snowball in hand
      box(p.body, d.tw * 0.6, d.th * 0.45, 0.04, pal.get(0xa9d8f5), 0, d.hipY + d.th * 0.4, d.td / 2 + 0.02, false);
      box(g.userData.handR, 0.34, 0.34, 0.34, pal.get(0xffffff), 0, 0, 0.12);
    } else if (kind === "wall") {
      g = humanoid({ H: 5, pal, radius: 1.4, wide: 0.38, deep: 1.2, skin: 0x8ca2eb, shirt: 0x5f73b8, sleeve: 0x7085c8, pants: 0x4c5c99, shoe: 0x2e3866, hand: 0x8ca2eb, mouth: 0x000000, armK: 1.45, legK: 1.3 });
      const d = g.userData.dims, p = g.userData.parts;
      // bricks on the chest and back over the darker "mortar" torso
      const b1 = pal.get(0x8ca2eb), b2 = pal.get(0x9db0f0);
      const bw = d.tw * 0.46, bh = d.th * 0.28;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          const off = r % 2 ? bw * 0.25 : -bw * 0.25;
          const x = (c - 0.5) * (bw + 0.06) + off * 0.5;
          const y = d.hipY + bh * 0.6 + r * (bh + 0.06);
          box(p.body, bw, bh, 0.08, (r + c) % 2 ? b1 : b2, x, y, d.td / 2 + 0.03);
          box(p.body, bw, bh, 0.08, (r + c) % 2 ? b2 : b1, x, y, -d.td / 2 - 0.03);
        }
      }
      // heavy brow
      box(p.head, d.hs * 1.08, d.hs * 0.14, d.hs * 0.3, pal.get(0x5f73b8), 0, d.hs * 0.8, d.hs * 0.4);
      g.userData.muzzle = marker(p.body, 0, d.hipY + d.th * 0.6, d.td);
    } else if (kind === "flame") {
      g = humanoid({ H: 6, pal, radius: 1.7, wide: 0.36, deep: 1.1, skin: 0x9e0000, shirt: 0x6e0000, sleeve: 0x7e0a00, pants: 0x3a0a05, shoe: 0x1a0a05, hand: 0x9e0000, mouth: 0xffffff, mouthW: 0.56, mouthH: 0.12, armK: 1.4, legK: 1.3 });
      const d = g.userData.dims, p = g.userData.parts;
      const flames = [];
      flame(p.head, -d.hs * 0.28, d.hs, 0, 0.32, pal, flames);
      flame(p.head, d.hs * 0.05, d.hs, -d.hs * 0.15, 0.4, pal, flames);
      flame(p.head, d.hs * 0.3, d.hs, d.hs * 0.12, 0.28, pal, flames);
      flame(p.armL, 0, 0.05, 0, 0.36, pal, flames);
      flame(p.armR, 0, 0.05, 0, 0.36, pal, flames);
      // glowing cracks in the chest
      const ember = pal.get(0xf48d0d, 0xc94210);
      [[-0.22, 0.78, 0.5], [-0.1, 0.62, -0.6], [0.04, 0.47, 0.5], [0.17, 0.32, -0.5], [0.28, 0.2, 0.4]].forEach(([x, y, r]) => {
        const c = box(p.body, d.tw * 0.16, d.th * 0.06, 0.03, ember, d.tw * x, d.hipY + d.th * y, d.td / 2 + 0.015, false);
        c.rotation.z = r;
      });
      g.userData.flames = flames;
      g.userData.muzzle = marker(p.head, 0, d.hs * 0.27, d.hs * 0.6);
    } else if (kind === "glide") {
      g = humanoid({ H: 6, pal, radius: 1.7, wide: 0.36, skin: 0x1bff20, shirt: 0x12c016, sleeve: 0x16d01a, hand: 0x1bff20, mouth: 0x000000, armK: 1.3, noLegs: true });
      const d = g.userData.dims, p = g.userData.parts;
      // tail of shrinking blocks instead of legs (it hovers)
      const tailM = [pal.get(0x12c016), pal.get(0x0e9a12), pal.get(0x0a7a0d)];
      let y = d.hipY, w = d.tw * 0.9;
      for (let i = 0; i < 4; i++) {
        const h = d.hipY * 0.22;
        box(p.body, w, h, w * 0.6, tailM[Math.min(2, i)], 0, y - h / 2, -i * 0.12);
        y -= h;
        w *= 0.72;
      }
      const emitter = pal.get(0xff0000, 0xcc0000);
      box(p.head, d.hs * 0.22, d.hs * 0.16, 0.08, emitter, 0, d.hs * 0.86, d.fz, false);
      g.userData.muzzle = marker(p.head, 0, d.hs * 0.86, d.fz + 0.2);
    } else if (kind === "king") {
      // the Block King: a huge block zombie with a gold crown and a red robe
      g = humanoid({ H: 6.5, pal, radius: 2.0, wide: 0.42, deep: 1.2, headK: 1.15, skin: 0x2f8a36, shirt: 0xb3140e, sleeve: 0x8f0f09, pants: 0x5a0a06, shoe: 0x1a0a05, hand: 0x2f8a36, mouth: 0x000000, mouthW: 0.55, armK: 1.45, legK: 1.35 });
      const d = g.userData.dims, p = g.userData.parts;
      const gold = pal.get(0xffe500, 0x3a3000), gem = pal.get(0xff1a1a, 0x660000), white = pal.get(0xf4f4f4);
      const hs = d.hs;
      box(p.head, hs * 1.08, hs * 0.18, hs * 1.08, gold, 0, hs + hs * 0.09, 0); // crown band
      for (const [x, z] of [[-0.4, 0.4], [0, 0.4], [0.4, 0.4], [-0.4, -0.4], [0.4, -0.4], [0, -0.4], [-0.4, 0], [0.4, 0]]) box(p.head, hs * 0.18, hs * 0.26, hs * 0.18, gold, x * hs, hs + hs * 0.3, z * hs);
      box(p.head, hs * 0.16, hs * 0.16, 0.05, gem, 0, hs + hs * 0.09, hs * 0.55, false);
      // gold trim + white fur collar
      box(p.body, d.tw * 1.06, d.th * 0.1, d.td * 1.06, white, 0, d.hipY + d.th * 0.96, 0);
      box(p.body, d.tw * 0.12, d.th * 0.9, 0.04, gold, 0, d.hipY + d.th * 0.48, d.td / 2 + 0.02, false);
      box(p.body, d.tw * 1.04, d.th * 0.06, d.td * 1.04, gold, 0, d.hipY + 0.06, 0);
      // cape
      box(p.body, d.tw * 1.1, d.th + d.hipY * 0.8, 0.08, pal.get(0x8f0f09), 0, d.hipY + d.th / 2 - d.hipY * 0.38, -d.td / 2 - 0.06);
      g.userData.muzzle = marker(p.head, 0, hs * 0.5, hs);
    } else {
      // bounty: hooded outlaw with a target on the chest
      g = humanoid({ H: 1.9, pal, radius: 0.45, skin: 0x7bac00, shirt: 0x1d1d22, sleeve: 0x26262c, pants: 0x2a2a30, shoe: 0x111111, eye: 0xff0000, eyeGlow: 0xaa0000, mouth: 0x101010 });
      const d = g.userData.dims, p = g.userData.parts;
      const hood = pal.get(0x141418);
      box(p.head, d.hs * 1.18, d.hs * 0.18, d.hs * 1.18, hood, 0, d.hs * 1.02, -d.hs * 0.04);
      box(p.head, d.hs * 0.12, d.hs * 1.05, d.hs * 1.1, hood, -d.hs * 0.56, d.hs * 0.48, -d.hs * 0.06);
      box(p.head, d.hs * 0.12, d.hs * 1.05, d.hs * 1.1, hood, d.hs * 0.56, d.hs * 0.48, -d.hs * 0.06);
      box(p.head, d.hs * 1.18, d.hs * 1.05, d.hs * 0.14, hood, 0, d.hs * 0.48, -d.hs * 0.6);
      // cloak tail
      box(p.body, d.tw * 1.05, d.th + d.hipY * 0.55, 0.05, pal.get(0x18181c), 0, d.hipY + d.th / 2 - d.hipY * 0.27, -d.td / 2 - 0.03);
      // bullseye
      const zf = d.td / 2;
      box(p.body, d.tw * 0.52, d.tw * 0.52, 0.02, pal.get(0xff0000, 0x550000), 0, d.hipY + d.th * 0.55, zf + 0.01, false);
      box(p.body, d.tw * 0.34, d.tw * 0.34, 0.02, pal.get(0xffffff), 0, d.hipY + d.th * 0.55, zf + 0.02, false);
      box(p.body, d.tw * 0.16, d.tw * 0.16, 0.02, pal.get(0xff0000, 0x550000), 0, d.hipY + d.th * 0.55, zf + 0.03, false);
    }
    return g;
  }

  // ---------------------------------------------------------------- minion
  function minion() {
    const pal = palette();
    const g = new T.Group();
    const cyan = pal.get(0x00fff9), cyanD = pal.get(0x00b8b4), dark = pal.get(0x1c2a2a), black = pal.get(0x000000);
    const legL = pivot(g, -0.15, 0.32, 0), legR = pivot(g, 0.15, 0.32, 0);
    for (const l of [legL, legR]) { box(l, 0.14, 0.28, 0.16, dark, 0, -0.16, 0); box(l, 0.17, 0.06, 0.22, black, 0, -0.29, 0.03); }
    const body = pivot(g, 0, 0, 0);
    box(body, 0.66, 0.66, 0.6, cyan, 0, 0.32 + 0.33, 0);
    box(body, 0.13, 0.13, 0.02, black, -0.15, 0.78, 0.31, false);
    box(body, 0.13, 0.13, 0.02, black, 0.15, 0.78, 0.31, false);
    box(body, 0.3, 0.05, 0.02, black, 0, 0.58, 0.31, false);
    box(body, 0.5, 0.06, 0.62, cyanD, 0, 0.42, 0, false);
    const head = pivot(body, 0, 0.98, 0);
    box(head, 0.04, 0.2, 0.04, dark, 0, 0.1, 0, false);
    box(head, 0.09, 0.09, 0.09, pal.get(0x00fff9, 0x00a8a4), 0, 0.24, 0, false);
    const armL = pivot(body, 0.39, 0.86, 0), armR = pivot(body, -0.39, 0.86, 0);
    box(armL, 0.12, 0.32, 0.12, cyanD, 0, -0.16, 0);
    box(armR, 0.12, 0.2, 0.12, cyanD, 0, -0.1, 0);
    // arm cannon bolted to the body so it always points forward
    box(body, 0.15, 0.15, 0.48, dark, -0.47, 0.66, 0.16);
    box(body, 0.08, 0.08, 0.12, black, -0.47, 0.66, 0.44);
    g.userData = {
      parts: { body, head, armL, armR, legL, legR }, armBase: 0, radius: 0.4, height: 1.2, mats: pal.list,
      headTop: marker(head, 0, 0.3, 0), muzzle: marker(body, -0.47, 0.66, 0.52),
    };
    return g;
  }

  // ---------------------------------------------------------------- guns (barrel along +Z, origin at the grip)
  function gun(kind) {
    const g = new T.Group();
    const black = shared(0x26292e), steel = shared(0x3d4248), grip = shared(0x2e241b);
    let tip = 0.3;
    if (kind === "pistol") {
      box(g, 0.05, 0.13, 0.06, grip, 0, -0.05, -0.01, false);
      box(g, 0.06, 0.07, 0.27, black, 0, 0.035, 0.08, false);
      box(g, 0.035, 0.035, 0.05, steel, 0, 0.04, 0.235, false);
      box(g, 0.02, 0.02, 0.02, steel, 0, 0.08, 0.19, false);
      box(g, 0.012, 0.03, 0.18, shared(0x9cda00), 0.031, 0.035, 0.08, false); // lime stripe down the side
      tip = 0.26;
    } else if (kind === "mg") {
      const white = shared(0xe8e8e8);
      box(g, 0.05, 0.12, 0.06, grip, 0, -0.05, 0, false);
      box(g, 0.08, 0.1, 0.46, black, 0, 0.04, 0.16, false);
      box(g, 0.04, 0.04, 0.3, steel, 0, 0.05, 0.52, false);
      box(g, 0.085, 0.02, 0.2, white, 0, 0.095, 0.16, false);
      box(g, 0.12, 0.12, 0.12, steel, 0, -0.04, 0.24, false); // drum
      box(g, 0.06, 0.08, 0.16, black, 0, 0.02, -0.14, false); // stock
      box(g, 0.02, 0.04, 0.02, white, 0, 0.11, 0.6, false);
      tip = 0.68;
    } else if (kind === "op") {
      const red = shared(0xff0000, { emissive: 0x550000 });
      box(g, 0.05, 0.12, 0.06, grip, 0, -0.05, 0, false);
      box(g, 0.1, 0.11, 0.5, black, 0, 0.045, 0.18, false);
      box(g, 0.035, 0.035, 0.34, steel, -0.025, 0.06, 0.58, false);
      box(g, 0.035, 0.035, 0.34, steel, 0.025, 0.06, 0.58, false);
      box(g, 0.105, 0.025, 0.36, red, 0, 0.105, 0.18, false);
      box(g, 0.11, 0.03, 0.03, red, 0, 0.045, 0.43, false);
      box(g, 0.05, 0.16, 0.07, black, 0, -0.08, 0.2, false); // magazine
      box(g, 0.06, 0.08, 0.18, black, 0, 0.02, -0.15, false);
      tip = 0.76;
    } else if (kind === "sniper") {
      const cyan = shared(0x00dbf3, { emissive: 0x004a52 });
      box(g, 0.05, 0.12, 0.06, grip, 0, -0.05, 0, false);
      box(g, 0.07, 0.09, 0.44, black, 0, 0.04, 0.12, false);
      box(g, 0.03, 0.03, 0.62, steel, 0, 0.05, 0.64, false);
      box(g, 0.07, 0.07, 0.26, black, 0, 0.14, 0.12, false); // scope
      box(g, 0.075, 0.075, 0.02, cyan, 0, 0.14, 0.26, false);
      box(g, 0.075, 0.075, 0.02, cyan, 0, 0.14, -0.02, false);
      box(g, 0.075, 0.02, 0.44, cyan, 0, 0.09, 0.12, false);
      box(g, 0.06, 0.1, 0.24, grip, 0, 0.0, -0.2, false); // stock
      tip = 0.96;
    } else if (kind === "shotgun") {
      const wood = shared(0x6b4426), woodD = shared(0x4e3019);
      box(g, 0.055, 0.13, 0.07, woodD, 0, -0.05, -0.02, false);
      box(g, 0.08, 0.09, 0.22, black, 0, 0.04, 0.08, false);
      box(g, 0.035, 0.035, 0.5, steel, -0.02, 0.06, 0.44, false);
      box(g, 0.035, 0.035, 0.5, steel, 0.02, 0.06, 0.44, false);
      box(g, 0.07, 0.05, 0.26, wood, 0, 0.0, 0.36, false); // pump
      box(g, 0.065, 0.1, 0.22, wood, 0, 0.0, -0.18, false); // stock
      tip = 0.7;
    } else if (kind === "laser") {
      const red = shared(0xff2020, { emissive: 0xaa0000 }), white = shared(0xe9edf2);
      box(g, 0.05, 0.12, 0.06, grip, 0, -0.05, 0, false);
      box(g, 0.1, 0.1, 0.4, white, 0, 0.05, 0.14, false);
      box(g, 0.06, 0.06, 0.26, black, 0, 0.05, 0.46, false);
      for (let i = 0; i < 3; i++) box(g, 0.075, 0.075, 0.03, red, 0, 0.05, 0.38 + i * 0.07, false); // coils
      box(g, 0.105, 0.02, 0.3, red, 0, 0.105, 0.12, false);
      box(g, 0.04, 0.04, 0.04, shared(0xff6a5a, { basic: true }), 0, 0.05, 0.6, false);
      tip = 0.62;
    } else {
      // snow gun: chunky white blaster with a snowball hopper
      const white = shared(0xf4f8ff), ice = shared(0xbfe6ff), snow = shared(0xffffff, { emissive: 0x222a33 });
      box(g, 0.05, 0.12, 0.06, shared(0x9fb7c8), 0, -0.05, 0, false);
      box(g, 0.12, 0.12, 0.4, white, 0, 0.05, 0.14, false);
      box(g, 0.09, 0.09, 0.18, ice, 0, 0.05, 0.42, false);
      box(g, 0.16, 0.16, 0.16, ice, 0, 0.18, 0.1, false); // hopper
      box(g, 0.12, 0.08, 0.12, snow, 0, 0.29, 0.1, false);
      box(g, 0.13, 0.03, 0.05, ice, 0, 0.05, 0.53, false);
      tip = 0.56;
    }
    g.userData = { muzzle: marker(g, 0, kind === "sniper" ? 0.05 : 0.05, tip) };
    return g;
  }
  function muzzleFlash() {
    const g = new T.Group();
    box(g, 0.14, 0.14, 0.22, glow(0xffdd78, 0.95), 0, 0, 0.08, false);
    box(g, 0.24, 0.05, 0.05, glow(0xf48d0d, 0.85), 0, 0, 0.05, false);
    box(g, 0.05, 0.24, 0.05, glow(0xf48d0d, 0.85), 0, 0, 0.05, false);
    box(g, 0.08, 0.08, 0.34, glow(0xc94210, 0.6), 0, 0, 0.16, false);
    return g;
  }

  // ---------------------------------------------------------------- gadgets
  function turret() {
    const g = new T.Group();
    const dark = shared(0x1e2124), mid = shared(0x34383d), orange = shared(0xf48d0d, { emissive: 0x3a1a00 });
    for (let i = 0; i < 3; i++) {
      const leg = pivot(g, 0, 0.6, 0);
      leg.rotation.y = (i / 3) * PI * 2;
      const l = box(leg, 0.07, 0.75, 0.07, dark, 0, -0.3, 0.2);
      l.rotation.x = 0.55;
    }
    box(g, 0.32, 0.12, 0.32, mid, 0, 0.66, 0);
    const head = pivot(g, 0, 0.72, 0);
    box(head, 0.4, 0.3, 0.46, dark, 0, 0.17, 0);
    box(head, 0.41, 0.06, 0.2, orange, 0, 0.2, 0.05, false);
    box(head, 0.08, 0.08, 0.5, mid, 0, 0.18, 0.45);
    box(head, 0.12, 0.12, 0.08, dark, 0, 0.18, 0.7);
    const muzzle = marker(head, 0, 0.18, 0.78);
    g.userData = { parts: { head }, muzzle, radius: 0.45, height: 1.05 };
    return g;
  }

  // Half a hexagon of block walls. Apothem 2.8 m, concave side faces -Z (the player is near
  // the origin); segments are given in local space for the game's collision.
  function fortress() {
    const g = new T.Group();
    const mats = [shared(0x111111), shared(0x1b1b1b), shared(0x262626), shared(0x333333)];
    const accent = shared(0x55575a);
    const a = 2.8, L = (2 * a) / Math.sqrt(3), thick = 0.45, H = 2.2;
    const segments = [];
    let k = 0;
    for (const phi of [-PI / 3, 0, PI / 3]) {
      const sx = a * Math.sin(phi), sz = a * Math.cos(phi);
      const seg = pivot(g, sx, 0, sz);
      seg.rotation.y = phi;
      const rows = 3, cols = 4, bw = L / cols, bh = H / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const off = r % 2 ? bw * 0.5 : 0;
          let x = -L / 2 + bw / 2 + c * bw + off;
          let w = bw - 0.04;
          if (x + w / 2 > L / 2) { w = L / 2 - (x - w / 2); x = L / 2 - w / 2; }
          const m = (k++ * 7 + r) % 9 === 0 ? accent : mats[(c + r * 3 + k) % mats.length];
          box(seg, w, bh - 0.04, thick, m, x, bh / 2 + r * bh, 0);
        }
      }
      box(seg, 0.34, 0.26, thick + 0.06, accent, -L / 2 + 0.17, H + 0.1, 0); // corner cap
      segments.push({ x: sx, z: sz, len: L, thick, angle: phi });
    }
    g.userData = { segments, height: H };
    return g;
  }

  function shield() {
    const g = new T.Group();
    box(g, 2.4, 2.0, 0.08, glow(0x7fd8ff, 0.16), 0, 1.0, 0, false);
    const edge = glow(0xbff0ff, 0.6);
    box(g, 2.5, 0.07, 0.1, edge, 0, 2.0, 0, false);
    box(g, 2.5, 0.07, 0.1, edge, 0, 0.04, 0, false);
    box(g, 0.07, 2.0, 0.1, edge, -1.22, 1.0, 0, false);
    box(g, 0.07, 2.0, 0.1, edge, 1.22, 1.0, 0, false);
    box(g, 2.3, 0.03, 0.09, glow(0xbff0ff, 0.35), 0, 1.35, 0, false);
    box(g, 2.3, 0.03, 0.09, glow(0xbff0ff, 0.35), 0, 0.7, 0, false);
    return g;
  }

  // Wall Boss walls: long axis along local X.
  function wall(size) {
    const spec = { short: [3, 2.4, 0.5], middle: [5.5, 2.8, 0.7], large: [8.5, 3.2, 0.9] }[size] || [3, 2.4, 0.5];
    const [L, H, D] = spec;
    const pal = palette();
    const g = new T.Group();
    const base = pal.get(0x1a1a1c), mid = pal.get(0x242427), light = pal.get(0x34343a), moss = pal.get(0x23331c);
    box(g, L, H * 0.88, D, base, 0, H * 0.44, 0);
    // crooked top made of a few slabs
    const n = Math.max(2, Math.round(L / 1.6));
    for (let i = 0; i < n; i++) {
      const w = L / n;
      const h = H * (0.08 + ((i * 37) % 11) / 90);
      box(g, w - 0.05, h, D * 0.96, i % 2 ? mid : base, -L / 2 + w / 2 + i * w, H * 0.88 + h / 2, 0);
    }
    // lighter stones on both faces
    const stones = Math.round(L * 1.2);
    for (let i = 0; i < stones; i++) {
      const x = -L / 2 + 0.3 + ((i * 0.618) % 1) * (L - 0.6);
      const y = 0.3 + ((i * 0.37) % 1) * (H * 0.75);
      const side = i % 2 ? 1 : -1;
      box(g, 0.35 + (i % 3) * 0.1, 0.22 + (i % 2) * 0.08, 0.04, i % 5 === 0 ? moss : light, x, y, side * (D / 2 + 0.02), false);
    }
    g.userData = { halfLen: L / 2, halfThick: D / 2, height: H, mats: pal.list };
    return g;
  }

  // ---------------------------------------------------------------- pickups
  function gold(size) {
    const s = Math.max(1, Math.min(3, size | 0));
    const g = new T.Group();
    const ore = [shared(0xffe500, { emissive: 0x3a3000 }), shared(0xffd000, { emissive: 0x2a2200 }), shared(0xfff27a, { emissive: 0x403a10 })];
    const rock = [shared(0x6b6b6b), shared(0x55555a), shared(0x7a776f)];
    const width = [0.8, 1.5, 2.4][s - 1];
    const n = [5, 9, 14][s - 1];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, rr = (Math.sqrt(i + 0.5) / Math.sqrt(n)) * width * 0.42;
      const c = (0.22 + ((i * 13) % 7) * 0.035) * (0.75 + s * 0.25);
      const isOre = i % 3 !== 1;
      const m = box(g, c, c * (isOre ? 1 : 0.8), c, isOre ? ore[i % 3] : rock[i % 3], Math.cos(a) * rr, c * 0.45 + (i < 3 ? c * 0.4 : 0), Math.sin(a) * rr);
      m.rotation.y = a;
    }
    g.userData = { radius: width / 2, height: width * 0.6 };
    return g;
  }
  function appleShape(bodyMat, darkMat, stemMat, leafMat, hiMat) {
    const g = new T.Group();
    box(g, 0.46, 0.4, 0.46, bodyMat, 0, 0.22, 0);
    box(g, 0.36, 0.5, 0.36, bodyMat, 0, 0.27, 0);
    box(g, 0.3, 0.04, 0.3, darkMat, 0, 0.53, 0, false);
    box(g, 0.05, 0.14, 0.05, stemMat, 0, 0.6, 0, false);
    const leaf = box(g, 0.14, 0.03, 0.08, leafMat, 0.09, 0.62, 0, false);
    leaf.rotation.z = 0.4;
    box(g, 0.08, 0.1, 0.02, hiMat, -0.12, 0.34, 0.235, false);
    return g;
  }
  function apple() {
    const g = appleShape(shared(0xec1c2c), shared(0x9a0f1a), shared(0x99661d), shared(0x3fae2a), shared(0xffffff));
    g.userData = { radius: 0.3, height: 0.7 };
    return g;
  }
  function godApple() {
    const pal = palette();
    const g = appleShape(pal.get(0xffd84a, 0x6a5200), shared(0xb08a10), shared(0x99661d), pal.get(0xfff27a, 0x504000), shared(0xffffff));
    g.userData = { radius: 0.3, height: 0.7, mats: pal.list };
    return g;
  }

  // ---------------------------------------------------------------- laser walls (long axis along local Z, 4 m)
  function laserWall(color) {
    const g = new T.Group();
    const post = shared(0x15171a), cap = shared(color, { emissive: color });
    for (const z of [-2, 2]) {
      box(g, 0.22, 2.0, 0.22, post, 0, 1.0, z);
      box(g, 0.28, 0.12, 0.28, cap, 0, 2.06, z, false);
      box(g, 0.3, 0.1, 0.3, post, 0, 0.05, z);
    }
    box(g, 0.04, 1.8, 3.8, shared(color, { basic: true, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0, 1.0, 0, false);
    const beam = shared(color, { basic: true, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    for (const y of [0.4, 1.0, 1.6]) box(g, 0.06, 0.06, 3.8, beam, 0, y, 0, false);
    const floor = new T.Mesh(LASER_FLOOR_GEO, shared(color, { basic: true, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false }));
    floor.rotation.x = -PI / 2;
    floor.position.y = 0.03;
    g.add(floor);
    g.userData = { halfLen: 2, halfThick: 0.3 };
    return g;
  }

  // ---------------------------------------------------------------- projectiles (origin at centre)
  let tntTex = null, tntMat = null, qMat = null;
  function tntTexture() {
    if (tntTex || typeof document === "undefined") return tntTex;
    const c = document.createElement("canvas");
    c.width = 128; c.height = 64;
    const x = c.getContext("2d");
    if (!x) return null;
    x.fillStyle = "#f2f2f2"; x.fillRect(0, 0, 128, 64);
    x.fillStyle = "#111"; x.font = "bold 44px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("TNT", 64, 34);
    tntTex = new T.CanvasTexture(c);
    return tntTex;
  }
  function projectile(kind) {
    const g = new T.Group();
    const tracer = (w, l, hex) => box(g, w, w, l, shared(hex, { basic: true }), 0, 0, 0, false);
    switch (kind) {
      case "sniper": tracer(0.06, 1.6, 0xbff8ff); box(g, 0.16, 0.16, 1.2, glow(0x7fe8ff, 0.35), 0, 0, -0.1, false); break;
      case "turret": tracer(0.06, 0.6, 0xf48d0d); break;
      case "ai": tracer(0.05, 0.6, 0x00fff9); break;
      case "snowball": {
        const m = new T.Mesh(SNOW_GEO, shared(0xffffff, { emissive: 0x2a3038 }));
        g.add(m);
        break;
      }
      case "enemySnowball": {
        const m = new T.Mesh(BIG_SNOW_GEO, shared(0xf4fbff, { emissive: 0x202a36, flatShading: true }));
        m.castShadow = true;
        g.add(m);
        box(g, 0.5, 0.5, 0.5, shared(0xcfe8f8), 0.12, -0.12, 0.1, true);
        break;
      }
      case "fireball": {
        const c1 = shared(0xfb0000, { emissive: 0x9e0000 }), c2 = shared(0xf48d0d, { emissive: 0xc94210 }), c3 = shared(0xffdd78, { emissive: 0xf48d0d });
        box(g, 0.55, 0.55, 0.55, c1, 0, 0, 0, false).rotation.set(0.4, 0.3, 0);
        box(g, 0.42, 0.42, 0.42, c2, 0.12, 0.1, 0.15, false).rotation.set(0.1, 0.8, 0.3);
        box(g, 0.28, 0.28, 0.28, c3, -0.08, 0.05, 0.25, false);
        box(g, 0.9, 0.9, 0.9, glow(0xf48d0d, 0.25), 0, 0, 0, false);
        break;
      }
      case "bossLaser":
        tracer(0.15, 1.4, 0xff2a1a);
        box(g, 0.4, 0.4, 1.7, glow(0xff0000, 0.4), 0, 0, 0, false);
        break;
      case "pellet": tracer(0.04, 0.4, 0xffdd78); break;
      case "goo": {
        const m = new T.Mesh(GOO_GEO, shared(0x6cff2a, { emissive: 0x2a8a00, flatShading: true }));
        g.add(m);
        box(g, 0.5, 0.5, 0.5, glow(0x6cff2a, 0.25), 0, 0, 0, false);
        break;
      }
      case "freeze": {
        box(g, 0.34, 0.34, 0.34, shared(0x9fdcff, { emissive: 0x1a4a6a }), 0, 0, 0);
        box(g, 0.36, 0.08, 0.36, shared(0xffffff), 0, 0.05, 0, false);
        box(g, 0.06, 0.12, 0.06, shared(0x223344), 0, 0.22, 0, false);
        break;
      }
      case "tnt": {
        const tex = tntTexture();
        box(g, 0.45, 0.45, 0.45, shared(0xc8160e), 0, 0, 0);
        if (tex && !tntMat) tntMat = new T.MeshLambertMaterial({ map: tex });
        box(g, 0.47, 0.18, 0.47, tntMat || shared(0xf2f2f2), 0, 0.02, 0, false);
        box(g, 0.04, 0.16, 0.04, shared(0x111111), 0.08, 0.3, 0.05, false);
        box(g, 0.05, 0.05, 0.05, shared(0xffdd78, { basic: true }), 0.08, 0.39, 0.05, false);
        break;
      }
      default: tracer(0.05, 0.7, 0xffdd78);
    }
    return g;
  }

  // ---------------------------------------------------------------- the arena
  function environment(W, D) {
    const group = new T.Group();
    const HX = W / 2, HZ = D / 2;
    const rnd = mulberry(1234);

    // far ground fading into the fog
    const far = new T.Mesh(new T.PlaneGeometry(500, 500), shared(0x101a10));
    far.rotation.x = -PI / 2;
    far.position.y = -0.06;
    far.receiveShadow = true;
    group.add(far);

    // grass-block tiles: bright inside the fence, darker outside
    const TILE = 2, OUT = 14;
    const nx = Math.round((W + OUT * 2) / TILE), nz = Math.round((D + OUT * 2) / TILE);
    const tiles = new T.InstancedMesh(UNIT, new T.MeshLambertMaterial(), nx * nz);
    tiles.receiveShadow = true;
    const m4 = new T.Matrix4(), col = new T.Color();
    const inside = [0x3b5d2a, 0x456b30, 0x3f6430, 0x36552a, 0x41662d];
    const outside = [0x24361b, 0x2a3e1f, 0x203019, 0x2d2a1c];
    let i = 0;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const x = -HX - OUT + TILE / 2 + ix * TILE, z = -HZ - OUT + TILE / 2 + iz * TILE;
        const inArena = Math.abs(x) < HX && Math.abs(z) < HZ;
        const h = 0.2 + (inArena ? 0 : rnd() * 0.06);
        m4.makeScale(TILE, h, TILE);
        m4.setPosition(x, -h / 2, z);
        tiles.setMatrixAt(i, m4);
        let c = inArena ? inside[(rnd() * inside.length) | 0] : outside[(rnd() * outside.length) | 0];
        if (inArena && rnd() < 0.06) c = 0x4a3b28; // dirt patch
        tiles.setColorAt(i, col.setHex(c));
        i++;
      }
    }
    group.add(tiles);

    // fence exactly on the boundary: posts every 2 m, two rails, broken in places, some red planks
    const posts = [], rails = [];
    const addSide = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 2);
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if (k < n) posts.push([x, z, 1.25 + rnd() * 0.35, rnd() * 0.2 - 0.1]); // the next side adds the corner
        if (k < n) {
          const mx = x + (x1 - x0) / n / 2, mz = z + (z1 - z0) / n / 2, ang = Math.atan2(-(z1 - z0), x1 - x0);
          for (const y of [0.45, 0.95]) {
            const r = rnd();
            if (r < 0.1) continue; // missing plank
            rails.push([mx, y + (rnd() - 0.5) * 0.06, mz, ang + (r < 0.18 ? (rnd() - 0.5) * 0.5 : 0), r > 0.9]);
          }
        }
      }
    };
    addSide(-HX, -HZ, HX, -HZ); addSide(HX, -HZ, HX, HZ); addSide(HX, HZ, -HX, HZ); addSide(-HX, HZ, -HX, -HZ);
    const postMesh = new T.InstancedMesh(UNIT, new T.MeshLambertMaterial(), posts.length);
    postMesh.castShadow = true;
    const q = new T.Quaternion(), e = new T.Euler(), s3 = new T.Vector3(), p3 = new T.Vector3();
    posts.forEach(([x, z, h, tilt], k) => {
      q.setFromEuler(e.set(tilt * 0.3, 0, tilt));
      m4.compose(p3.set(x, h / 2, z), q, s3.set(0.24, h, 0.24));
      postMesh.setMatrixAt(k, m4);
      postMesh.setColorAt(k, col.setHex([0x4a3523, 0x3d2c1d, 0x55402a][k % 3]));
    });
    group.add(postMesh);
    const railMesh = new T.InstancedMesh(UNIT, new T.MeshLambertMaterial(), rails.length);
    railMesh.castShadow = true;
    rails.forEach(([x, y, z, ang, red], k) => {
      q.setFromEuler(e.set(0, ang, (rnd() - 0.5) * 0.06));
      m4.compose(p3.set(x, y, z), q, s3.set(2.02, 0.2, 0.08));
      railMesh.setMatrixAt(k, m4);
      railMesh.setColorAt(k, col.setHex(red ? 0x8a1a12 : [0x6b4c30, 0x5c4129, 0x73563a][k % 3]));
    });
    group.add(railMesh);

    // props outside the fence only
    const ring = (minOut, maxOut) => {
      for (;;) {
        const x = (rnd() * 2 - 1) * (HX + maxOut), z = (rnd() * 2 - 1) * (HZ + maxOut);
        const ox = Math.abs(x) - HX, oz = Math.abs(z) - HZ, out = Math.max(ox, oz);
        if (out > minOut && out < maxOut) return [x, z];
      }
    };
    const bark = shared(0x2b2118), bark2 = shared(0x3a2c20);
    for (let k = 0; k < 16; k++) {
      const [x, z] = ring(2, 12);
      const t = pivot(group, x, 0, z);
      t.rotation.y = rnd() * PI * 2;
      const h = 3 + rnd() * 3;
      box(t, 0.4, h, 0.4, bark, 0, h / 2, 0);
      for (let b = 0; b < 3; b++) {
        const br = pivot(t, 0, h * (0.5 + b * 0.18), 0);
        br.rotation.set(0, b * 2.1, 0.7 + rnd() * 0.4);
        box(br, 0.18, 1.2 + rnd(), 0.18, bark2, 0, 0.6, 0);
      }
    }
    const stone = [shared(0x5d6066), shared(0x4a4d52), shared(0x6c6f74)];
    for (let k = 0; k < 26; k++) {
      const [x, z] = ring(1.2, 9);
      const t = pivot(group, x, 0, z);
      t.rotation.set(0, (rnd() - 0.5) * 0.5 + (Math.abs(x) - HX > Math.abs(z) - HZ ? PI / 2 : 0), (rnd() - 0.5) * 0.2);
      const h = 0.8 + rnd() * 0.6;
      box(t, 0.7, h, 0.2, stone[k % 3], 0, h / 2, 0);
      if (k % 3 === 0) { box(t, 0.12, 0.6, 0.22, stone[(k + 1) % 3], 0, h + 0.15, 0); box(t, 0.45, 0.12, 0.22, stone[(k + 1) % 3], 0, h + 0.25, 0); }
    }
    const wood = shared(0x6b4c30), woodD = shared(0x4a3523);
    for (let k = 0; k < 9; k++) {
      const [x, z] = ring(1.5, 7);
      const s = 0.7 + rnd() * 0.5;
      const c = box(group, s, s, s, k % 2 ? wood : woodD, x, s / 2, z);
      c.rotation.y = rnd() * PI;
      if (rnd() < 0.5) { const c2 = box(group, s * 0.7, s * 0.7, s * 0.7, wood, x + 0.2, s + s * 0.35, z - 0.1); c2.rotation.y = rnd() * PI; }
    }
    const sand = [shared(0x8a7a55), shared(0x7a6b4a)];
    for (let k = 0; k < 6; k++) {
      const [x, z] = ring(1.2, 5);
      const t = pivot(group, x, 0, z);
      t.rotation.y = Math.abs(x) - HX > Math.abs(z) - HZ ? PI / 2 : 0;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) box(t, 0.6, 0.28, 0.4, sand[(r + c) % 2], (c - (3 - r) / 2) * 0.62, 0.14 + r * 0.28, 0);
    }
    // lamp posts with warm bulbs
    const lights = [];
    const lampSpots = [[-HX - 2.5, -HZ * 0.4], [HX + 2.5, HZ * 0.45]];
    for (const [x, z] of lampSpots) {
      const t = pivot(group, x, 0, z);
      box(t, 0.18, 4.4, 0.18, shared(0x1c1c1c), 0, 2.2, 0);
      box(t, 1.0, 0.12, 0.12, shared(0x1c1c1c), x < 0 ? 0.45 : -0.45, 4.35, 0);
      box(t, 0.3, 0.26, 0.3, shared(0xffd08a, { basic: true }), x < 0 ? 0.85 : -0.85, 4.15, 0, false);
      const pl = new T.PointLight(0xffb060, 1.4, 24, 2);
      pl.position.set(x + (x < 0 ? 0.85 : -0.85), 4.0, z);
      lights.push(pl);
    }

    // moonlight + sky
    const moon = new T.DirectionalLight(0xc4d2ff, 1.05);
    moon.position.set(-18, 34, 14);
    moon.target.position.set(0, 0, 0);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.03;
    lights.push(moon, new T.HemisphereLight(0x8098c8, 0x2a3a1e, 0.8));

    // a big pale moon in the sky
    const moonDisc = new T.Mesh(new T.CircleGeometry(9, 24), new T.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }));
    moonDisc.position.set(-90, 120, 70);
    moonDisc.lookAt(0, 0, 0);
    group.add(moonDisc);

    return { group, lights };
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }


  // ---------------------------------------------------------------- new zombies (types 7-10)
  //  7 Splitter: big orange block that breaks into three minis
  //  8 Boomer:   red, TNT strapped to its chest
  //  9 Spitter:  yellow, spits green goo from a distance
  // 10 Shield guy: grey, hides behind a black block shield
  function newZombie(t) {
    const pal = palette();
    const base = { pal, creepy: true, mouth: 0x2a0808, mouthW: 0.36, mouthH: 0.1, mouthX: 0.02, armBase: -PI / 2, shoe: 0x1b1712 };
    let g;
    if (t === 7) {
      g = humanoid(Object.assign(base, { H: 2.3, radius: 0.6, wide: 0.42, deep: 1.3, headK: 1.0, armK: 1.3, legK: 1.25, skin: 0xff8a00, shirt: 0xc46600, sleeve: 0xb05a00, pants: 0x6b3a10, hand: 0xff9a20 }));
      const d = g.userData.dims, p = g.userData.parts, crack = pal.get(0x3a1800);
      // dark seams showing where it will break apart
      box(p.body, 0.04, d.th * 1.02, d.td * 1.02, crack, 0, d.hipY + d.th / 2, 0, false);
      box(p.body, d.tw * 1.02, 0.04, d.td * 1.02, crack, 0, d.hipY + d.th * 0.55, 0, false);
      box(p.head, d.hs * 1.02, 0.03, d.hs * 1.02, crack, 0, d.hs * 0.4, 0, false);
      box(p.head, 0.03, d.hs * 1.02, d.hs * 1.02, crack, d.hs * 0.12, d.hs / 2, 0, false);
    } else if (t === 8) {
      g = humanoid(Object.assign(base, { H: 1.8, radius: 0.45, skin: 0xe8231a, shirt: 0x4a3a30, sleeve: 0x3e3028, pants: 0x2a2a2a, hand: 0xd01d15, mouth: 0x000000 }));
      const d = g.userData.dims, p = g.userData.parts;
      const tnt = box(p.body, d.tw * 0.75, d.th * 0.55, 0.22, pal.get(0xc8160e), 0, d.hipY + d.th * 0.5, d.td / 2 + 0.11);
      box(p.body, d.tw * 0.77, d.th * 0.16, 0.23, pal.get(0xf2f2f2), 0, d.hipY + d.th * 0.52, d.td / 2 + 0.11, false);
      box(p.body, 0.03, 0.18, 0.03, pal.get(0x111111), d.tw * 0.2, d.hipY + d.th * 0.86, d.td / 2 + 0.12, false);
      g.userData.fuse = box(p.body, 0.07, 0.07, 0.07, pal.get(0xffdd78, 0xffaa00), d.tw * 0.2, d.hipY + d.th * 0.97, d.td / 2 + 0.12, false);
      void tnt;
    } else if (t === 9) {
      g = humanoid(Object.assign(base, { H: 1.75, radius: 0.45, headK: 1.15, skin: 0xffd400, shirt: 0x5a5a2a, sleeve: 0x4e4e24, pants: 0x33331a, hand: 0xe6be00, mouth: 0x4cff1a, mouthW: 0.5, mouthH: 0.16 }));
      const d = g.userData.dims, p = g.userData.parts;
      const goo = pal.get(0x6cff2a, 0x2a8a00);
      box(p.head, d.hs * 0.55, d.hs * 0.22, d.hs * 0.2, goo, 0, d.hs * 0.12, d.hs * 0.48, false); // drool
      box(p.body, d.tw * 0.5, d.th * 0.4, 0.12, pal.get(0xd8c000), 0, d.hipY + d.th * 0.35, d.td / 2 + 0.05); // bloated belly
      g.userData.muzzle = marker(p.head, 0, d.hs * 0.27, d.hs * 0.7);
    } else {
      g = humanoid(Object.assign(base, { H: 1.95, radius: 0.5, wide: 0.33, skin: 0x9aa3ad, shirt: 0x3d444c, sleeve: 0x353b42, pants: 0x262a2f, hand: 0x8a939d }));
      const d = g.userData.dims, p = g.userData.parts;
      // the shield is bolted to the body so it always faces forward
      const sh = pivot(p.body, 0, 0, d.td / 2 + 0.42);
      box(sh, 1.05, 1.45, 0.12, pal.get(0x141414), 0, d.hipY + d.th * 0.45, 0);
      box(sh, 0.9, 0.08, 0.14, pal.get(0x3a3a3a), 0, d.hipY + d.th * 0.45 + 0.5, 0, false);
      box(sh, 0.9, 0.08, 0.14, pal.get(0x3a3a3a), 0, d.hipY + d.th * 0.45 - 0.5, 0, false);
      box(sh, 0.3, 0.12, 0.14, pal.get(0x6a6f75), 0, d.hipY + d.th * 0.45 + 0.25, 0, false); // view slit
      g.userData.shield = sh;
      // helmet
      box(p.head, d.hs * 1.16, d.hs * 0.42, d.hs * 1.16, pal.get(0x0d0d0d), 0, d.hs * 0.86, 0);
      g.userData.height = d.neckY + d.hs * 1.08;
    }
    return g;
  }

  // ---------------------------------------------------------------- new gadgets
  function mine() {
    const g = new T.Group();
    box(g, 0.6, 0.1, 0.6, shared(0x2b2f24), 0, 0.05, 0);
    box(g, 0.4, 0.06, 0.4, shared(0x3d4232), 0, 0.12, 0, false);
    const light = box(g, 0.1, 0.06, 0.1, shared(0xff2a1a, { basic: true }), 0, 0.17, 0, false);
    g.userData = { light, radius: 0.35 };
    return g;
  }
  let qTex = null;
  function luckyBlock() {
    const g = new T.Group();
    if (!qTex && typeof document !== "undefined") {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext && c.getContext("2d");
      if (x) {
        x.fillStyle = "#99ec00"; x.fillRect(0, 0, 64, 64);
        x.strokeStyle = "#4f7a00"; x.lineWidth = 6; x.strokeRect(3, 3, 58, 58);
        x.fillStyle = "#000"; x.font = "bold 46px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText("?", 32, 35);
        qTex = new T.CanvasTexture(c);
      }
    }
    if (qTex && !qMat) qMat = new T.MeshLambertMaterial({ map: qTex });
    box(g, 0.7, 0.7, 0.7, qMat || shared(0x99ec00), 0, 0.35, 0);
    return g;
  }
  // block dropped by the Block King (long axis X like walls)
  function rubble() {
    const pal = palette();
    const g = new T.Group();
    const c = [0x6b4c30, 0x5c4129, 0x4a3523][(Math.random() * 3) | 0];
    box(g, 1.4, 1.4, 1.4, pal.get(c), 0, 0.7, 0);
    box(g, 1.42, 0.12, 1.42, pal.get(shade(c, 0.6)), 0, 0.35, 0, false);
    box(g, 1.42, 0.12, 1.42, pal.get(shade(c, 0.6)), 0, 1.05, 0, false);
    g.userData = { halfLen: 0.7, halfThick: 0.7, height: 1.4, mats: pal.list };
    return g;
  }
  // unit-length beam along +Z (the game scales z to the beam length)
  function beam(color) {
    const g = new T.Group();
    box(g, 0.05, 0.05, 1, shared(0xffffff, { basic: true }), 0, 0, 0.5, false);
    box(g, 0.14, 0.14, 1, glow(color, 0.75), 0, 0, 0.5, false);
    box(g, 0.32, 0.32, 1, glow(color, 0.25), 0, 0, 0.5, false);
    return g;
  }

  window.Models = { player, helmet, zombie, boss, minion, gun, muzzleFlash, turret, fortress, shield, wall, gold, apple, godApple, laserWall, projectile, environment, mine, luckyBlock, rubble, beam };
})();
