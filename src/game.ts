/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { Game, InitApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";
export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}
export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}
export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: C.RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}
export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}
export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}
export interface ShatterState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;
  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;
  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;
  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;
  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}
type R = DeepReadonly<ShatterState>;
type Rect = { x: number; y: number; w: number; h: number };
export interface ShatterDebugApi {
  readonly version: number;
  reset(s: R): ShatterState;
  snapshot(s: R): unknown;
  reconcile(s: R): ShatterState;
  menuItemRect(s: R, i: number): Rect | null;
  [key: string]: unknown;
}

export const BACKGROUND = "#07101f";
const TAU = Math.PI * 2,
  clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (v: number, n: number) => ((v % n) + n) % n,
  sep = (a: number, b: number, n: number) => wrap(a - b + n / 2, n) - n / 2;
const delta = (x: number, y: number, a: number, b: number) => ({
  x: sep(a, x, C.FIELD_W),
  y: sep(b, y, C.FIELD_H),
});
const distance = (x: number, y: number, a: number, b: number) => {
  const d = delta(x, y, a, b);
  return Math.hypot(d.x, d.y);
};
const collide = (
  x: number,
  y: number,
  r: number,
  a: { x: number; y: number },
  ar: number,
) => distance(x, y, a.x, a.y) <= r + ar;
const r = (s: C.RockSize) => C.ROCK_RADIUS[s];
function safeShip(): ShipState {
  return {
    x: C.SAFE_X,
    y: C.SAFE_Y,
    vx: 0,
    vy: 0,
    angle: C.FACE_UP,
    thrusting: false,
    invuln: 0,
    collision: true,
    fireCooldown: 0,
  };
}
function initial(): ShatterState {
  return {
    screen: "title",
    menuIndex: 0,
    score: 0,
    lives: C.START_LIVES,
    wave: 0,
    waveBanner: 0,
    ship: safeShip(),
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    waveSpawning: true,
    saucerSpawning: true,
    saucerClock: 0,
    saucerDue: C.SAUCER_FIRST_DELAY,
    nextSaucerEdge: null,
    nextSaucerRow: null,
    nextSaucerAim: null,
    nextRockSpeed: null,
    nextRecycleEdge: null,
    tickClock: 0,
    nextId: 1,
    simTime: 0,
    muted: false,
  };
}
function mv<T extends { x: number; y: number; vx: number; vy: number }>(
  b: T,
): T {
  return {
    ...b,
    x: wrap(b.x + b.vx * C.TICK_DT, C.FIELD_W),
    y: wrap(b.y + b.vy * C.TICK_DT, C.FIELD_H),
  };
}
function gravity<T extends { x: number; y: number; vx: number; vy: number }>(
  b: T,
): T {
  const dx = C.STAR_X - b.x,
    dy = C.STAR_Y - b.y,
    d = Math.hypot(dx, dy) || 1,
    a = C.MU / Math.max(d, C.SOFTEN) ** 2;
  return {
    ...b,
    vx: b.vx + (dx / d) * a * C.TICK_DT,
    vy: b.vy + (dy / d) * a * C.TICK_DT,
  };
}
function score(s: ShatterState, n: number): ShatterState {
  return {
    ...s,
    score: s.score + n,
    lives:
      s.lives +
      Math.floor((s.score + n) / C.EXTRA_LIFE_STEP) -
      Math.floor(s.score / C.EXTRA_LIFE_STEP),
  };
}
function rockScore(size: C.RockSize) {
  return size === "large"
    ? C.SCORE_LARGE
    : size === "medium"
      ? C.SCORE_MEDIUM
      : C.SCORE_SMALL;
}
function destroy(
  s: ShatterState,
  rock: RockState,
  angle: number,
  torpedo = false,
): ShatterState {
  const out = score(
    { ...s, rocks: s.rocks.filter((q) => q.id !== rock.id) },
    rockScore(rock.size),
  );
  const child = C.ROCK_CHILD[rock.size];
  if (!child) return out;
  const a = torpedo ? angle : angle + Math.PI / 2,
    k = torpedo ? C.TORPEDO_SCATTER : C.SPLIT_KICK;
  const kids = [1, -1].map((z, i) => ({
    id: out.nextId + i,
    x: rock.x,
    y: rock.y,
    vx: rock.vx + Math.cos(a) * k * z,
    vy: rock.vy + Math.sin(a) * k * z,
    size: child,
    spin: Math.random() * TAU,
    health: C.ROCK_HEALTH[child],
    flash: 0,
  }));
  return { ...out, rocks: [...out.rocks, ...kids], nextId: out.nextId + 2 };
}
function recycle(s: ShatterState, q: RockState): RockState {
  const e =
      s.nextRecycleEdge ??
      (["top", "bottom", "left", "right"] as FieldEdge[])[
        Math.floor(Math.random() * 4)
      ],
    speed =
      s.nextRockSpeed ??
      C.ROCK_SPEED_MIN[q.size] +
        Math.random() * (C.ROCK_SPEED_MAX[q.size] - C.ROCK_SPEED_MIN[q.size]);
  let x = Math.random() * C.FIELD_W,
    y = Math.random() * C.FIELD_H,
    a = 0;
  if (e === "top") {
    y = 0;
    a = Math.PI / 2;
  } else if (e === "bottom") {
    y = C.FIELD_H;
    a = -Math.PI / 2;
  } else if (e === "left") {
    x = 0;
  } else {
    x = C.FIELD_W;
    a = Math.PI;
  }
  return {
    ...q,
    x,
    y,
    vx: Math.cos(a + (Math.random() - 0.5)) * speed,
    vy: Math.sin(a + (Math.random() - 0.5)) * speed,
  };
}
function wave(s: ShatterState): ShatterState {
  const rocks: RockState[] = [];
  let id = s.nextId;
  for (let i = 0; i < C.WAVE_BASE_ROCKS + s.wave; i++) {
    let x = 0,
      y = 0;
    for (let n = 0; n < 100; n++) {
      x = Math.random() * C.FIELD_W;
      y = Math.random() * C.FIELD_H;
      if (
        distance(x, y, s.ship.x, s.ship.y) > C.WAVE_MIN_SHIP_DIST &&
        Math.hypot(x - C.STAR_X, y - C.STAR_Y) > C.WAVE_MIN_STAR_DIST
      )
        break;
    }
    const a = Math.random() * TAU,
      m = 1 + Math.min(C.WAVE_SPEED_CAP, C.WAVE_SPEED_STEP * (s.wave - 1)),
      v =
        (s.nextRockSpeed ??
          C.ROCK_SPEED_MIN.large +
            Math.random() * (C.ROCK_SPEED_MAX.large - C.ROCK_SPEED_MIN.large)) *
        m;
    rocks.push({
      id: id++,
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      size: "large",
      spin: Math.random() * TAU,
      health: C.ROCK_HEALTH.large,
      flash: 0,
    });
  }
  return {
    ...s,
    rocks: [...s.rocks, ...rocks],
    nextId: id,
    nextRockSpeed: null,
  };
}
type Keys = { l: boolean; ri: boolean; u: boolean; f: boolean; t: boolean };
function step(s0: ShatterState, k: Keys): ShatterState {
  let s = s0,
    sh = { ...s.ship };
  sh.angle += ((k.ri ? 1 : 0) - (k.l ? 1 : 0)) * C.SHIP_TURN * C.TICK_DT;
  sh.thrusting = k.u;
  if (k.u) {
    sh.vx += Math.cos(sh.angle) * C.SHIP_THRUST * C.TICK_DT;
    sh.vy += Math.sin(sh.angle) * C.SHIP_THRUST * C.TICK_DT;
  } else {
    const d = Math.pow(0.5, C.TICK_DT / C.SHIP_DRAG_HALFLIFE);
    sh.vx *= d;
    sh.vy *= d;
  }
  const speed = Math.hypot(sh.vx, sh.vy);
  if (speed > C.SHIP_MAX) {
    sh.vx *= C.SHIP_MAX / speed;
    sh.vy *= C.SHIP_MAX / speed;
  }
  sh = {
    ...mv(sh),
    invuln: Math.max(0, sh.invuln - C.TICK_DT),
    fireCooldown: Math.max(0, sh.fireCooldown - 1),
  };
  const bullets = s.bullets
    .map((x) => mv(gravity({ ...x, life: x.life - C.TICK_DT })))
    .filter((x) => x.life > 0);
  let enemies = s.enemyBullets
    .map((x) => mv(gravity({ ...x, life: x.life - C.TICK_DT })))
    .filter((x) => x.life > 0);
  const rocks = s.rocks
    .map((x) =>
      mv(
        gravity({
          ...x,
          spin: x.spin + 0.6 * C.TICK_DT,
          flash: Math.max(0, x.flash - C.TICK_DT),
        }),
      ),
    )
    .map((x) =>
      collide(x.x, x.y, r(x.size), { x: C.STAR_X, y: C.STAR_Y }, C.CORE_R)
        ? recycle(s, x)
        : x,
    );
  const torps = s.torpedoes
    .map((t) => {
      let h = t.heading;
      if (t.homing) {
        const targets = [...rocks, ...(s.saucer ? [s.saucer] : [])];
        let best: (typeof targets)[number] | undefined,
          bd = Infinity;
        for (const q of targets) {
          const d = delta(t.x, t.y, q.x, q.y),
            a = Math.atan2(d.y, d.x),
            turn = Math.atan2(Math.sin(a - h), Math.cos(a - h)),
            dd = Math.hypot(d.x, d.y);
          if (Math.abs(turn) <= C.TORPEDO_CONE && dd < bd) {
            best = q;
            bd = dd;
          }
        }
        if (best) {
          const d = delta(t.x, t.y, best.x, best.y),
            a = Math.atan2(d.y, d.x),
            turn = Math.atan2(Math.sin(a - h), Math.cos(a - h));
          h += clamp(
            turn,
            -C.TORPEDO_TURN * C.TICK_DT,
            C.TORPEDO_TURN * C.TICK_DT,
          );
        }
      }
      return mv({
        ...t,
        heading: h,
        vx: Math.cos(h) * C.TORPEDO_SPEED,
        vy: Math.sin(h) * C.TORPEDO_SPEED,
        life: t.life - C.TICK_DT,
      });
    })
    .filter((x) => x.life > 0);
  let saucer = s.saucer;
  if (saucer) {
    let q = {
      ...saucer,
      age: saucer.age + C.TICK_DT,
      fireClock: saucer.fireClock - C.TICK_DT,
      weaveClock: saucer.weaveClock - C.TICK_DT,
    };
    if (q.mind && q.weaveClock <= 0) {
      q.weaveClock += C.SAUCER_WEAVE_INTERVAL;
      q.vy = q.vy === 0 ? q.weave * C.SAUCER_WEAVE_SPEED : -q.vy;
    }
    if (q.mind && Math.hypot(q.x - C.STAR_X, q.y - C.STAR_Y) < 70)
      q.vy = q.y < C.STAR_Y ? -C.SAUCER_WEAVE_SPEED : C.SAUCER_WEAVE_SPEED;
    if (q.gun && q.fireClock <= 0) {
      q.fireClock += C.SAUCER_FIRE_INTERVAL;
      const a =
        Math.atan2(sh.y - q.y, sh.x - q.x) +
        (s.nextSaucerAim ?? (Math.random() * 2 - 1) * C.SAUCER_AIM_ERROR);
      enemies = [
        ...enemies,
        {
          id: s.nextId,
          x: q.x,
          y: q.y,
          vx: q.vx + Math.cos(a) * C.SAUCER_BULLET_SPEED,
          vy: q.vy + Math.sin(a) * C.SAUCER_BULLET_SPEED,
          life: C.SAUCER_BULLET_LIFE,
        },
      ];
      s = { ...s, nextId: s.nextId + 1, nextSaucerAim: null };
    }
    if (q.travel) q = mv(q);
    saucer = q.age >= C.SAUCER_LIFETIME ? null : q;
  }
  s = {
    ...s,
    ship: sh,
    rocks,
    bullets,
    enemyBullets: enemies,
    torpedoes: torps,
    saucer,
    simTime: s.simTime + C.TICK_DT,
    tickClock: s.tickClock + C.TICK_DT,
    torpedoCharge: clamp(
      s.torpedoCharge + C.TICK_DT / C.TORPEDO_RECHARGE,
      0,
      1,
    ),
  };
  if (k.f && sh.fireCooldown === 0 && s.bullets.length < C.MAX_BULLETS) {
    const x = sh.x + Math.cos(sh.angle) * C.SHIP_R,
      y = sh.y + Math.sin(sh.angle) * C.SHIP_R;
    s = {
      ...s,
      ship: { ...sh, fireCooldown: C.FIRE_INTERVAL_TICKS },
      bullets: [
        ...s.bullets,
        {
          id: s.nextId,
          x,
          y,
          vx: sh.vx + Math.cos(sh.angle) * C.MUZZLE_SPEED,
          vy: sh.vy + Math.sin(sh.angle) * C.MUZZLE_SPEED,
          life: C.BULLET_LIFE,
        },
      ],
      nextId: s.nextId + 1,
    };
  }
  if (k.t && s.torpedoCharge === 1 && !s.torpedoes.length) {
    const x = sh.x + Math.cos(sh.angle) * C.SHIP_R,
      y = sh.y + Math.sin(sh.angle) * C.SHIP_R;
    s = {
      ...s,
      torpedoCharge: 0,
      torpedoes: [
        {
          id: s.nextId,
          x,
          y,
          vx: Math.cos(sh.angle) * C.TORPEDO_SPEED,
          vy: Math.sin(sh.angle) * C.TORPEDO_SPEED,
          heading: sh.angle,
          life: C.TORPEDO_LIFE,
          homing: true,
        },
      ],
      nextId: s.nextId + 1,
    };
  }
  for (const b of [...s.bullets]) {
    if (collide(b.x, b.y, C.BULLET_R, { x: C.STAR_X, y: C.STAR_Y }, C.CORE_R)) {
      s = { ...s, bullets: s.bullets.filter((x) => x.id !== b.id) };
      continue;
    }
    const q = s.rocks.find((x) => collide(b.x, b.y, C.BULLET_R, x, r(x.size)));
    if (q) {
      s = { ...s, bullets: s.bullets.filter((x) => x.id !== b.id) };
      s =
        q.health > 1
          ? {
              ...s,
              rocks: s.rocks.map((x) =>
                x.id === q.id
                  ? { ...x, health: x.health - 1, flash: C.HIT_FLASH_TIME }
                  : x,
              ),
            }
          : destroy(s, q, Math.atan2(b.vy, b.vx));
    }
    if (s.saucer && collide(b.x, b.y, C.BULLET_R, s.saucer, C.SAUCER_R))
      s = score(
        { ...s, bullets: s.bullets.filter((x) => x.id !== b.id), saucer: null },
        C.SCORE_SAUCER,
      );
  }
  for (const t of [...s.torpedoes]) {
    const q = s.rocks.find((x) => collide(t.x, t.y, C.TORPEDO_R, x, r(x.size)));
    if (q)
      s = destroy(
        { ...s, torpedoes: s.torpedoes.filter((x) => x.id !== t.id) },
        q,
        t.heading,
        true,
      );
    else if (
      collide(t.x, t.y, C.TORPEDO_R, { x: C.STAR_X, y: C.STAR_Y }, C.CORE_R)
    )
      s = { ...s, torpedoes: s.torpedoes.filter((x) => x.id !== t.id) };
    else if (s.saucer && collide(t.x, t.y, C.TORPEDO_R, s.saucer, C.SAUCER_R))
      s = score(
        {
          ...s,
          torpedoes: s.torpedoes.filter((x) => x.id !== t.id),
          saucer: null,
        },
        C.SCORE_SAUCER,
      );
  }
  const d = Math.hypot(sh.x - C.STAR_X, sh.y - C.STAR_Y);
  if (d < C.CORE_R + C.SHIP_R) {
    const ux = (sh.x - C.STAR_X) / (d || 1),
      uy = (sh.y - C.STAR_Y) / (d || 1),
      into = sh.vx * ux + sh.vy * uy;
    s = {
      ...s,
      ship: {
        ...s.ship,
        x: C.STAR_X + ux * (C.CORE_R + C.SHIP_R),
        y: C.STAR_Y + uy * (C.CORE_R + C.SHIP_R),
        vx: into < 0 ? sh.vx - into * ux : sh.vx,
        vy: into < 0 ? sh.vy - into * uy : sh.vy,
      },
    };
  }
  const lethal =
    s.ship.collision &&
    !s.ship.invuln &&
    (s.rocks.some((x) => collide(s.ship.x, s.ship.y, C.SHIP_R, x, r(x.size))) ||
      (s.saucer &&
        collide(s.ship.x, s.ship.y, C.SHIP_R, s.saucer, C.SAUCER_R)) ||
      s.enemyBullets.some((x) =>
        collide(s.ship.x, s.ship.y, C.SHIP_R, x, C.SAUCER_BULLET_R),
      ));
  if (lethal) {
    const lives = s.lives - 1;
    s = {
      ...s,
      lives,
      ship: lives > 0 ? { ...safeShip(), invuln: C.INVULN_TIME } : s.ship,
      screen: lives > 0 ? s.screen : "gameover",
      torpedoes: lives > 0 ? [] : s.torpedoes,
      torpedoCharge: lives > 0 ? 1 : s.torpedoCharge,
    };
  }
  if (!s.saucer && s.saucerSpawning) {
    const clock = s.saucerClock + C.TICK_DT;
    if (clock >= s.saucerDue) {
      const edge = s.nextSaucerEdge ?? (Math.random() < 0.5 ? "left" : "right"),
        y =
          s.nextSaucerRow ??
          C.SAUCER_R + Math.random() * (C.FIELD_H - 2 * C.SAUCER_R);
      s = {
        ...s,
        saucer: {
          id: s.nextId,
          x: edge === "left" ? 0 : C.FIELD_W,
          y,
          vx: edge === "left" ? C.SAUCER_SPEED : -C.SAUCER_SPEED,
          vy: 0,
          mind: true,
          gun: true,
          travel: true,
          weave: Math.random() < 0.5 ? 1 : -1,
          fireClock: C.SAUCER_FIRE_INTERVAL,
          weaveClock: C.SAUCER_WEAVE_INTERVAL,
          age: 0,
        },
        nextId: s.nextId + 1,
        saucerClock: 0,
        nextSaucerEdge: null,
        nextSaucerRow: null,
      };
    } else s = { ...s, saucerClock: clock };
  }
  if (s.waveBanner > 0) {
    const b = Math.max(0, s.waveBanner - C.TICK_DT);
    s = { ...s, waveBanner: b };
    if (!b && s.waveSpawning) s = wave(s);
  } else if (s.waveSpawning && !s.rocks.length && s0.rocks.length)
    s = { ...s, wave: s.wave + 1, waveBanner: C.WAVE_BANNER_TIME };
  return s;
}

const menus = (s: R): readonly string[] =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
function rect(s: R, i: number): Rect | null {
  const m = menus(s);
  return i >= 0 && i < m.length
    ? { x: 500, y: 430 + i * 54, w: 280, h: 42 }
    : null;
}
function snap(s: R) {
  return {
    version: C.SHATTER_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    lives: s.lives,
    wave: s.wave,
    waveBanner: s.waveBanner,
    muted: s.muted,
    waveSpawning: s.waveSpawning,
    saucerSpawning: s.saucerSpawning,
    saucerClock: s.saucerClock,
    saucerDue: s.saucerDue,
    nextSaucerEdge: s.nextSaucerEdge,
    nextSaucerRow: s.nextSaucerRow,
    nextSaucerAim: s.nextSaucerAim,
    nextRockSpeed: s.nextRockSpeed,
    nextRecycleEdge: s.nextRecycleEdge,
    ship: { ...s.ship, speed: Math.hypot(s.ship.vx, s.ship.vy) },
    bullets: s.bullets.map((x) => ({ ...x })),
    rocks: s.rocks.map((x) => ({ ...x, radius: r(x.size) })),
    saucer: s.saucer ? { ...s.saucer } : null,
    enemyBullets: s.enemyBullets.map((x) => ({ ...x })),
    torpedoes: s.torpedoes.map((x) => ({ ...x })),
    torpedoCharge: s.torpedoCharge,
    torpedoReady: s.torpedoCharge === 1,
    simTime: s.simTime,
  };
}
function id(s: R, id: number) {
  if (!Number.isFinite(id))
    throw new Error("Shatter debug: finite id required");
}
const copy = (s: R): ShatterState => ({
  ...s,
  ship: { ...s.ship },
  bullets: [...s.bullets],
  rocks: [...s.rocks],
  enemyBullets: [...s.enemyBullets],
  torpedoes: [...s.torpedoes],
  saucer: s.saucer ? { ...s.saucer } : null,
});
const debug: ShatterDebugApi = {
  version: C.SHATTER_DEBUG_VERSION,
  reset: (s) => ({ ...initial(), muted: s.muted }),
  snapshot: (s) => snap(s),
  reconcile: (s) => copy(s),
  menuItemRect: rect,
  setScreen: (s, v) => ({ ...copy(s), screen: v }),
  setMenuIndex: (s, v) => ({ ...copy(s), menuIndex: v }),
  setScore: (s, v) => ({ ...copy(s), score: v }),
  setLives: (s, v) => ({ ...copy(s), lives: v }),
  setWave: (s, v) => ({ ...copy(s), wave: v }),
  setWaveBanner: (s, v) => ({ ...copy(s), waveBanner: v }),
  setWaveSpawning: (s, v) => ({ ...copy(s), waveSpawning: v }),
  setSaucerSpawning: (s, v) => ({ ...copy(s), saucerSpawning: v }),
  setSaucerDue: (s, v) => ({ ...copy(s), saucerDue: v }),
  setShipPosition: (s, x, y) => {
    finite(x, y);
    return { ...copy(s), ship: { ...s.ship, x, y } };
  },
  setShipVelocity: (s, x, y) => {
    finite(x, y);
    return { ...copy(s), ship: { ...s.ship, vx: x, vy: y } };
  },
  setShipAngle: (s, v) => {
    finite(v);
    return { ...copy(s), ship: { ...s.ship, angle: v } };
  },
  setShipInvuln: (s, v) => ({ ...copy(s), ship: { ...s.ship, invuln: v } }),
  setFireCooldown: (s, v) => ({
    ...copy(s),
    ship: { ...s.ship, fireCooldown: v },
  }),
  setShipCollision: (s, v) => ({
    ...copy(s),
    ship: { ...s.ship, collision: v },
  }),
  addBullet: (s, x, y, vx, vy) => {
    finite(x, y, vx, vy);
    return {
      ...copy(s),
      bullets: [
        ...s.bullets,
        { id: s.nextId, x, y, vx, vy, life: C.BULLET_LIFE },
      ],
      nextId: s.nextId + 1,
    };
  },
  removeBullet: (s, n) => {
    id(s, n);
    return { ...copy(s), bullets: s.bullets.filter((x) => x.id !== n) };
  },
  clearBullets: (s) => ({ ...copy(s), bullets: [] }),
  addEnemyBullet: (s, x, y, vx, vy) => ({
    ...copy(s),
    enemyBullets: [
      ...s.enemyBullets,
      { id: s.nextId, x, y, vx, vy, life: C.SAUCER_BULLET_LIFE },
    ],
    nextId: s.nextId + 1,
  }),
  removeEnemyBullet: (s, n) => ({
    ...copy(s),
    enemyBullets: s.enemyBullets.filter((x) => x.id !== n),
  }),
  clearEnemyBullets: (s) => ({ ...copy(s), enemyBullets: [] }),
  addRock: (s, size, x, y) => ({
    ...copy(s),
    rocks: [
      ...s.rocks,
      {
        id: s.nextId,
        x,
        y,
        vx: 0,
        vy: 0,
        size,
        spin: 0,
        health: C.ROCK_HEALTH[size],
        flash: 0,
      },
    ],
    nextId: s.nextId + 1,
  }),
  setRockVelocity: (s, n, vx, vy) => ({
    ...copy(s),
    rocks: s.rocks.map((x) => (x.id === n ? { ...x, vx, vy } : x)),
  }),
  setRockHealth: (s, n, health) => ({
    ...copy(s),
    rocks: s.rocks.map((x) => (x.id === n ? { ...x, health } : x)),
  }),
  removeRock: (s, n) => ({
    ...copy(s),
    rocks: s.rocks.filter((x) => x.id !== n),
  }),
  clearRocks: (s) => ({ ...copy(s), rocks: [] }),
  addSaucer: (s, x, y) => ({
    ...copy(s),
    saucer: {
      id: s.nextId,
      x,
      y,
      vx: C.SAUCER_SPEED,
      vy: 0,
      mind: true,
      gun: true,
      travel: true,
      weave: 1,
      fireClock: C.SAUCER_FIRE_INTERVAL,
      weaveClock: C.SAUCER_WEAVE_INTERVAL,
      age: 0,
    },
    nextId: s.nextId + 1,
  }),
  setSaucerVelocity: (s, vx, vy) => ({
    ...copy(s),
    saucer: s.saucer && { ...s.saucer, vx, vy },
  }),
  setSaucerWeave: (s, weave) => ({
    ...copy(s),
    saucer: s.saucer && { ...s.saucer, weave },
  }),
  removeSaucer: (s) => ({ ...copy(s), saucer: null }),
  setSaucerMind: (s, mind) => ({
    ...copy(s),
    saucer: s.saucer && { ...s.saucer, mind },
  }),
  setSaucerGun: (s, gun) => ({
    ...copy(s),
    saucer: s.saucer && { ...s.saucer, gun },
  }),
  setSaucerTravel: (s, travel) => ({
    ...copy(s),
    saucer: s.saucer && { ...s.saucer, travel },
  }),
  setNextSaucerEdge: (s, v) => ({ ...copy(s), nextSaucerEdge: v }),
  setNextSaucerRow: (s, v) => ({ ...copy(s), nextSaucerRow: v }),
  setNextSaucerAim: (s, v) => ({ ...copy(s), nextSaucerAim: v }),
  setNextRockSpeed: (s, v) => ({ ...copy(s), nextRockSpeed: v }),
  setNextRecycleEdge: (s, v) => ({ ...copy(s), nextRecycleEdge: v }),
  setTorpedoCharge: (s, v) => ({ ...copy(s), torpedoCharge: v }),
  addTorpedo: (s, x, y, heading) => ({
    ...copy(s),
    torpedoes: [
      ...s.torpedoes,
      {
        id: s.nextId,
        x,
        y,
        vx: Math.cos(heading) * C.TORPEDO_SPEED,
        vy: Math.sin(heading) * C.TORPEDO_SPEED,
        heading,
        life: C.TORPEDO_LIFE,
        homing: true,
      },
    ],
    nextId: s.nextId + 1,
  }),
  setTorpedoHeading: (s, n, heading) => ({
    ...copy(s),
    torpedoes: s.torpedoes.map((x) =>
      x.id === n
        ? {
            ...x,
            heading,
            vx: Math.cos(heading) * C.TORPEDO_SPEED,
            vy: Math.sin(heading) * C.TORPEDO_SPEED,
          }
        : x,
    ),
  }),
  setTorpedoHoming: (s, n, homing) => ({
    ...copy(s),
    torpedoes: s.torpedoes.map((x) => (x.id === n ? { ...x, homing } : x)),
  }),
  removeTorpedo: (s, n) => ({
    ...copy(s),
    torpedoes: s.torpedoes.filter((x) => x.id !== n),
  }),
  clearTorpedoes: (s) => ({ ...copy(s), torpedoes: [] }),
};
function finite(...v: number[]) {
  if (v.some((x) => !Number.isFinite(x)))
    throw new Error("Shatter debug: finite number required");
}
function menuAction(s: R): ShatterState {
  if (s.screen === "title")
    return s.menuIndex === 0
      ? {
          ...initial(),
          screen: "playing",
          wave: 1,
          waveBanner: C.WAVE_BANNER_TIME,
          muted: s.muted,
        }
      : { ...copy(s), screen: "howto" };
  if (s.screen === "paused")
    return s.menuIndex === 0
      ? { ...copy(s), screen: "playing" }
      : s.menuIndex === 1
        ? {
            ...initial(),
            screen: "playing",
            wave: 1,
            waveBanner: C.WAVE_BANNER_TIME,
            muted: s.muted,
          }
        : { ...copy(s), screen: "title", menuIndex: 0 };
  if (s.screen === "gameover")
    return s.menuIndex === 0
      ? {
          ...initial(),
          screen: "playing",
          wave: 1,
          waveBanner: C.WAVE_BANNER_TIME,
          muted: s.muted,
        }
      : { ...copy(s), screen: "title", menuIndex: 0 };
  return copy(s);
}

export const game: Game<ShatterState, ShatterDebugApi> = {
  initialize(api: InitApi<ShatterState>) {
    for (const a of C.ACTIONS) api.input.register(a, C.BINDINGS[a]);
    const tones = [
      [C.CUES.fire, 660],
      [C.CUES.shatter, 120],
      [C.CUES.thrust, 90],
      [C.CUES.saucer, 300],
      [C.CUES.death, 70],
      [C.CUES.extraLife, 880],
    ] as const;
    for (const [n, f] of tones)
      api.audio.define(n, {
        wave: "sawtooth",
        freq: f,
        freqTo: f / 2,
        durationMs: 120,
        gain: 0.12,
      });
    for (const [n, get] of [
      ["screen", (s: R) => s.screen],
      ["score", (s: R) => s.score],
      ["lives", (s: R) => s.lives],
      ["wave", (s: R) => s.wave],
      ["ship", (s: R) => `${s.ship.x.toFixed(0)},${s.ship.y.toFixed(0)}`],
      ["velocity", (s: R) => Math.hypot(s.ship.vx, s.ship.vy).toFixed(0)],
      ["rocks", (s: R) => s.rocks.length],
      ["torpedo", (s: R) => s.torpedoCharge.toFixed(2)],
      ["time", (s: R) => s.simTime.toFixed(1)],
    ] as const)
      api.diagnostics.register(n, get);
    return [initial(), debug];
  },
  update(state, api, dt) {
    let s = copy(state);
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    s = { ...s, muted: api.audio.muted() };
    if (
      s.screen === "howto" &&
      (api.input.pressed("confirm") || api.input.pressed("back"))
    )
      return { ...s, screen: "title", menuIndex: 1 };
    if (s.screen === "playing" && api.input.pressed("pause"))
      return { ...s, screen: "paused", menuIndex: 0 };
    if (
      s.screen === "paused" &&
      (api.input.pressed("pause") || api.input.pressed("back"))
    )
      return { ...s, screen: "playing" };
    if (s.screen === "gameover" && api.input.pressed("back"))
      return { ...s, screen: "title", menuIndex: 0 };
    if (s.screen !== "playing") {
      const m = menus(s);
      let i = s.menuIndex;
      if (api.input.pressed("up")) i = (i + m.length - 1) % m.length;
      if (api.input.pressed("down")) i = (i + 1) % m.length;
      const p = api.input.pointer();
      const found = m.findIndex((_, n) => {
        const z = rect(s, n);
        return (
          z !== null &&
          p.x >= z.x &&
          p.x <= z.x + z.w &&
          p.y >= z.y &&
          p.y <= z.y + z.h
        );
      });
      if (found >= 0) i = found;
      s = { ...s, menuIndex: i };
      if (
        api.input.pressed("confirm") ||
        (api.input.pointerPressed() && api.input.pointerReleased())
      )
        return menuAction(s);
      return s;
    }
    const k = {
      l: api.input.value("left") > 0,
      ri: api.input.value("right") > 0,
      u: api.input.value("up") > 0,
      f: api.input.value("a") > 0,
      t: api.input.pressed("b"),
    };
    let clock = s.tickClock + Math.min(dt, 0.25);
    while (clock >= C.TICK_DT) {
      clock -= C.TICK_DT;
      const before = s;
      s = step(s, k);
      if (
        k.f &&
        before.ship.fireCooldown === 0 &&
        before.bullets.length < C.MAX_BULLETS
      )
        api.audio.play(C.CUES.fire);
      if (s.rocks.length < before.rocks.length) api.audio.play(C.CUES.shatter);
      if (s.lives < before.lives) api.audio.play(C.CUES.death);
    }
    if (k.u) {
      if (!api.audio.looping(C.CUES.thrust)) api.audio.loop(C.CUES.thrust);
    } else api.audio.stop(C.CUES.thrust);
    return { ...s, tickClock: clock, muted: api.audio.muted() };
  },
  render(state, api) {
    const x = api.ctx;
    x.fillStyle = BACKGROUND;
    x.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
    for (let i = 0; i < 100; i++) {
      const px = (i * 97) % C.FIELD_W,
        py = (i * 53) % C.FIELD_H;
      x.fillStyle = "rgba(150,190,255,.22)";
      x.fillRect(px, py, 1, 1);
    }
    const g = x.createRadialGradient(
      C.STAR_X,
      C.STAR_Y,
      C.CORE_R,
      C.STAR_X,
      C.STAR_Y,
      C.HALO_R * 1.5,
    );
    g.addColorStop(0, "rgba(255,241,164,.7)");
    g.addColorStop(0.35, "rgba(255,139,65,.15)");
    g.addColorStop(1, "rgba(255,90,20,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(C.STAR_X, C.STAR_Y, C.HALO_R * 1.5, 0, TAU);
    x.fill();
    x.fillStyle = "#ffe9a1";
    x.beginPath();
    x.arc(C.STAR_X, C.STAR_Y, C.CORE_R, 0, TAU);
    x.fill();
    for (const q of state.rocks) {
      x.save();
      x.translate(q.x, q.y);
      x.rotate(q.spin);
      x.strokeStyle = q.flash ? "#fff" : "#d8a878";
      x.lineWidth = 3;
      x.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i * TAU) / 9,
          rr = r(q.size) * (i % 2 ? 0.8 : 1);
        if (i) x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      x.closePath();
      x.stroke();
      x.restore();
    }
    for (const b of [...state.bullets, ...state.enemyBullets]) {
      x.strokeStyle = "rgba(114,224,255,.4)";
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(b.x - b.vx * 0.07, b.y - b.vy * 0.07);
      x.lineTo(b.x, b.y);
      x.stroke();
      x.fillStyle = "#d9fbff";
      x.beginPath();
      x.arc(b.x, b.y, 3, 0, TAU);
      x.fill();
    }
    for (const t of state.torpedoes) {
      x.save();
      x.translate(t.x, t.y);
      x.rotate(t.heading);
      x.fillStyle = "#ff805a";
      x.fillRect(-9, -4, 18, 8);
      x.fillStyle = "#fff1ab";
      x.fillRect(2, -2, 8, 4);
      x.restore();
    }
    if (state.saucer) {
      const q = state.saucer;
      x.fillStyle = "#ad7cff";
      x.beginPath();
      x.ellipse(q.x, q.y, 23, 9, 0, 0, TAU);
      x.fill();
      x.fillStyle = "#e9ddff";
      x.fillRect(q.x - 9, q.y - 13, 18, 8);
    }
    const sh = state.ship;
    if (!sh.invuln || Math.floor(state.simTime * 10) % 2 === 0) {
      x.save();
      x.translate(sh.x, sh.y);
      x.rotate(sh.angle);
      if (sh.thrusting) {
        x.fillStyle = "#ff9850";
        x.beginPath();
        x.moveTo(-14, 0);
        x.lineTo(-29, -7);
        x.lineTo(-29, 7);
        x.fill();
      }
      x.strokeStyle = "#7df5ff";
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(19, 0);
      x.lineTo(-13, -11);
      x.lineTo(-8, 0);
      x.lineTo(-13, 11);
      x.closePath();
      x.stroke();
      x.restore();
    }
    if (state.screen === "playing") {
      x.fillStyle = "#eaf6ff";
      x.font = "bold 24px system-ui";
      x.fillText(`SCORE ${state.score}`, 34, 48);
      x.font = "16px system-ui";
      x.fillText(`WAVE ${state.wave}`, 34, 76);
      x.fillText(`TORPEDO ${Math.round(state.torpedoCharge * 100)}%`, 34, 104);
      if (state.waveBanner) {
        x.textAlign = "center";
        x.font = "bold 52px system-ui";
        x.fillStyle = "#fff4cb";
        x.fillText(`WAVE ${state.wave}`, 640, 350);
        x.textAlign = "left";
      }
    } else drawScreen(x, state);
  },
};
function drawScreen(x: CanvasRenderingContext2D, s: R) {
  x.fillStyle = "rgba(2,7,18,.72)";
  x.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  x.textAlign = "center";
  x.fillStyle = "#eaf6ff";
  if (s.screen === "title") {
    x.font = "bold 86px system-ui";
    x.fillText(C.TITLE_TEXT, 640, 235);
    x.font = "18px system-ui";
    x.fillStyle = "#7df5ff";
    x.fillText(C.TAGLINE_TEXT, 640, 275);
  } else if (s.screen === "howto") {
    x.font = "bold 42px system-ui";
    x.fillText("HOW TO PLAY", 640, 170);
    x.font = "20px system-ui";
    [
      "Break armored rocks into fragments.",
      "Bullets and rocks bend around the gravity well.",
      "F launches a guided torpedo — recharge: 10 seconds.",
      "ARROWS / WASD thrust & turn • SPACE fire • P pause • M mute",
      "ENTER or ESC returns",
    ].forEach((t, i) => x.fillText(t, 640, 250 + i * 42));
    x.textAlign = "left";
    return;
  } else {
    x.font = "bold 44px system-ui";
    x.fillText(s.screen === "paused" ? "PAUSED" : "GAME OVER", 640, 270);
    if (s.screen === "gameover") {
      x.font = "22px system-ui";
      x.fillText(`FINAL SCORE ${s.score} • WAVE ${s.wave}`, 640, 310);
    }
  }
  const m = menus(s);
  x.font = "bold 24px system-ui";
  m.forEach((v, i) => {
    const z = rect(s, i)!;
    x.fillStyle = i === s.menuIndex ? "#7df5ff" : "#dce8ff";
    x.fillText(`${i === s.menuIndex ? "› " : ""}${v}`, 640, z.y + 29);
  });
  x.textAlign = "left";
}
