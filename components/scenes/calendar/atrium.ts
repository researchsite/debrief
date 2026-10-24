import { PX } from '@/components/pixel';

/**
 * Paints a static convention-center atrium in one-point perspective onto a
 * low-resolution canvas: multi-tier balconies with glass railings, cream
 * columns, a carpeted concourse, hanging tech banners, a distant LED sign and
 * a dense seeded crowd. Deterministic: the same size always yields the same
 * picture (fixed-seed PRNG, no clock or Math.random).
 */

type RGB = [number, number, number];

export interface AtriumLayout {
  /** Vanishing point horizontal position as a fraction of the canvas width (default 0.5). */
  vpX?: number;
  /** Vanishing point height as a fraction of the canvas height. */
  vpY: number;
  /** Half-width of the concourse floor at the bottom edge, as a fraction of the canvas width. */
  spread: number;
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
const css = (c: RGB, a = 1) =>
  a >= 1
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
  haze: hex('#f4e8d6'),
  ceiling: hex('#f3eee4'),
  beam: hex('#e2d6c2'),
  pane: hex('#d6ecf4'),
  slab: hex('#ffffff'),
  slabShade: hex('#d9cdb8'),
  glass: hex('#c6e6ea'),
  rail: hex('#8fa9b3'),
  wall: hex('#efe4d0'),
  shop: hex('#ffd99a'),
  shopDim: hex('#f2c27a'),
  mullion: hex('#c9b494'),
  column: hex('#f6e9cc'),
  columnShade: hex('#dcc69e'),
  store: hex('#3d3566'),
  storeLit: hex('#5b4f8f'),
  stone: hex('#efe2ca'),
  carpetA: hex('#d6a23e'),
  carpetB: hex('#c48c30'),
  carpetLine: hex('#8a5a2b'),
  endWall: hex('#2a2350'),
};
const SIGN_COLORS = [PX.purple, PX.pink, PX.teal, PX.sun, PX.blue, PX.orange].map(hex);

const CAM_H = 13;
const H_TOP = 22;
const SLABS = [5, 10, 15];
const BAY = 7;

/** 3x5 pixel font for the signs. */
const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  ' ': ['...', '...', '...', '...', '...'],
};

/** 5x5 icons for the hanging banners. */
const ICONS: string[][] = [
  // code brackets </>
  ['..#..##..', '.#...#.#.', '#...#...#', '.#.#...#.', '..##..#..'],
  // chip
  ['#.#.#', '#####', '##.##', '#####', '#.#.#'],
  // graph nodes
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
];

function textWidth(text: string, scale: number) {
  return (text.length * 4 - 1) * scale;
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string) {
  ctx.fillStyle = color;
  [...text].forEach((ch, i) => {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    g.forEach((row, gy) => {
      for (let gx = 0; gx < 3; gx++) {
        if (row[gx] === '#') ctx.fillRect(x + (i * 4 + gx) * scale, y + gy * scale, scale, scale);
      }
    });
  });
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: string[], x: number, y: number, scale: number, color: string) {
  ctx.fillStyle = color;
  icon.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] === '#') ctx.fillRect(x + gx * scale, y + gy * scale, scale, scale);
    }
  });
}

export function paintAtrium(ctx: CanvasRenderingContext2D, W: number, H: number, layout: AtriumLayout) {
  const cx = Math.round(W * (layout.vpX ?? 0.5));
  const cy = Math.round(H * layout.vpY);
  const below = Math.max(1, H - cy);
  const Wf = (CAM_H * layout.spread * W) / below;
  const f = W;
  const zNear = (f * CAM_H) / below;
  const zFar = zNear * 16;
  const fog = (z: number) => 0.6 * Math.pow(clamp01((z - zNear * 0.8) / (zFar - zNear)), 0.7);

  /* ---------- Architecture, per pixel ---------- */
  const img = ctx.createImageData(W, H);
  const data = img.data;

  const facade = (z: number, zSpan: number, y: number): RGB => {
    const bay = Math.floor(z / BAY);
    let c: RGB;
    if (y < 0.3) c = C.carpetLine;
    else if (y < SLABS[0]) {
      // Ground-floor sponsor booths: lit storefront with a colored sign band.
      if (y > 3.7 && y < 4.6) c = SIGN_COLORS[((bay % 6) + 6) % 6];
      else if (y >= 4.6) c = C.slab;
      else c = y > 1 && y < 3.2 && bay % 2 === 0 ? C.storeLit : C.store;
    } else {
      const s = [...SLABS].reverse().find((v) => y >= v) ?? SLABS[0];
      const t = y - s;
      if (t < 0.6) c = C.slab;
      else if (t < 1.55) c = C.glass;
      else if (t < 1.75) c = C.rail;
      else if (s !== 15 && t > 4.6) c = C.slabShade;
      else if (t > 2 && t < 4.1) {
        const local = ((z % BAY) + BAY) % BAY;
        c = zSpan > 2 ? C.shopDim : local < 0.35 || Math.abs(local - BAY / 2) < 0.2 ? C.mullion : bay % 3 === 0 ? C.shopDim : C.shop;
      } else c = C.wall;
    }
    // Columns between bays, blended by pixel coverage to avoid moire far away.
    const cw = 1.3;
    let cover = 0;
    if (zSpan >= BAY) cover = cw / BAY;
    else {
      const z0 = z - zSpan / 2;
      const z1 = z + zSpan / 2;
      for (let k = Math.floor(z0 / BAY); k <= Math.floor(z1 / BAY); k++) {
        const a = Math.max(z0, k * BAY);
        const b = Math.min(z1, k * BAY + cw);
        if (b > a) cover += b - a;
      }
      cover = clamp01(cover / Math.max(zSpan, 0.0001));
    }
    if (cover > 0) {
      const local = ((z % BAY) + BAY) % BAY;
      const col = local > cw * 0.7 && zSpan < 1 ? C.columnShade : C.column;
      c = mix(c, col, cover > 0.5 && zSpan < BAY ? 1 : cover);
    }
    return c;
  };

  for (let py = 0; py < H; py++) {
    const dy = py + 0.5 - cy;
    for (let px = 0; px < W; px++) {
      const dx = px + 0.5 - cx;
      const adx = Math.abs(dx);
      let c: RGB;
      let z: number;
      const zWall = adx > 0.01 ? (f * Wf) / adx : Infinity;
      if (dy > 0 && (CAM_H * adx) / dy <= Wf) {
        // Concourse floor.
        z = (f * CAM_H) / dy;
        const x = (CAM_H * dx) / dy;
        if (z > zFar) {
          c = C.endWall;
          z = zFar;
        } else if (Math.abs(x) > Wf - 1.4) c = C.stone;
        else {
          const span = (z * z) / (f * CAM_H);
          if (span > 1.6) c = mix(C.carpetA, C.carpetB, 0.45);
          else {
            const u = x / 1.6;
            const v = z / 1.6;
            c = (Math.floor(u + v) + Math.floor(u - v)) & 1 ? C.carpetA : C.carpetB;
            if (z % 12 < 0.5 && span < 0.5) c = C.carpetLine;
          }
        }
      } else {
        const y = CAM_H - (dy * Wf) / Math.max(adx, 0.01);
        if (y > H_TOP || zWall > zFar) {
          if (dy < 0 && (zWall > zFar ? (f * (H_TOP - CAM_H)) / -dy < zFar : true)) {
            // Skylight ceiling.
            z = (f * (H_TOP - CAM_H)) / -dy;
            const x = ((H_TOP - CAM_H) * dx) / -dy;
            const span = (z * z) / (f * (H_TOP - CAM_H));
            if (span > 2) c = mix(C.pane, C.beam, 0.4);
            else c = z % 6 < 0.8 || Math.abs(x) % (Wf / 2) < 0.4 ? C.beam : C.pane;
          } else {
            // Far end wall.
            z = zFar;
            c = C.endWall;
          }
        } else {
          z = zWall;
          const zSpan = (f * Wf) / Math.max(adx - 0.5, 0.01) - (f * Wf) / (adx + 0.5);
          c = facade(z, zSpan, y);
        }
      }
      c = mix(c, C.haze, fog(z));
      const i = (py * W + px) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const project = (x: number, y: number, z: number) => [cx + (f * x) / z, cy - (f * (y - CAM_H)) / z] as const;

  /* ---------- Crowd ---------- */
  const rng = mulberry32(0x5eed2026);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];
  const SHIRTS = [PX.red, PX.blue, PX.teal, PX.purple, PX.pink, PX.orange, PX.sun, PX.white, '#3d3566', PX.leaf, '#e5e7eb', '#1f2937', '#64748b', PX.sky];
  const HAIR = [PX.hair, PX.ink, '#6b4a2b', '#d9a441', '#8c8aa3', '#3b2a20'];
  const SKIN = [PX.skin, PX.skinShade, '#a86b45', '#7a4a2e', '#fde0c2'];
  const PANTS = [PX.night, '#3d3566', '#1f2937', '#4b5563', '#24405f'];
  const LANYARD = [PX.purple, PX.pink, PX.teal, PX.red];

  interface Person {
    x: number;
    z: number;
    feetY: number;
    railY?: number;
    shirt: string;
    hair: string;
    skin: string;
    pants: string;
    back: boolean;
    badge: string | null;
  }

  const people: Person[] = [];
  const makePerson = (x: number, z: number, feetY: number, railY?: number): Person => ({
    x,
    z,
    feetY,
    railY,
    shirt: pick(SHIRTS),
    hair: pick(HAIR),
    skin: pick(SKIN),
    pants: pick(PANTS),
    back: rng() < 0.55,
    badge: rng() < 0.55 ? pick(LANYARD) : null,
  });

  // Floor crowd: uniform in world space, plus clusters, so it thickens toward the vanishing point.
  const zMin = zNear * 0.92;
  const zMax = zFar * 0.95;
  const area = 2 * Wf * (zMax - zMin);
  const n = Math.min(1600, Math.round(area / 5.5));
  const clusters = Array.from({ length: 26 }, () => ({
    x: (rng() * 2 - 1) * (Wf - 2),
    z: zMin + Math.pow(rng(), 1.3) * (zMax - zMin),
  }));
  for (let i = 0; i < n; i++) {
    let x: number;
    let z: number;
    if (rng() < 0.35) {
      const c = clusters[Math.floor(rng() * clusters.length)];
      x = c.x + (rng() - 0.5) * 4;
      z = c.z + (rng() - 0.5) * 6;
    } else {
      x = (rng() * 2 - 1) * (Wf - 0.8);
      z = zMin + rng() * (zMax - zMin);
    }
    if (Math.abs(x) > Wf - 0.6 || z < zMin || z > zMax) continue;
    people.push(makePerson(x, z, 0));
  }
  // Balcony crowds standing behind the glass railings.
  for (const s of SLABS) {
    for (let i = 0; i < 70; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const z = zNear * 0.5 + Math.pow(rng(), 1.2) * (zFar * 0.85 - zNear * 0.5);
      people.push(makePerson(side * (Wf + 0.7 + rng() * 0.8), z, s + 0.6, s + 1.65));
    }
  }
  people.sort((a, b) => b.z - a.z);

  for (const p of people) {
    const [sx, syFeet] = project(p.x, p.feetY, p.z);
    const hp = (f * 1.7) / p.z;
    const h = Math.max(2, Math.round(hp));
    const w = Math.max(1, Math.round(h * 0.34));
    const x0 = Math.round(sx - w / 2);
    const yTop = Math.round(syFeet) - h;
    if (x0 > W || x0 + w < 0 || yTop > H || yTop + h < 0) continue;
    const t = fog(p.z);
    const tone = (col: string) => css(mix(hex(col), C.haze, t * 0.85));

    if (h <= 3) {
      ctx.fillStyle = tone(p.hair);
      ctx.fillRect(x0, yTop, w, 1);
      ctx.fillStyle = tone(p.shirt);
      ctx.fillRect(x0, yTop + 1, w, h - 1);
    } else {
      const headH = Math.max(1, Math.round(h * 0.22));
      const headW = Math.max(1, Math.round(w * 0.72));
      const hx = x0 + Math.floor((w - headW) / 2);
      const legsH = Math.max(1, Math.round(h * 0.36));
      const bodyH = h - headH - legsH;
      ctx.fillStyle = tone(p.back ? p.hair : p.skin);
      ctx.fillRect(hx, yTop, headW, headH);
      ctx.fillStyle = tone(p.hair);
      ctx.fillRect(hx, yTop, headW, Math.max(1, Math.round(headH * 0.35)));
      ctx.fillStyle = tone(p.shirt);
      ctx.fillRect(x0, yTop + headH, w, bodyH);
      ctx.fillStyle = tone(p.pants);
      ctx.fillRect(x0, yTop + headH + bodyH, w, legsH);
      if (w >= 4 && legsH >= 3) {
        ctx.fillStyle = tone(p.shirt === PX.white ? '#e5e7eb' : '#c48c30');
        ctx.fillRect(x0 + Math.floor(w / 2), yTop + h - Math.ceil(legsH / 2), 1, Math.ceil(legsH / 2));
      }
      if (p.badge && h >= 7 && !p.back) {
        const mid = x0 + Math.floor(w / 2);
        ctx.fillStyle = tone(p.badge);
        ctx.fillRect(mid, yTop + headH, 1, Math.max(1, Math.floor(bodyH / 2)));
        ctx.fillStyle = tone(PX.white);
        ctx.fillRect(mid, yTop + headH + Math.max(1, Math.floor(bodyH / 2)), 1, 1);
      } else if (p.badge && h >= 7) {
        ctx.fillStyle = tone(p.badge);
        ctx.fillRect(hx, yTop + headH, headW, 1);
      }
      if (p.feetY === 0 && h >= 9) {
        ctx.fillStyle = 'rgba(90,52,20,0.25)';
        ctx.fillRect(x0 - 1, yTop + h, w + 2, 1);
      }
    }

    // Glass railing in front of balcony people.
    if (p.railY !== undefined) {
      const adx = Math.abs(sx - cx);
      const railTop = Math.round(cy + ((CAM_H - p.railY) * adx) / Wf);
      const bottom = yTop + h;
      if (bottom > railTop) {
        ctx.fillStyle = css(mix(C.glass, C.haze, t), 0.7);
        ctx.fillRect(x0, railTop, w, bottom - railTop + 1);
        ctx.fillStyle = css(mix(C.rail, C.haze, t));
        ctx.fillRect(x0 - 1, railTop, w + 2, 1);
      }
    }
  }

  /* ---------- Hanging banners and screens ---------- */
  const banners = [1.25, 1.8, 2.6, 3.7];
  banners.forEach((k, i) => {
    const z = zNear * k;
    const side = i % 2 === 0 ? -1 : 1;
    const xIn = side * (Wf - 1.4);
    const xOut = side * (Wf - 3.6);
    const [ax, ay] = project(Math.min(xIn, xOut), 19.5, z);
    const [bx, by] = project(Math.max(xIn, xOut), 12.5, z);
    const x0 = Math.round(ax);
    const y0 = Math.round(ay);
    const bw = Math.round(bx) - x0;
    const bh = Math.round(by) - y0;
    if (bw < 2) return;
    const t = fog(z);
    const col = [PX.purple, PX.pink, PX.teal][i % 3];
    ctx.fillStyle = css(mix(hex(PX.ink), C.haze, t));
    ctx.fillRect(x0 - 1, y0, bw + 2, bh + 1);
    ctx.fillStyle = css(mix(hex(col), C.haze, t));
    ctx.fillRect(x0, y0, bw, bh);
    const icon = ICONS[i % ICONS.length];
    const iw = icon[0].length;
    const iconScale = Math.max(1, Math.floor(bw / (iw + 2)));
    if (bw >= iw + 1) {
      const ix = x0 + Math.round((bw - iw * iconScale) / 2);
      const iy = y0 + Math.round(bh * 0.62) - Math.round((5 * iconScale) / 2);
      drawIcon(ctx, icon, ix, iy, iconScale, css(mix(hex(PX.white), C.haze, t)));
      ctx.fillStyle = css(mix(hex(PX.white), C.haze, t), 0.8);
      ctx.fillRect(x0, y0 + bh - Math.max(1, iconScale), bw, Math.max(1, iconScale));
    }
  });

  // Hanging LED screens over the concourse.
  [1.7].forEach((k) => {
    const z = zNear * k;
    const [ax, ay] = project(-3.6, 17.6, z);
    const [bx, by] = project(3.6, 15.4, z);
    const x0 = Math.round(ax);
    const y0 = Math.round(ay);
    const bw = Math.round(bx) - x0;
    const bh = Math.round(by) - y0;
    if (bw < 6 || bh < 4) return;
    const t = fog(z) * 0.6;
    ctx.fillStyle = css(mix(C.rail, C.haze, t));
    ctx.fillRect(x0 + 2, Math.max(0, y0 - 40), 1, 40);
    ctx.fillRect(x0 + bw - 3, Math.max(0, y0 - 40), 1, 40);
    ctx.fillStyle = css(mix(hex(PX.ink), C.haze, t));
    ctx.fillRect(x0 - 1, y0 - 1, bw + 2, bh + 2);
    ctx.fillStyle = css(mix(hex('#2a1f52'), C.haze, t));
    ctx.fillRect(x0, y0, bw, bh);
    const label = textWidth('AI + GRAPHS', 1) <= bw - 4 ? 'AI + GRAPHS' : '</>';
    const ls = Math.max(1, Math.floor(Math.min((bw - 4) / (label.length * 4), (bh - 2) / 6)));
    const lw = textWidth(label, ls);
    if (lw <= bw - 2 && 5 * ls <= bh) {
      drawText(ctx, label, x0 + Math.round((bw - lw) / 2), y0 + Math.round((bh - 5 * ls) / 2), ls, css(mix(hex('#7ff0e4'), C.haze, t)));
    }
  });

  /* ---------- Distant LED sign at the end of the hall ---------- */
  const sign = 'DEVCONF 2026';
  const signScale = 1;
  const tw = textWidth(sign, signScale);
  const sx0 = Math.round(cx - tw / 2);
  const sy0 = Math.round(cy - 2);
  ctx.fillStyle = 'rgba(255,122,182,0.18)';
  ctx.fillRect(sx0 - 9, sy0 - 7, tw + 18, 5 * signScale + 14);
  ctx.fillStyle = 'rgba(139,92,246,0.28)';
  ctx.fillRect(sx0 - 6, sy0 - 5, tw + 12, 5 * signScale + 10);
  ctx.fillStyle = PX.ink;
  ctx.fillRect(sx0 - 4, sy0 - 3, tw + 8, 5 * signScale + 6);
  ctx.fillStyle = '#3d2a6e';
  ctx.fillRect(sx0 - 3, sy0 - 2, tw + 6, 5 * signScale + 4);
  drawText(ctx, sign, sx0, sy0, signScale, '#ff9ad0');
  ctx.fillStyle = PX.pink;
  ctx.fillRect(sx0 - 3, sy0 + 5 * signScale + 1, tw + 6, 1);
}
