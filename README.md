# Block War 3D

A first-person 3D zombie remake of the Scratch game **Block War** (`Block war game 19.0.sb3`).
Same shop, prices, guns, bosses, timers and pickups. Now it's a night battlefield and the
blocks are zombies.

## Play
**Online:** https://mr-pythoneer.github.io/block-war-3d/ (needs a keyboard and mouse)

**Offline:** run `python3 tools/build.py`, then double-click `dist/block_war_3d.html`. It's one
self-contained file and needs no internet. (`docs/index.html` is the same page; GitHub Pages serves it.)
Click **START BATTLE**. The game grabs the mouse; press Esc to get it back.

| Key | Does |
|---|---|
| W A S D | move |
| Shift | sprint (uses mana, new) |
| Mouse | aim. Right-click aims down sights (sniper scope) |
| Click / Space | fire (hold for auto) |
| 1–5 / wheel | Pistol, Machine gun, OP gun, Sniper, Snow gun |
| 6 / 0 | Shotgun / Laser gun (new) |
| Q | TNT |
| E / F | Freeze bomb / Land mine (new) |
| 7 / 8 / 9 | Port a fortress / Turret / Shield |
| B | shop |
| I | info center |
| V | first / third person |
| M | mute |

## Files
| File | What it is |
|---|---|
| `src/game.js` | all the game logic. Every number is from the Scratch project unless a comment says `3D:` |
| `src/models.js` | the blocky 3D models (zombies, bosses, guns, arena, ...) |
| `src/audio.js` | all sound, generated in code (no audio files) |
| `src/index.html` | HUD, shop, menus |
| `vendor/three.min.js` | three.js r149 (3D engine) |
| `tools/build.py` | bundles everything into `dist/block_war_3d.html` and `docs/index.html` (the website) |
| `tools/check_models.js`, `tools/check_audio.js` | quick headless checks (`node tools/check_models.js`) |

Rebuild after editing: `python3 tools/build.py`.
While working on it, serve the folder (`python3 -m http.server 8777`) and open
`http://localhost:8777/src/index.html`.

## Kept from the original
- Money = kills (type 3 zombies pay 4, mini helmets 2, the rest 1; gold ore 100–250). Start with 500. 1000 = you win (keep playing).
- Six zombie types with the original lives and speeds, picked by the same random chain.
- Health 14 + 4 at the start. Every "Start wave" (closing the shop) gives +4.
- Damage cooldowns: zombies, fire balls and the Flame Boss 1 per second. Laser, boss laser and bounty every 1.5 s. Helmet halves damage.
- Bosses each round: Snow Boss at 35 s, Wall Boss at 100 s, Flame Boss at 200 s. Glide Boss only when a round starts at exactly 300–305 money. Beating any boss restarts the round. Flame and Glide clear the horde. The shop is locked during boss fights.
- Turret, sniper and TNT hit bosses ×5. Turret does 500 shots, 3° turn each, then 100 s cooldown. Shield lasts 5 s with a 12.5 s cooldown. Fortress holds 100 s with a warning at 5 s, then 150 s cooldown.
- Minion copies your trigger, has 100 HP and comes back after 25 s. Damage and Self heal make the horde bigger (extra spawners).
- Apples +1, golden apples +5. The red laser wall hurts you and shreds zombies; the second laser heals (+5/s).

## New stuff (not in the Scratch game)
**Sprint + mana**: hold Shift while moving to run at 11 m/s instead of 7. It burns 25 mana a
second (4 s from full). Mana starts refilling 0.8 s after you stop (16 a second). Run it dry and
you have to wait until it's back to 25 before you can sprint again. No aiming down sights while
sprinting. The numbers are in `MANA` at the top of `game.js`.

Shop **page 3**:
| Item | Price | What it does |
|---|---|---|
| Shotgun (6) | 1200$ | 7 bullets at once, 2 damage each |
| Laser gun (0) | 2500$ | instant red beam through every zombie in a line (15 each, like the Laser), bosses take 5x |
| Land mine (F) | 600$ | 3 mines every round, armed after 1 s, TNT-sized blast |
| Freeze bomb (E) | 1200$ | zombies within 5 m freeze for 4 s, bosses slow down; every 10 s |
| Lucky block | 300$ | could be anything: money, HP, golden apples, double money, recharged gadgets, a jackpot... or 6 zombies |

New zombies join the horde the longer you survive (from 20 s, 45 s, 90 s, 150 s):
| Zombie | Colour | Lives | Notes |
|---|---|---|---|
| Splitter | orange | 10 | breaks into 3 minis |
| Boomer | red | 6 | walks up to you and explodes (3 damage). Shooting it blows up the zombies around it |
| Spitter | yellow | 6 | keeps its distance, spits goo (1 damage + slow) |
| Shield guy | grey | 10 | blocks bullets from the front. Flank it, or use TNT, mines, sniper, laser gun |

**Block King**: beat 3 bosses and he shows up 20 s into the next round. 800–900 lives, calls up
minis, drops blocks where red squares appear (2 damage; the blocks stay as cover for 4 s). Pays 100–150.

## Balance changes (v3)
- **Bosses don't vanish** when you beat a different boss. The round timer still restarts, and a boss that's already out won't get a twin.
- **Boss rewards** were tiny next to one gold ore (100–250): Snow 15–20 → 60–80, Wall 30–40 → 120–150, Flame 50–60 → 200–250, Glide 50–60 → 250–300, Block King 100–150 → 400–500.
- **Bounty** pays 250 (it cost 150 and paid 100, so winning lost you money).
- **Machine gun** fires faster (it did 13 damage a second against the pistol's 12). **Shotgun** pellets 2 → 3.
- **Swarms hurt**: 1 a second for one zombie, +0.5 for each extra zombie on you (max 3).
- **Green laser** heals +2 a second, up to 30 HP (was +5 a second with no limit).
- **Shop heal**: closing the shop only gives +4 HP if the round lasted 20 s (open/close spam was free healing).
- **The horde grows**: +1 spawner at 3, 6 and 10 minutes survived.
- **Port a fortress** 7500$ → 4000$, cooldown 150 s → 90 s. **Damage** upgrade adds 1 extra spawner instead of 2. **Lucky block** 300$ → 400$, with fewer free helmets and jackpots and more bad luck.

## Changed for 3D (and why)
- **Speeds**: 1 Scratch px/tick = 1.4 m/s, so you move at 7 m/s and zombies keep their speed relative to you. The Wall, Flame and Glide bosses got faster; at the original speed they barely moved.
- **Zombies rise out of the ground** at least 8 m away instead of appearing on top of you.
- **TNT explodes** (4.5 m blast, 15 damage) instead of sliding through zombies in a straight line.
- **Second laser wall is green** so you can tell the healing one from the hurting one (both were red).
- **Bounty** takes every hit. The original only counted one hit per second, which made it impossible to kill before it left.
- **Damage enchant is ×2** as written on its card. In Scratch it doubled every frame forever, so it one-shot everything. If you liked that, change `G.dmgMult = 2` in `buy()`.
- **Helmet halving**: in Scratch, opening the shop once halved all damage for the rest of the game (the `helmet stuff` variable). Now only the helmet does that.
- After the Flame Boss dies, the horde comes back. In the original it stayed gone until you visited the shop.
- The info center is a plain pause; it doesn't reset the round.
