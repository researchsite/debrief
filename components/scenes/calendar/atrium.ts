/**
 * Paints a static convention-center atrium in one-point perspective with
 * smooth vector shading: three tiers of balconies with glass railings, round
 * columns, lit storefronts and sponsor booths, a skylight ceiling, a polished
 * wood concourse with light pools, hanging banners, a glowing end-of-hall sign
 * and a dense seeded crowd of soft stylized figures. The schedule board hangs
 * from a truss at a computed depth; the floor beneath it is kept clear.
 *
 * Deterministic: the same size and board rectangle always yield the same
 * picture (fixed-seed PRNG, no clock or Math.random).
 */

type RGB = [number, number, number];

export interface BoardRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AtriumOptions {
  /** Wide (landscape/desktop) composition versus the portrait phone one. */
  wide: boolean;
  /** Board rectangle in canvas CSS pixels; the truss, cables and clearing are fitted to it. */
  board: BoardRect | null;
  /** CSS font-family list for painted signage. */
  font: string;
}

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [20, 14, 40];
const lighten = (c: RGB, t: number) => mix(c, WHITE, t);
const darken = (c: RGB, t: number) => mix(c, BLACK, t);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const C = {
  haze: hex('#efe4e6'),
  sky: hex('#eef6fc'),
  skyDeep: hex('#cfe2f2'),
  beam: hex('#ddd3e6'),
  wall: hex('#5b4e94'),
  wallDark: hex('#3e3470'),
  shop: hex('#ffe3a6'),
  shopWarm: hex('#ffc977'),
  slab: hex('#f7efe3'),
  slabShade: hex('#d8c9b6'),
  soffit: hex('#d9cfe2'),
  balconyFloor: hex('#e9dccb'),
  column: hex('#f5ecdc'),
  columnShade: hex('#bfae9a'),
  rail: hex('#dfe6ec'),
  glass: hex('#cdeef2'),
  floorNear: hex('#a46d42'),
  floorFar: hex('#d6ae7f'),
  stone: hex('#e8dccb'),
  endWall: hex('#3a2f6e'),
  endWallLow: hex('#2a2350'),
  rug: hex('#4a3d86'),
  sun: hex('#ffd23f'),
  steel: hex('#cfd2df'),
  steelDark: hex('#7c7f95'),
};

const BOOTH = ['#8b5cf6', '#ff7ab6', '#22c3b5', '#ffd23f', '#3b82f6', '#ff8c42'].map(hex);

const LEVELS = [0, 5, 10, 15];
const TOP = 21;
const SLAB = 0.6;
const BAY = 9;
const DEPTH = 4;
const CAM_H = 9;
const PERSON_H = 1.75;
/** World height of the board's bottom edge on the wide layout: well above the crowd's heads. */
const BOARD_BOTTOM_H = 3.6;

type Pt = readonly [number, number];

export function paintAtrium(ctx: CanvasRenderingContext2D, W: number, H: number, opts: AtriumOptions) {
  const { wide, board, font } = opts;
  const rng = mulberry32(0x5eed2026);

  /* ---------- Camera ---------- */
  const f = W * (wide ? 1 : 1.05);
  const Wf = wide ? 26 : 9.5;
  const cy = H * (wide ? 0.4 : 0.585);
  // Wide: the vanishing point (and the DEVCONF sign drawn there) sits beside the board, on whichever side is open.
  const signSize = Math.max(9, Math.min(W * 0.022, 22));
  const signGap = signSize * 5.4 + 28;
  const boardOnLeft = !!board && (board.left + board.right) / 2 < W / 2;
  const cx =
    wide && board
      ? boardOnLeft
        ? Math.max(W * 0.5, board.right + signGap)
        : Math.min(W * 0.5, board.left - signGap)
      : W * 0.5;
  const zFar = wide ? 250 : 120;
  const zStart = 1.2;
  const P = (x: number, y: number, z: number): Pt => [cx + (f * x) / z, cy - (f * (y - CAM_H)) / z];
  const fog = (z: number) => 0.62 * Math.pow(clamp01((z - 8) / (zFar - 8)), 0.55);
  const XO = Wf + DEPTH;

  const poly = (pts: readonly Pt[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  const quadX = (x: number, y0: number, y1: number, z0: number, z1: number) =>
    poly([P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)]);
  const quadY = (y: number, x0: number, x1: number, z0: number, z1: number) =>
    poly([P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)]);
  const vGrad = (y0: number, y1: number, stops: [number, string][]) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  };

  /* ---------- Board placement: depth, truss and the clearing below ---------- */
  let boardZ = 0;
  let trussY = 0;
  let clear: { x0: number; x1: number; z0: number; z1: number } | null = null;
  if (board) {
    const bw = board.right - board.left;
    const trussScreen = board.top - Math.max(16, H * 0.035);
    if (board.bottom > cy + 4) boardZ = ((CAM_H - BOARD_BOTTOM_H) * f) / (board.bottom - cy);
    else boardZ = ((TOP - 1.2 - CAM_H) * f) / Math.max(1, cy - trussScreen);
    trussY = CAM_H + ((cy - trussScreen) * boardZ) / f;
    const toX = (sx: number, z: number) => ((sx - cx) * z) / f;
    const zBehind = board.bottom > cy + 4 ? (f * CAM_H) / (board.bottom - cy) : zFar;
    const inset = wide ? 0.06 : 0.3;
    clear = {
      x0: toX(board.left + bw * inset, boardZ),
      x1: toX(board.right - bw * inset, boardZ),
      z0: boardZ * (wide ? 0.86 : 0.95),
      z1: Math.min(zBehind * 1.05, zFar),
    };
  }

  /* ---------- Ceiling: skylight ---------- */
  {
    const yTop = P(0, TOP, zFar)[1];
    poly([P(-XO, TOP, zStart), P(XO, TOP, zStart), P(XO, TOP, zFar), P(-XO, TOP, zFar)]);
    ctx.fillStyle = vGrad(-H * 0.2, yTop, [
      [0, css(C.sky)],
      [1, css(C.skyDeep)],
    ]);
    ctx.fill();
    ctx.strokeStyle = css(C.beam);
    ctx.lineCap = 'round';
    for (let z = BAY; z < zFar; z += BAY) {
      const a = P(-XO, TOP, z);
      const b = P(XO, TOP, z);
      ctx.lineWidth = Math.max(0.6, (f * 0.35) / z);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    for (const x of [-Wf * 0.66, -Wf * 0.33, 0, Wf * 0.33, Wf * 0.66]) {
      const a = P(x, TOP, zStart * 3);
      const b = P(x, TOP, zFar);
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, css(C.beam, 0.95));
      g.addColorStop(1, css(C.beam, 0.4));
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, W * 0.004);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    // Daylight bloom pouring in from the skylight.
    const glow = ctx.createRadialGradient(cx, -H * 0.1, 0, cx, -H * 0.1, W * 0.7);
    glow.addColorStop(0, 'rgba(255,255,255,0.75)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- End wall with the DEVCONF sign ---------- */
  {
    const a = P(-XO, TOP, zFar);
    const b = P(XO, 0, zFar);
    ctx.fillStyle = vGrad(a[1], b[1], [
      [0, css(C.endWall)],
      [1, css(C.endWallLow)],
    ]);
    ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  }

  /* ---------- Floor ---------- */
  {
    const near = P(0, 0, zStart)[1];
    poly([P(-XO, 0, zStart), P(XO, 0, zStart), P(XO, 0, zFar), P(-XO, 0, zFar)]);
    ctx.fillStyle = vGrad(cy, Math.min(near, H * 1.2), [
      [0, css(C.floorFar)],
      [0.35, css(mix(C.floorFar, C.floorNear, 0.55))],
      [1, css(C.floorNear)],
    ]);
    ctx.fill();
    // Plank seams converging on the vanishing point.
    ctx.lineWidth = 0.7;
    for (let x = -Wf + 1.1; x < Wf; x += 1.1) {
      const a = P(x, 0, zStart * 2);
      const b = P(x, 0, zFar);
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, 'rgba(70,38,18,0.16)');
      g.addColorStop(0.6, 'rgba(70,38,18,0.05)');
      g.addColorStop(1, 'rgba(70,38,18,0)');
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    // Stone border along the booths.
    for (const s of [-1, 1]) {
      quadY(0, s * Wf, s * XO, zStart, zFar);
      ctx.fillStyle = css(C.stone, 0.9);
      ctx.fill();
    }
    // Skylight reflection running down the middle of the polished floor.
    poly([P(-Wf * 0.45, 0, zStart * 3), P(Wf * 0.45, 0, zStart * 3), P(Wf * 0.45, 0, zFar), P(-Wf * 0.45, 0, zFar)]);
    const refl = ctx.createLinearGradient(0, cy, 0, H);
    refl.addColorStop(0, 'rgba(255,248,236,0.45)');
    refl.addColorStop(1, 'rgba(255,248,236,0.06)');
    ctx.fillStyle = refl;
    ctx.fill();
  }

  /** Soft elliptical glow lying on the floor at world (x, z) with world radius r. */
  const floorPool = (x: number, z: number, r: number, color: RGB, alpha: number) => {
    const [px, py] = P(x, 0, z);
    const rx = (f * r) / z;
    const ry = (f * CAM_H * r) / (z * z);
    if (rx < 1 || py - ry > H || px + rx < 0 || px - rx > W) return;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, Math.max(0.05, ry / rx));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, css(color, alpha));
    g.addColorStop(1, css(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Warm light pools from the ceiling fixtures.
  for (let z = 14; z < zFar * 0.7; z += BAY * 2.2) {
    floorPool(-Wf * 0.45, z, 5, hex('#ffe2a0'), 0.35);
    floorPool(Wf * 0.45, z + BAY, 5, hex('#ffe2a0'), 0.35);
  }

  /* ---------- Rug and screen glow under the board ---------- */
  if (clear) {
    const zMid = (clear.z0 + Math.min(clear.z1, clear.z0 * 1.9)) / 2;
    const rx0 = clear.x0 + 0.4;
    const rx1 = clear.x1 - 0.4;
    const rz0 = clear.z0 * 1.04;
    const rz1 = Math.min(clear.z1, clear.z0 * 1.9);
    if (rx1 > rx0 && rz1 > rz0) {
      quadY(0, rx0, rx1, rz0, rz1);
      const a = P(0, 0, rz1)[1];
      const b = P(0, 0, rz0)[1];
      ctx.fillStyle = vGrad(a, b, [
        [0, css(lighten(C.rug, 0.2))],
        [1, css(C.rug)],
      ]);
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(C.sun, 0.85);
      ctx.lineWidth = Math.max(1, (f * 0.12) / zMid);
      quadY(0, rx0 + 0.5, rx1 - 0.5, rz0 + 0.5, rz1 - 0.5);
      ctx.stroke();
    }
    floorPool((clear.x0 + clear.x1) / 2, zMid, (clear.x1 - clear.x0) * 0.6, hex('#ffe9a8'), 0.45);
  }

  /* ---------- Side galleries ---------- */
  const balconyPeople: { x: number; z: number; feet: number }[][] = LEVELS.map(() => []);
  for (let i = 1; i < LEVELS.length; i++) {
    for (const s of [-1, 1]) {
      for (let k = 0; k < (wide ? 60 : 34); k++) {
        const z = 6 + Math.pow(rng(), 1.15) * (zFar * 0.92 - 6);
        balconyPeople[i].push({ x: s * (Wf + 0.6 + rng() * 1.6), z, feet: LEVELS[i] + SLAB });
      }
    }
    balconyPeople[i].sort((a, b) => b.z - a.z);
  }

  for (const s of [-1, 1]) {
    const X0 = s * Wf;
    const X1 = s * XO;
    // Shop walls, bay by bay.
    for (let z = zFar - BAY; z > -BAY; z -= BAY) {
      const z0 = Math.max(zStart, z);
      const z1 = z + BAY;
      if (z1 <= zStart) continue;
      const bay = Math.round(z / BAY);
      for (let i = 0; i < LEVELS.length; i++) {
        const floorY = LEVELS[i] + (i > 0 ? SLAB : 0);
        const ceilY = i < 3 ? LEVELS[i + 1] : TOP;
        quadX(X1, floorY, ceilY, z0, z1);
        const top = P(X1, ceilY, z1)[1];
        const bot = P(X1, floorY, z1)[1];
        ctx.fillStyle = vGrad(top, bot, [
          [0, css(C.wallDark)],
          [0.35, css(C.wall)],
          [1, css(lighten(C.wall, 0.08))],
        ]);
        ctx.fill();
        // Lit storefront window or booth.
        const winTop = i === 0 ? 3.4 : floorY + 3.1;
        const winBot = i === 0 ? 0.2 : floorY + 0.25;
        const m = BAY * 0.08;
        const lit = (bay + i) % 3 !== 0;
        quadX(X1, winBot, winTop, Math.max(zStart, z + m), z1 - m);
        const wt = P(X1, winTop, z1)[1];
        const wb = P(X1, winBot, z1)[1];
        ctx.fillStyle = vGrad(wt, wb, [
          [0, css(lit ? C.shop : mix(C.shop, C.wall, 0.45))],
          [1, css(lit ? C.shopWarm : mix(C.shopWarm, C.wall, 0.5))],
        ]);
        ctx.fill();
        if (i === 0) {
          // Booth sign band.
          quadX(X1, 3.7, 4.5, Math.max(zStart, z + m), z1 - m);
          const c = BOOTH[((bay % 6) + 6) % 6];
          const st = P(X1, 4.5, z1)[1];
          const sb = P(X1, 3.7, z1)[1];
          ctx.fillStyle = vGrad(st, sb, [
            [0, css(lighten(c, 0.15))],
            [1, css(darken(c, 0.1))],
          ]);
          ctx.fill();
        }
      }
    }
    // Balcony floors and soffits.
    for (let i = 1; i < LEVELS.length; i++) {
      const floorY = LEVELS[i] + SLAB;
      if (CAM_H > floorY) {
        quadY(floorY, X0, X1, zStart, zFar);
        ctx.fillStyle = css(C.balconyFloor);
        ctx.fill();
      }
      if (CAM_H < LEVELS[i]) {
        quadY(LEVELS[i], X0, X1, zStart, zFar);
        const a = P(X0, LEVELS[i], 20);
        const b = P(X1, LEVELS[i], 20);
        const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        g.addColorStop(0, css(C.soffit));
        g.addColorStop(1, css(darken(C.soffit, 0.35)));
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
    // Wall-floor ambient occlusion on the concourse.
    for (let z = zFar - BAY; z > -BAY; z -= BAY) {
      const z0 = Math.max(zStart, z);
      const z1 = z + BAY;
      if (z1 <= zStart) continue;
      const zm = (z0 + z1) / 2;
      quadY(0, s * (XO - 2.6), X1, z0, z1);
      const a = P(s * (XO - 2.6), 0, zm);
      const b = P(X1, 0, zm);
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, 'rgba(60,30,40,0)');
      g.addColorStop(1, 'rgba(60,30,40,0.28)');
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  // Balcony crowds, then slab edges and glass railings in front of them.
  const SHIRTS = ['#ff4f5e', '#3b82f6', '#22c3b5', '#8b5cf6', '#ff7ab6', '#ff8c42', '#ffd23f', '#f4f1ea', '#3d3566', '#2f9e5a', '#e5e7eb', '#1f2937', '#64748b', '#7fd3ff'].map(hex);
  const HAIR = ['#3b2a20', '#1b1530', '#6b4a2b', '#d9a441', '#8c8aa3', '#24180f'].map(hex);
  const SKIN = ['#f2c094', '#d99a6c', '#a86b45', '#7a4a2e', '#fde0c2'].map(hex);
  const PANTS = ['#2a2350', '#3d3566', '#1f2937', '#4b5563', '#24405f'].map(hex);
  const LANYARD = ['#8b5cf6', '#ff7ab6', '#22c3b5', '#ff4f5e'].map(hex);

  interface Person {
    x: number;
    z: number;
    feet: number;
    shirt: RGB;
    hair: RGB;
    skin: RGB;
    pants: RGB;
    back: boolean;
    badge: RGB | null;
    pack: boolean;
    build: number;
  }
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];
  const person = (x: number, z: number, feet: number): Person => ({
    x,
    z,
    feet,
    shirt: pick(SHIRTS),
    hair: pick(HAIR),
    skin: pick(SKIN),
    pants: pick(PANTS),
    back: rng() < 0.55,
    badge: rng() < 0.5 ? pick(LANYARD) : null,
    pack: rng() < 0.25,
    build: 0.9 + rng() * 0.22,
  });

  const drawPerson = (p: Person, fogT: number) => {
    const [sx, sy] = P(p.x, p.feet, p.z);
    const h = ((f * PERSON_H) / p.z) * p.build;
    if (h < 1.2 || sx < -h || sx > W + h || sy - h > H || sy < 0) return;
    const tone = (c: RGB) => mix(c, C.haze, fogT);
    const w = h * 0.3;
    const headR = h * 0.12;
    const headY = sy - h + headR;
    const shoulder = sy - h + headR * 2.05;
    const hip = sy - h * 0.44;
    // Contact shadow.
    if (p.feet === 0 && h > 4) {
      ctx.fillStyle = `rgba(60,30,20,${0.22 * (1 - fogT)})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, w * 0.85, w * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const shirt = tone(p.shirt);
    const pants = tone(p.pants);
    if (h < 7) {
      ctx.fillStyle = css(pants);
      ctx.beginPath();
      ctx.roundRect(sx - w * 0.4, hip - 1, w * 0.8, sy - hip + 1, w * 0.3);
      ctx.fill();
      ctx.fillStyle = css(shirt);
      ctx.beginPath();
      ctx.roundRect(sx - w / 2, shoulder, w, hip - shoulder + 0.5, w * 0.45);
      ctx.fill();
      ctx.fillStyle = css(tone(p.back ? p.hair : p.skin));
      ctx.beginPath();
      ctx.arc(sx, headY, headR, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Legs.
    const legW = w * 0.36;
    ctx.fillStyle = css(darken(pants, 0.05));
    ctx.beginPath();
    ctx.roundRect(sx - w * 0.42, hip - w * 0.3, legW, sy - hip + w * 0.3, legW / 2);
    ctx.roundRect(sx + w * 0.06, hip - w * 0.3, legW, sy - hip + w * 0.3, legW / 2);
    ctx.fill();
    // Arms.
    const armW = w * 0.24;
    ctx.fillStyle = css(darken(shirt, 0.18));
    ctx.beginPath();
    ctx.roundRect(sx - w * 0.62, shoulder + armW * 0.3, armW, (hip - shoulder) * 1.02, armW / 2);
    ctx.roundRect(sx + w * 0.62 - armW, shoulder + armW * 0.3, armW, (hip - shoulder) * 1.02, armW / 2);
    ctx.fill();
    // Torso capsule with soft side lighting.
    const torso = ctx.createLinearGradient(sx - w / 2, shoulder, sx + w / 2, hip);
    torso.addColorStop(0, css(lighten(shirt, 0.22)));
    torso.addColorStop(0.55, css(shirt));
    torso.addColorStop(1, css(darken(shirt, 0.25)));
    ctx.fillStyle = torso;
    ctx.beginPath();
    ctx.roundRect(sx - w / 2, shoulder, w, hip - shoulder + w * 0.15, [w * 0.45, w * 0.45, w * 0.22, w * 0.22]);
    ctx.fill();
    if (p.back && p.pack) {
      ctx.fillStyle = css(darken(tone(pick(PANTS)), 0.1));
      ctx.beginPath();
      ctx.roundRect(sx - w * 0.34, shoulder + w * 0.18, w * 0.68, (hip - shoulder) * 0.7, w * 0.2);
      ctx.fill();
    }
    if (p.badge && !p.back) {
      ctx.strokeStyle = css(tone(p.badge));
      ctx.lineWidth = Math.max(0.6, w * 0.07);
      ctx.beginPath();
      ctx.moveTo(sx - w * 0.2, shoulder);
      ctx.lineTo(sx, shoulder + (hip - shoulder) * 0.48);
      ctx.lineTo(sx + w * 0.2, shoulder);
      ctx.stroke();
      ctx.fillStyle = css(tone(WHITE));
      ctx.beginPath();
      ctx.roundRect(sx - w * 0.13, shoulder + (hip - shoulder) * 0.45, w * 0.26, w * 0.32, w * 0.05);
      ctx.fill();
    }
    // Head.
    const skin = tone(p.skin);
    const hair = tone(p.hair);
    const head = ctx.createRadialGradient(sx - headR * 0.35, headY - headR * 0.35, headR * 0.1, sx, headY, headR);
    head.addColorStop(0, css(lighten(skin, 0.15)));
    head.addColorStop(1, css(darken(skin, 0.18)));
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(sx, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(hair);
    ctx.beginPath();
    if (p.back) ctx.arc(sx, headY, headR * 1.02, Math.PI * 0.92, Math.PI * 2.08);
    else ctx.arc(sx, headY, headR * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    if (p.back) {
      ctx.beginPath();
      ctx.ellipse(sx, headY + headR * 0.05, headR * 0.98, headR * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  for (const s of [-1, 1]) {
    const X0 = s * Wf;
    for (let i = 1; i < LEVELS.length; i++) {
      const floorY = LEVELS[i] + SLAB;
      for (const bp of balconyPeople[i]) {
        if (Math.sign(bp.x) !== s) continue;
        drawPerson(person(bp.x, bp.z, bp.feet), 0);
      }
      // Slab edge.
      quadX(X0, LEVELS[i], floorY, zStart, zFar);
      const et = P(X0, floorY, 20)[1];
      const eb = P(X0, LEVELS[i], 20)[1];
      ctx.fillStyle = vGrad(et, eb, [
        [0, css(C.slab)],
        [1, css(C.slabShade)],
      ]);
      ctx.fill();
      // Glass railing.
      quadX(X0, floorY, floorY + 1.1, zStart, zFar);
      ctx.fillStyle = css(C.glass, 0.32);
      ctx.fill();
      const r0 = P(X0, floorY + 1.1, zStart);
      const r1 = P(X0, floorY + 1.1, zFar);
      ctx.strokeStyle = css(C.rail);
      ctx.lineWidth = Math.max(0.8, W * 0.0025);
      ctx.beginPath();
      ctx.moveTo(r0[0], r0[1]);
      ctx.lineTo(r1[0], r1[1]);
      ctx.stroke();
    }
  }

  /* ---------- Columns ---------- */
  {
    const zs: number[] = [];
    for (let z = BAY; z < zFar; z += BAY) zs.push(z);
    zs.reverse();
    for (const z of zs) {
      for (const s of [-1, 1]) {
        const [sx, yTop] = P(s * Wf, TOP, z);
        const yBot = P(s * Wf, 0, z)[1];
        const r = (f * 0.55) / z;
        if (sx + r < 0 || sx - r > W) continue;
        const g = ctx.createLinearGradient(sx - r, 0, sx + r, 0);
        const lit = s < 0 ? [C.columnShade, C.column] : [C.column, C.columnShade];
        g.addColorStop(0, css(lit[0]));
        g.addColorStop(0.5, css(lighten(C.column, 0.4)));
        g.addColorStop(1, css(lit[1]));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(sx - r, yTop, r * 2, yBot - yTop, Math.min(r, 6));
        ctx.fill();
        // Base AO.
        ctx.fillStyle = vGrad(yBot - r * 2, yBot, [
          [0, 'rgba(60,30,40,0)'],
          [1, 'rgba(60,30,40,0.25)'],
        ]);
        ctx.fillRect(sx - r, yBot - r * 2, r * 2, r * 2);
      }
    }
  }

  /* ---------- Banners ---------- */
  const overlapsBoard = (x0: number, y0: number, x1: number, y1: number) =>
    !!board && x1 > board.left - 6 && x0 < board.right + 6 && y1 > board.top - 40 && y0 < board.bottom;
  const BANNER = ['#8b5cf6', '#ff7ab6', '#22c3b5', '#3b82f6'].map(hex);
  [1.0, 1.7, 2.6, 3.8, 5.4].forEach((k, i) => {
    const z = (wide ? 30 : 16) * k;
    const s = i % 2 === 0 ? -1 : 1;
    const xc = s * (Wf - 2.2);
    const [ax, ay] = P(xc - 1.1, 19.5, z);
    const [bx, by] = P(xc + 1.1, 12.5, z);
    const bw = bx - ax;
    const bh = by - ay;
    if (bw < 3 || overlapsBoard(ax, ay, bx, by)) return;
    const t = fog(z);
    const col = mix(BANNER[i % BANNER.length], C.haze, t);
    ctx.strokeStyle = css(mix(C.steelDark, C.haze, t));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax + bw * 0.2, ay);
    ctx.lineTo(ax + bw * 0.2, P(0, TOP, z)[1]);
    ctx.moveTo(bx - bw * 0.2, ay);
    ctx.lineTo(bx - bw * 0.2, P(0, TOP, z)[1]);
    ctx.stroke();
    const g = ctx.createLinearGradient(ax, 0, bx, 0);
    g.addColorStop(0, css(lighten(col, 0.18)));
    g.addColorStop(1, css(darken(col, 0.15)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(ax, ay, bw, bh, [bw * 0.06, bw * 0.06, bw * 0.24, bw * 0.24]);
    ctx.fill();
    if (bw > 14) {
      ctx.fillStyle = css(mix(WHITE, C.haze, t), 0.95);
      ctx.font = `700 ${Math.round(bw * 0.34)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(['</>', '{ }', 'AI', '>_', '#'][i % 5], ax + bw / 2, ay + bh * 0.55);
    }
  });

  /* ---------- The DEVCONF sign at the end of the hall ---------- */
  {
    const size = signSize;
    ctx.font = `800 ${size}px ${font}`;
    const label = 'DEVCONF 2026';
    const tw = ctx.measureText(label).width;
    const pw = tw + size * 1.4;
    const ph = size * 1.9;
    const sx = cx - pw / 2;
    const sy = cy - ph * 0.9;
    ctx.save();
    ctx.shadowColor = 'rgba(255,122,182,0.9)';
    ctx.shadowBlur = size * 1.6;
    const g = ctx.createLinearGradient(0, sy, 0, sy + ph);
    g.addColorStop(0, '#4a3590');
    g.addColorStop(1, '#2a1f5c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(sx, sy, pw, ph, ph * 0.3);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,154,208,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(sx + 1.5, sy + 1.5, pw - 3, ph - 3, ph * 0.27);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = 'rgba(255,154,208,0.95)';
    ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = '#ffe0f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, sy + ph / 2 + size * 0.04);
    ctx.restore();
  }

  /* ---------- Depth haze: nested equal-depth cross-sections ---------- */
  {
    const steps = 110;
    let prev = 0;
    for (let k = 0; k <= steps; k++) {
      const z = 6 * Math.pow(zFar / 6, k / steps);
      const c = fog(z);
      const a = 1 - (1 - c) / (1 - prev);
      prev = c;
      if (a <= 0) continue;
      const [x0, y0] = P(-XO, TOP, z);
      const [x1, y1] = P(XO, 0, z);
      ctx.fillStyle = css(C.haze, a);
      ctx.fillRect(Math.max(-10, x0), Math.max(-10, y0), Math.min(W + 20, x1 - x0), Math.min(H + 20, y1 - y0));
    }
  }

  /* ---------- Truss and cables ---------- */
  if (board && boardZ > 0) {
    const t = fog(boardZ) * 0.6;
    const half = (f * 0.45) / boardZ;
    const span = Math.min(Wf, XO) + 0.2;
    const [lx, ty] = P(-span, trussY, boardZ);
    const rx = P(span, trussY, boardZ)[0];
    const tube = Math.max(2.5, half * 0.32);
    const steel = mix(C.steel, C.haze, t);
    const steelDark = mix(C.steelDark, C.haze, t);
    // Diagonals.
    ctx.strokeStyle = css(steelDark);
    ctx.lineWidth = Math.max(1.2, tube * 0.45);
    ctx.beginPath();
    const step = half * 2;
    for (let x = Math.max(lx, -step * 2); x < Math.min(rx, W + step * 2); x += step) {
      ctx.moveTo(x, ty - half);
      ctx.lineTo(x + step / 2, ty + half);
      ctx.lineTo(x + step, ty - half);
    }
    ctx.stroke();
    // Chords.
    for (const yy of [ty - half, ty + half]) {
      const g = ctx.createLinearGradient(0, yy - tube / 2, 0, yy + tube / 2);
      g.addColorStop(0, css(lighten(steel, 0.5)));
      g.addColorStop(0.5, css(steel));
      g.addColorStop(1, css(steelDark));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(Math.max(lx, -10), yy - tube / 2, Math.min(rx, W + 10) - Math.max(lx, -10), tube, tube / 2);
      ctx.fill();
    }
    // Soft shadow under the truss.
    ctx.fillStyle = vGrad(ty + half + tube / 2, ty + half + tube * 3, [
      [0, 'rgba(40,24,60,0.12)'],
      [1, 'rgba(40,24,60,0)'],
    ]);
    ctx.fillRect(Math.max(lx, 0), ty + half + tube / 2, Math.min(rx, W) - Math.max(lx, 0), tube * 2.5);
    // Cables down to the board's top corners.
    const bw = board.right - board.left;
    for (const x of [board.left + bw * 0.14, board.right - bw * 0.14]) {
      ctx.strokeStyle = 'rgba(40,32,70,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, ty + half);
      ctx.lineTo(x, board.top + 4);
      ctx.stroke();
      ctx.fillStyle = css(steelDark);
      ctx.beginPath();
      ctx.roundRect(x - 3.5, ty + half - 1, 7, 6, 2);
      ctx.fill();
    }
  }

  /* ---------- Floor crowd ---------- */
  {
    const zMin = (f * CAM_H) / (H * 1.25 - cy);
    const zMax = zFar * 0.95;
    const area = 2 * Wf * (zMax - zMin);
    const n = Math.min(wide ? 1700 : 900, Math.round(area / (wide ? 6 : 3.2)));
    const clusters = Array.from({ length: 26 }, () => ({
      x: (rng() * 2 - 1) * (Wf - 2),
      z: zMin + Math.pow(rng(), 1.3) * (zMax - zMin),
    }));
    const crowd: Person[] = [];
    const cl = clear;
    for (let i = 0; i < n; i++) {
      let x: number;
      let z: number;
      if (rng() < 0.35) {
        const c = clusters[Math.floor(rng() * clusters.length)];
        x = c.x + (rng() - 0.5) * 5;
        z = c.z + (rng() - 0.5) * 8;
      } else {
        x = (rng() * 2 - 1) * (Wf - 0.6);
        z = zMin + rng() * (zMax - zMin);
      }
      const p = person(x, z, 0);
      if (Math.abs(x) > Wf - 0.5 || z < zMin || z > zMax) continue;
      if (cl) {
        const pad = 0.8;
        if (x > cl.x0 - pad && x < cl.x1 + pad && z > cl.z0 && z < cl.z1) continue;
        // Keep figures just in front of the clearing from covering it.
        if (z <= cl.z0 && z > cl.z0 * 0.72) {
          const [sx, sy] = P(x, 0, z);
          const h = (f * PERSON_H) / z;
          const [ex0] = P(cl.x0, 0, cl.z0);
          const [ex1, ey] = P(cl.x1, 0, cl.z0);
          if (sx > ex0 - h * 0.3 && sx < ex1 + h * 0.3 && sy - h < ey) continue;
        }
      }
      crowd.push(p);
    }
    crowd.sort((a, b) => b.z - a.z);
    for (const p of crowd) drawPerson(p, fog(p.z));
  }

  /* ---------- Vignette ---------- */
  {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.85);
    g.addColorStop(0, 'rgba(42,35,80,0)');
    g.addColorStop(1, 'rgba(42,35,80,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
