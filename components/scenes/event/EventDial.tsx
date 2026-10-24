'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { PX } from '@/components/pixel/palette';

export interface DialSegment {
  key: string;
  label: string;
  /** Empty slot: no event yet. Rendered muted. */
  empty?: boolean;
}

export interface EventDialProps {
  segments: DialSegment[];
  /** Eased dial position; segment index as a float (unbounded, wraps). */
  value: number;
  /** Index (0..segments.length-1) of the wedge at front-center. */
  activeIndex: number;
  /**
   * DOM element holding the projected agenda. Each frame the dial sets its
   * CSS transform so its box maps exactly onto the screen mesh.
   */
  screenRef: React.RefObject<HTMLDivElement | null>;
  /** Called when the agenda box's CSS size should change (on resize / orientation). */
  onScreenBox: (box: ScreenBox) => void;
}

export interface ScreenBox {
  /** CSS pixel size of the agenda box (roughly its on-screen size, so text stays crisp). */
  width: number;
  height: number;
  portrait: boolean;
}

const WEDGE_COLORS = [PX.sun, PX.pink, PX.teal, PX.orange, PX.purple, PX.grass, PX.blue, PX.red];
const DISK_R = 3;
const INNER_R = 1.05;
const WEDGE_H = 0.22;
const DISK_Y = 0.42;

const BACK_Z = -7.4;
const ROOM_HALF_W = 10;

/** Deterministic pseudo-random generator (Park-Miller). */
function seeded(seed: number) {
  let s = Math.max(1, Math.floor(seed)) % 2147483647;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/* ─────────────────────────── layout ─────────────────────────── */

interface Layout {
  portrait: boolean;
  /** Screen world size (projected area, inside the frame). */
  sw: number;
  sh: number;
  /** Screen center. */
  sy: number;
  diskScale: number;
}

function useLayout(): Layout {
  const { size } = useThree();
  const portrait = size.width / Math.max(1, size.height) < 0.85;
  return useMemo(
    () =>
      portrait
        ? { portrait, sw: 6.6, sh: 5.8, sy: 4.35, diskScale: 0.72 }
        : { portrait, sw: 8.4, sh: 4.6, sy: 4.05, diskScale: 1 },
    [portrait],
  );
}

/* ─────────────────────────── labels ─────────────────────────── */

function useFontFamily() {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const css = getComputedStyle(document.documentElement).getPropertyValue('--font-pixel').trim();
    const fam = `${css || ''}, ui-monospace, monospace`.replace(/^, /, '');
    document.fonts.load(`700 48px ${fam}`).finally(() => {
      if (alive) setFamily(fam);
    });
    return () => {
      alive = false;
    };
  }, []);
  return family;
}

/** Wraps `text` into at most `maxLines` lines that fit `maxWidth`. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/.{0,2}$/, '')}…`;
    return kept;
  }
  return lines;
}

function makeLabelTexture(text: string, family: string, aspect: number, muted: boolean) {
  const w = 1024;
  const h = Math.max(192, Math.round(w / aspect));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  let size = Math.round(h * 0.4);
  ctx.font = `700 ${size}px ${family}`;
  let lines = wrapText(ctx, text, w * 0.92, 2);
  while (size > 30 && lines.some((l) => ctx.measureText(l).width > w * 0.92)) {
    size -= 6;
    ctx.font = `700 ${size}px ${family}`;
    lines = wrapText(ctx, text, w * 0.92, 2);
  }
  if (lines.length === 2) {
    size = Math.min(size, Math.round(h * 0.34));
    ctx.font = `700 ${size}px ${family}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = size * 1.08;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    if (!muted) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(l, w / 2, y0 + i * lh + 4);
    }
    ctx.fillStyle = muted ? 'rgba(27,21,48,0.42)' : PX.ink;
    ctx.fillText(l, w / 2, y0 + i * lh);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ─────────────────────────── dial ─────────────────────────── */

/** Annular sector shape centered on +Z after the geometry is laid flat. */
function sectorShape(r0: number, r1: number, a0: number, a1: number) {
  const s = new THREE.Shape();
  s.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
  s.absarc(0, 0, r1, a0, a1, false);
  s.absarc(0, 0, r0, a1, a0, true);
  s.closePath();
  return s;
}

function flatExtrude(shape: THREE.Shape, depth: number, bevel: number, curveSegments: number) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments,
  });
  // Shape lies in XY; lay it in XZ with extrusion going up, sector centered on +Z.
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function Wedge({
  index,
  count,
  segment,
  active,
  family,
}: {
  index: number;
  count: number;
  segment: DialSegment;
  active: boolean;
  family: string | null;
}) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshPhysicalMaterial>(null);
  const ledMat = useRef<THREE.MeshStandardMaterial>(null);
  const seg = (Math.PI * 2) / count;
  const theta = index * seg;
  const base = WEDGE_COLORS[index % WEDGE_COLORS.length];
  // Empty slots keep a faint hint of their palette color, so the disc stays playful but muted.
  const color = useMemo(
    () => (segment.empty ? `#${new THREE.Color('#d4d0e0').lerp(new THREE.Color(base), 0.22).getHexString()}` : base),
    [segment.empty, base],
  );
  const curve = Math.max(24, Math.round(128 / count));

  const { body, lip } = useMemo(() => {
    const gap = 0.05;
    const bevel = 0.05;
    // Shape angle -PI/2 maps to world +Z after rotateX(-PI/2).
    const half = seg / 2;
    const mid = Math.PI / 2;
    const r0 = INNER_R + bevel;
    const r1 = DISK_R - bevel;
    const ga0 = gap / r0;
    const ga1 = gap / r1;
    // Use different angular gaps at inner/outer radius so dividers have a constant width.
    const s = new THREE.Shape();
    const p = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
    s.moveTo(...p(r0, mid - half + ga0));
    s.lineTo(...p(r1, mid - half + ga1));
    s.absarc(0, 0, r1, mid - half + ga1, mid + half - ga1, false);
    s.lineTo(...p(r0, mid + half - ga0));
    s.absarc(0, 0, r0, mid + half - ga0, mid - half + ga0, true);
    s.closePath();
    const b = flatExtrude(s, WEDGE_H - bevel * 2, bevel, curve);
    b.translate(0, bevel, 0);
    // Flip so the sector points to +Z (shape +Y became -Z).
    b.rotateY(Math.PI);
    const lipShape = sectorShape(DISK_R - 0.2, DISK_R - 0.08, mid - half + 0.05 / DISK_R + 0.012, mid + half - 0.05 / DISK_R - 0.012);
    const l = flatExtrude(lipShape, 0.06, 0.025, curve);
    l.translate(0, WEDGE_H, 0);
    l.rotateY(Math.PI);
    return { body: b, lip: l };
  }, [seg, curve]);
  useEffect(
    () => () => {
      body.dispose();
      lip.dispose();
    },
    [body, lip],
  );

  // Label plane: placed between hub and rim, sized to the wedge chord.
  const labelR = (INNER_R + DISK_R) / 2 + 0.05;
  const chord = Math.min(2 * labelR * Math.sin(seg / 2) * 0.86, 2.6);
  const labelW = Math.max(0.5, chord);
  const labelH = Math.min(1.0, labelW * 0.42);

  const texture = useMemo(
    () => (family ? makeLabelTexture(segment.empty ? '+ Empty slot' : segment.label, family, labelW / labelH, !!segment.empty) : null),
    [family, segment.label, segment.empty, labelW, labelH],
  );
  useEffect(() => () => texture?.dispose(), [texture]);

  const leds = useMemo(() => {
    const n = 3;
    return Array.from({ length: n }, (_, i) => {
      const a = (i - (n - 1) / 2) * Math.min(0.12, seg * 0.18);
      return [Math.sin(a) * (DISK_R - 0.14), WEDGE_H + 0.075, Math.cos(a) * (DISK_R - 0.14)] as const;
    });
  }, [seg]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const k = 1 - Math.pow(0.0001, delta);
    const ty = active ? 0.28 : 0;
    const tr = active ? 0.14 : 0;
    g.position.y += (ty - g.position.y) * k;
    const r = Math.hypot(g.position.x, g.position.z);
    const nr = r + (tr - r) * k;
    g.position.x = Math.sin(theta) * nr;
    g.position.z = Math.cos(theta) * nr;
    if (mat.current) {
      const ti = active ? 0.28 : 0;
      mat.current.emissiveIntensity += (ti - mat.current.emissiveIntensity) * k;
    }
    if (ledMat.current) {
      const pulse = active ? 2.2 + Math.sin(state.clock.elapsedTime * 4) * 0.6 : segment.empty ? 0 : 0.35;
      ledMat.current.emissiveIntensity += (pulse - ledMat.current.emissiveIntensity) * k;
    }
  });

  return (
    <group ref={group} rotation={[0, theta, 0]}>
      <mesh geometry={body} castShadow receiveShadow>
        <meshPhysicalMaterial
          ref={mat}
          color={color}
          emissive={color}
          emissiveIntensity={0}
          roughness={segment.empty ? 0.75 : 0.32}
          metalness={0}
          clearcoat={segment.empty ? 0 : 0.8}
          clearcoatRoughness={0.25}
          transparent={!!segment.empty}
          opacity={segment.empty ? 0.72 : 1}
        />
      </mesh>
      <mesh geometry={lip} castShadow>
        <meshStandardMaterial color={segment.empty ? '#d8d4e4' : PX.paper} roughness={0.35} metalness={0.1} />
      </mesh>
      {leds.map((p, i) => (
        <mesh key={i} position={p as unknown as [number, number, number]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshStandardMaterial
            ref={i === 0 ? ledMat : undefined}
            color={segment.empty ? '#9e98b4' : color}
            emissive={color}
            emissiveIntensity={0}
            toneMapped={false}
          />
        </mesh>
      ))}
      {texture && (
        <mesh position={[0, WEDGE_H + 0.006, labelR]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[labelW, labelH]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Static turntable: dark plate, metallic outer ring with tick marks, front pointer. */
function Turntable({ count }: { count: number }) {
  const ticks = useMemo(() => {
    const n = count * 6;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / count;
      const major = i % 6 === 0;
      return { a, major };
    });
  }, [count]);
  return (
    <group>
      {/* base plinth */}
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[DISK_R + 0.5, DISK_R + 0.62, 0.32, 128]} />
        <meshStandardMaterial color={PX.ink} roughness={0.55} metalness={0.2} />
      </mesh>
      {/* recessed platter (shows through the wedge dividers) */}
      <mesh position={[0, DISK_Y - 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[DISK_R + 0.02, DISK_R + 0.02, 0.1, 128]} />
        <meshStandardMaterial color="#14102a" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* metallic outer ring */}
      <mesh position={[0, DISK_Y - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[DISK_R + 0.3, 0.13, 24, 160]} />
        <meshStandardMaterial color="#d9dbe6" roughness={0.22} metalness={0.95} />
      </mesh>
      {ticks.map(({ a, major }, i) => (
        <mesh
          key={i}
          position={[Math.sin(a) * (DISK_R + 0.3), DISK_Y + 0.115, Math.cos(a) * (DISK_R + 0.3)]}
          rotation={[0, a, 0]}
        >
          <boxGeometry args={[0.025, 0.02, major ? 0.2 : 0.1]} />
          <meshStandardMaterial color={major ? PX.ink : '#4a4566'} roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
      {/* front pointer */}
      <mesh position={[0, DISK_Y + 0.18, DISK_R + 0.62]} rotation={[-Math.PI / 2, 0, Math.PI]} castShadow>
        <coneGeometry args={[0.2, 0.42, 3, 1]} />
        <meshStandardMaterial color={PX.red} roughness={0.3} emissive={PX.red} emissiveIntensity={0.25} />
      </mesh>
      {/* center hub (static, under the projector) */}
      <mesh position={[0, DISK_Y + 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[INNER_R - 0.06, INNER_R, 0.36, 96]} />
        <meshStandardMaterial color="#cfd2df" roughness={0.25} metalness={0.9} />
      </mesh>
      <mesh position={[0, DISK_Y + 0.27, 0]} receiveShadow>
        <cylinderGeometry args={[INNER_R - 0.1, INNER_R - 0.06, 0.03, 96]} />
        <meshStandardMaterial color={PX.night} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────── projector + beam ─────────────────────────── */

const HUB_TOP = DISK_Y + 0.29;
const ZOOM_RIDGES = Array.from({ length: 28 }, (_, i) => (i / 28) * Math.PI * 2);
const LENS_X = 0.18;
/** Projector is turned a little toward the camera so its lens and zoom ring read clearly. */
const PROJ_YAW = -0.55;
const PROJ_SCALE = 0.82;

/** Lens position and aim given the screen center. */
function useProjectorPose(layout: Layout) {
  return useMemo(() => {
    const pivot = new THREE.Vector3(0, HUB_TOP + 0.62, 0.1);
    const target = new THREE.Vector3(0, layout.sy, BACK_Z + 0.12);
    const pitch = Math.atan2(target.y - pivot.y, pivot.z - target.z);
    // Lens front in the projector's local frame, mapped through scale + rotation.
    const lens = new THREE.Vector3(LENS_X, 0, -0.84)
      .multiplyScalar(PROJ_SCALE)
      .applyEuler(new THREE.Euler(pitch, PROJ_YAW, 0, 'YXZ'))
      .add(pivot);
    return { pivot, pitch, lens, target };
  }, [layout.sy]);
}

function Projector({ layout }: { layout: Layout }) {
  const { pivot, pitch } = useProjectorPose(layout);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (led.current) led.current.emissiveIntensity = 1.6 + Math.sin(clock.elapsedTime * 2.4) * 1.2;
  });
  const vents = [-0.24, -0.12, 0, 0.12, 0.24];
  return (
    <group>
      {/* stand: column + yoke */}
      <mesh position={[0, HUB_TOP + 0.16, 0.1]} castShadow>
        <cylinderGeometry args={[0.09, 0.14, 0.32, 48]} />
        <meshStandardMaterial color="#bfc3d2" roughness={0.25} metalness={0.9} />
      </mesh>
      <mesh position={[0, HUB_TOP + 0.02, 0.1]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.46, 0.05, 64]} />
        <meshStandardMaterial color={PX.ink} roughness={0.4} metalness={0.3} />
      </mesh>
      <group position={pivot.toArray()} rotation={[pitch, PROJ_YAW, 0, 'YXZ']} scale={PROJ_SCALE}>
        {/* body */}
        <RoundedBox args={[1.34, 0.56, 1.0]} radius={0.14} smoothness={6} castShadow receiveShadow>
          <meshPhysicalMaterial color={PX.paper} roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.3} />
        </RoundedBox>
        {/* accent band */}
        <RoundedBox args={[1.36, 0.1, 1.02]} radius={0.04} smoothness={4} position={[0, -0.1, 0]}>
          <meshStandardMaterial color={PX.purple} roughness={0.35} />
        </RoundedBox>
        {/* top vents */}
        {vents.map((x) => (
          <RoundedBox key={x} args={[0.06, 0.03, 0.5]} radius={0.012} smoothness={2} position={[x, 0.28, 0.12]}>
            <meshStandardMaterial color="#3b3460" roughness={0.6} />
          </RoundedBox>
        ))}
        {/* rear grille */}
        {[-0.1, 0, 0.1].map((y) => (
          <RoundedBox key={y} args={[0.8, 0.035, 0.03]} radius={0.012} smoothness={2} position={[0, y + 0.04, 0.5]}>
            <meshStandardMaterial color="#3b3460" roughness={0.6} />
          </RoundedBox>
        ))}
        {/* status LED + focus knob on the rear */}
        <mesh position={[0.48, 0.12, 0.505]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshStandardMaterial ref={led} color={PX.grass} emissive={PX.grass} emissiveIntensity={2} toneMapped={false} />
        </mesh>
        <mesh position={[-0.48, 0.12, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 32]} />
          <meshStandardMaterial color={PX.orange} roughness={0.3} />
        </mesh>
        {/* lens barrel: housing, knurled zoom ring, metal focus ring, bezel */}
        <group position={[LENS_X, 0.0, -0.5]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.06]} castShadow>
            <cylinderGeometry args={[0.25, 0.27, 0.12, 96]} />
            <meshStandardMaterial color="#2b2547" roughness={0.35} metalness={0.6} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.17]} castShadow>
            <cylinderGeometry args={[0.235, 0.235, 0.1, 96]} />
            <meshStandardMaterial color={PX.orange} roughness={0.45} />
          </mesh>
          {ZOOM_RIDGES.map((a) => (
            <mesh key={a} position={[Math.cos(a) * 0.238, Math.sin(a) * 0.238, -0.17]} rotation={[0, 0, a]}>
              <boxGeometry args={[0.018, 0.022, 0.09]} />
              <meshStandardMaterial color="#e0743a" roughness={0.5} />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.27]}>
            <cylinderGeometry args={[0.2, 0.22, 0.1, 96]} />
            <meshStandardMaterial color="#d9dbe6" roughness={0.2} metalness={0.95} />
          </mesh>
          <mesh rotation={[0, 0, 0]} position={[0, 0, -0.325]}>
            <torusGeometry args={[0.17, 0.03, 16, 96]} />
            <meshStandardMaterial color="#1b1530" roughness={0.3} metalness={0.5} />
          </mesh>
          {/* glass with glowing core */}
          <mesh position={[0, 0, -0.32]} rotation={[-Math.PI / 2, 0, 0]}>
            <sphereGeometry args={[0.165, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
            <meshPhysicalMaterial color="#e8f7ff" emissive="#bfe9ff" emissiveIntensity={5} roughness={0.05} clearcoat={1} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float t = vUv.y;                       // 0 at lens, 1 at screen
    float edge = 0.55 + 0.45 * smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
    float falloff = pow(1.0 - t, 2.0) * 0.4 + 0.03;
    float flicker = 0.94 + 0.04 * sin(uTime * 7.3) + 0.02 * sin(uTime * 17.1);
    float a = falloff * edge * flicker;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** Volumetric light frustum from the lens to the screen rectangle, plus dust specks. */
function Beam({ layout, lensPos }: { layout: Layout; lensPos: THREE.Vector3 }) {
  const corners = useMemo(() => {
    const z = BACK_Z + 0.14;
    const hw = layout.sw / 2;
    const hh = layout.sh / 2;
    return [
      new THREE.Vector3(-hw, layout.sy - hh, z),
      new THREE.Vector3(hw, layout.sy - hh, z),
      new THREE.Vector3(hw, layout.sy + hh, z),
      new THREE.Vector3(-hw, layout.sy + hh, z),
    ];
  }, [layout]);

  const geometry = useMemo(() => {
    const a = [
      new THREE.Vector3(-0.12, -0.08, 0),
      new THREE.Vector3(0.12, -0.08, 0),
      new THREE.Vector3(0.12, 0.08, 0),
      new THREE.Vector3(-0.12, 0.08, 0),
    ].map((v) => v.multiplyScalar(layout.diskScale * PROJ_SCALE).add(lensPos));
    const pos: number[] = [];
    const uv: number[] = [];
    const rows = 12;
    for (let f = 0; f < 4; f++) {
      const i0 = f;
      const i1 = (f + 1) % 4;
      for (let r = 0; r < rows; r++) {
        const t0 = r / rows;
        const t1 = (r + 1) / rows;
        const p00 = a[i0].clone().lerp(corners[i0], t0);
        const p10 = a[i1].clone().lerp(corners[i1], t0);
        const p01 = a[i0].clone().lerp(corners[i0], t1);
        const p11 = a[i1].clone().lerp(corners[i1], t1);
        pos.push(...p00.toArray(), ...p10.toArray(), ...p11.toArray(), ...p00.toArray(), ...p11.toArray(), ...p01.toArray());
        uv.push(0, t0, 1, t0, 1, t1, 0, t0, 1, t1, 0, t1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }, [corners, lensPos, layout.diskScale]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color('#dff3ff') } }), []);
  const beamMat = useRef<THREE.ShaderMaterial>(null);

  // Dust: points drifting slowly from lens to screen inside the frustum.
  const DUST = 140;
  const seeds = useMemo(() => {
    const out: number[] = [];
    const rnd = seeded(1337);
    for (let i = 0; i < DUST; i++) out.push(rnd(), rnd() * 0.8 + 0.1, rnd() * 0.8 + 0.1, 0.4 + rnd() * 0.8);
    return out;
  }, []);
  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(DUST * 3), 3));
    return g;
  }, []);
  useEffect(() => () => dustGeo.dispose(), [dustGeo]);
  const dustTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => dustTex.dispose(), [dustTex]);

  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (beamMat.current) beamMat.current.uniforms.uTime.value = time;
    const attr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
    const [bl, br, , tl] = corners;
    for (let i = 0; i < DUST; i++) {
      const t = (seeds[i * 4] + time * 0.012 * seeds[i * 4 + 3]) % 1;
      const u = seeds[i * 4 + 1] + Math.sin(time * 0.3 + i) * 0.02;
      const v = seeds[i * 4 + 2] + Math.cos(time * 0.25 + i * 1.7) * 0.02;
      tmp.a.copy(bl).lerp(br, u);
      tmp.b.copy(tmp.a).addScaledVector(tmp.c.copy(tl).sub(bl), v);
      tmp.b.lerp(lensPos, 1 - t);
      attr.setXYZ(i, tmp.b.x, tmp.b.y, tmp.b.z);
    }
    attr.needsUpdate = true;
  });

  return (
    <>
      <mesh geometry={geometry} renderOrder={5}>
        <shaderMaterial
          ref={beamMat}
          vertexShader={beamVertex}
          fragmentShader={beamFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <points geometry={dustGeo} renderOrder={6}>
        <pointsMaterial
          map={dustTex}
          size={0.05}
          sizeAttenuation
          color="#ffffff"
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <spotLight
        position={lensPos.toArray()}
        target-position={[0, layout.sy, BACK_Z]}
        angle={Math.atan2(Math.hypot(layout.sw, layout.sh) / 2, lensPos.z - BACK_Z) * 1.05}
        penumbra={0.6}
        intensity={60}
        distance={18}
        decay={1.6}
        color="#eef8ff"
      />
    </>
  );
}

/* ─────────────────────────── room ─────────────────────────── */

function useWoodTexture() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const plankH = 64;
    const rnd = seeded(42);
    const tones = ['#b07a4a', '#a8703f', '#b98452', '#a46d42', '#bd8a58'];
    for (let y = 0; y < 512; y += plankH) {
      let x = -Math.floor(rnd() * 200);
      while (x < 512) {
        const w = 180 + rnd() * 160;
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
        ctx.fillRect(x, y, w, plankH);
        ctx.strokeStyle = 'rgba(60,35,20,0.12)';
        ctx.lineWidth = 1;
        for (let g = 0; g < 5; g++) {
          const gy = y + 8 + rnd() * (plankH - 16);
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + w * 0.3, gy + 3, x + w * 0.6, gy - 3, x + w, gy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,22,12,0.45)';
        ctx.fillRect(x, y, 2, plankH);
        x += w;
      }
      ctx.fillStyle = 'rgba(40,22,12,0.5)';
      ctx.fillRect(0, y, 512, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 3);
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function Sconce({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, y, BACK_Z + 0.02]}>
      {/* backplate + arm + glowing drum shade */}
      <RoundedBox args={[0.16, 0.34, 0.04]} radius={0.02} smoothness={3} position={[0, -0.05, 0.02]}>
        <meshStandardMaterial color="#d9dbe6" roughness={0.25} metalness={0.9} />
      </RoundedBox>
      <mesh position={[0, -0.05, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.2, 16]} />
        <meshStandardMaterial color="#d9dbe6" roughness={0.25} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.02, 0.26]}>
        <cylinderGeometry args={[0.14, 0.19, 0.3, 64, 1, true]} />
        <meshStandardMaterial color="#fff1cf" emissive="#ffcf70" emissiveIntensity={1.4} side={THREE.DoubleSide} roughness={0.6} toneMapped={false} />
      </mesh>
      {/* warm wash on the wall */}
      <mesh position={[0, 0.5, 0.01]}>
        <planeGeometry args={[1.4, 1.6]} />
        <meshBasicMaterial map={glowTexture('#ffd27a')} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.5} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.3, 0.5]} color="#ffcf80" intensity={2.4} distance={4} decay={1.5} />
    </group>
  );
}

const glowCache = new Map<string, THREE.CanvasTexture>();
function glowTexture(color: string) {
  // Small shared radial gradient textures (never disposed: a handful per app).
  if (typeof document === 'undefined') return null;
  let t = glowCache.get(color);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 40, 0, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    glowCache.set(color, t);
  }
  return t;
}

function AcousticPanel({ x, y, color, w = 1.3, h = 2.2 }: { x: number; y: number; color: string; w?: number; h?: number }) {
  return (
    <RoundedBox args={[w, h, 0.14]} radius={0.06} smoothness={4} position={[x, y, BACK_Z + 0.08]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.95} />
    </RoundedBox>
  );
}

function Plant({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  const leaves = useMemo(() => {
    const rnd = seeded(Math.round((x + 20) * 100 + Math.abs(z) * 10));
    return Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + rnd();
      const tilt = 0.5 + rnd() * 0.5;
      return { a, tilt, h: 0.9 + rnd() * 0.6, c: i % 3 === 0 ? PX.grass : PX.leaf };
    });
  }, [x, z]);
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.32, 0.76, 64]} />
        <meshStandardMaterial color={PX.orange} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.77, 0]}>
        <torusGeometry args={[0.42, 0.04, 12, 64]} />
        <meshStandardMaterial color={'#e0743a'} roughness={0.5} />
      </mesh>
      {leaves.map((l, i) => (
        <group key={i} position={[0, 0.72, 0]} rotation={[0, l.a, 0]}>
          <mesh position={[0, l.h / 2, 0.15]} rotation={[l.tilt * 0.6, 0, 0]} scale={[0.22, l.h / 2, 0.08]} castShadow>
            <sphereGeometry args={[1, 24, 16]} />
            <meshStandardMaterial color={l.c} roughness={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ScreenRig({ layout }: { layout: Layout }) {
  const { sw, sh, sy } = layout;
  const z = BACK_Z + 0.12;
  const border = 0.14;
  return (
    <group>
      {/* roller housing (pull-down screen) */}
      <RoundedBox args={[sw + 0.9, 0.3, 0.3]} radius={0.12} smoothness={4} position={[0, sy + sh / 2 + 0.42, z + 0.04]} castShadow>
        <meshStandardMaterial color="#e9e7f0" roughness={0.3} metalness={0.4} />
      </RoundedBox>
      {/* black masking border */}
      <mesh position={[0, sy + 0.08, z - 0.02]} receiveShadow>
        <planeGeometry args={[sw + border * 2, sh + border * 2 + 0.35]} />
        <meshStandardMaterial color="#1b1530" roughness={0.8} />
      </mesh>
      {/* white matte screen */}
      <mesh position={[0, sy, z]} receiveShadow>
        <planeGeometry args={[sw, sh]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} emissive="#ffffff" emissiveIntensity={0.15} />
      </mesh>
      {/* weighted bottom bar */}
      <RoundedBox args={[sw + 0.5, 0.12, 0.12]} radius={0.05} smoothness={4} position={[0, sy - sh / 2 - border - 0.12, z + 0.05]} castShadow>
        <meshStandardMaterial color="#cfd2df" roughness={0.25} metalness={0.9} />
      </RoundedBox>
      <mesh position={[0, sy - sh / 2 - border - 0.26, z + 0.06]}>
        <sphereGeometry args={[0.06, 24, 16]} />
        <meshStandardMaterial color={PX.red} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Room({ layout }: { layout: Layout }) {
  const wood = useWoodTexture();
  const wallColor = '#5b4e94';
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 4]} receiveShadow>
        <planeGeometry args={[ROOM_HALF_W * 2, 24]} />
        <meshStandardMaterial map={wood} roughness={0.55} metalness={0} />
      </mesh>
      {/* round rug under the dial */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <circleGeometry args={[DISK_R + 1.6, 128]} />
        <meshStandardMaterial color={PX.night} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
        <ringGeometry args={[DISK_R + 1.25, DISK_R + 1.38, 128]} />
        <meshStandardMaterial color={PX.sun} roughness={1} />
      </mesh>
      {/* back wall */}
      <mesh position={[0, 5, BACK_Z]} receiveShadow>
        <planeGeometry args={[ROOM_HALF_W * 2, 10]} />
        <meshStandardMaterial color={wallColor} roughness={0.92} />
      </mesh>
      {/* wainscot + skirting */}
      <mesh position={[0, 0.6, BACK_Z + 0.03]} receiveShadow>
        <boxGeometry args={[ROOM_HALF_W * 2, 1.2, 0.06]} />
        <meshStandardMaterial color="#463b7c" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.22, BACK_Z + 0.07]}>
        <boxGeometry args={[ROOM_HALF_W * 2, 0.06, 0.08]} />
        <meshStandardMaterial color={PX.cream} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.08, BACK_Z + 0.07]}>
        <boxGeometry args={[ROOM_HALF_W * 2, 0.16, 0.08]} />
        <meshStandardMaterial color={PX.cream} roughness={0.5} />
      </mesh>
      {/* side walls */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <mesh position={[sx * ROOM_HALF_W, 5, 2]} rotation={[0, -sx * Math.PI / 2, 0]} receiveShadow>
            <planeGeometry args={[20, 10]} />
            <meshStandardMaterial color="#4f4386" roughness={0.92} />
          </mesh>
          <mesh position={[sx * (ROOM_HALF_W - 0.03), 0.6, 2]} rotation={[0, -sx * Math.PI / 2, 0]}>
            <boxGeometry args={[20, 1.2, 0.06]} />
            <meshStandardMaterial color="#3e3470" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* ceiling light strips */}
      {[-1, 1].map((sx) => (
        <group key={`strip${sx}`}>
          <RoundedBox args={[0.18, 0.08, 14]} radius={0.03} smoothness={2} position={[sx * 4.6, 8.6, 0]}>
            <meshBasicMaterial color="#fff4d6" toneMapped={false} />
          </RoundedBox>
        </group>
      ))}
      <mesh position={[0, 8.62, BACK_Z + 0.4]}>
        <boxGeometry args={[ROOM_HALF_W * 2, 0.06, 0.12]} />
        <meshBasicMaterial color="#ffeec4" toneMapped={false} />
      </mesh>
      {/* acoustic panels */}
      {layout.portrait ? (
        <>
          <AcousticPanel x={-4.6} y={3.2} color={PX.teal} w={1.0} h={2.4} />
          <AcousticPanel x={4.6} y={3.2} color={PX.pink} w={1.0} h={2.4} />
        </>
      ) : (
        <>
          <AcousticPanel x={-6.4} y={3.6} color={PX.teal} />
          <AcousticPanel x={-8.0} y={3.6} color={PX.purple} />
          <AcousticPanel x={6.4} y={3.6} color={PX.pink} />
          <AcousticPanel x={8.0} y={3.6} color={PX.orange} />
        </>
      )}
      <Sconce x={layout.portrait ? -4.6 : -5.4} y={layout.portrait ? 5.7 : 5.9} />
      <Sconce x={layout.portrait ? 4.6 : 5.4} y={layout.portrait ? 5.7 : 5.9} />
      <Plant x={layout.portrait ? -4.4 : -7.6} z={BACK_Z + 1.2} s={layout.portrait ? 1.1 : 1.3} />
      <Plant x={layout.portrait ? 4.4 : 7.6} z={BACK_Z + 1.2} s={layout.portrait ? 1.0 : 1.15} />
    </group>
  );
}

/* ─────────────────────────── camera + scene ─────────────────────────── */

function CameraRig({ layout }: { layout: Layout }) {
  const size = useThree((st) => st.size);
  const get = useThree((st) => st.get);
  useEffect(() => {
    const cam = get().camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    if (layout.portrait) {
      cam.fov = 64;
      cam.position.set(1.1, 7.2, 9.8);
      cam.lookAt(0, 2.6, -3);
    } else {
      // Wider screens can afford to sit a little closer.
      const pull = aspect < 1.25 ? 1 + (1.25 - aspect) * 0.9 : 1;
      cam.fov = 42;
      cam.position.set(2.2 * pull, 7.0 * pull, 12.2 * pull);
      cam.lookAt(0.2, 1.95, -3);
    }
    cam.updateProjectionMatrix();
  }, [get, size.width, size.height, layout.portrait]);
  return null;
}

const SCREEN_Z = BACK_Z + 0.121;
const tmpCorner = new THREE.Vector3();

/**
 * Keeps the DOM agenda box glued to the screen mesh: projects the screen's
 * four corners and applies the homography (CSS matrix3d) that maps the box
 * onto that quad. Stays exact through resizes and camera changes.
 */
function ScreenAnchor({
  layout,
  screenRef,
  onScreenBox,
}: {
  layout: Layout;
  screenRef: React.RefObject<HTMLDivElement | null>;
  onScreenBox: (box: ScreenBox) => void;
}) {
  const box = useRef({ width: 0, height: 0, portrait: false });
  const last = useRef('');
  useFrame(({ camera, size }) => {
    const hw = layout.sw / 2;
    const hh = layout.sh / 2;
    const pts: [number, number][] = [
      [-hw, layout.sy + hh],
      [hw, layout.sy + hh],
      [hw, layout.sy - hh],
      [-hw, layout.sy - hh],
    ].map(([x, y]) => {
      tmpCorner.set(x, y, SCREEN_Z).project(camera);
      return [((tmpCorner.x + 1) / 2) * size.width, ((1 - tmpCorner.y) / 2) * size.height];
    });
    // Size the DOM box near its on-screen size so text renders crisply.
    const topW = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    const width = Math.max(200, Math.round(topW / 4) * 4);
    const height = Math.round((width * layout.sh) / layout.sw);
    const b = box.current;
    if (b.width !== width || b.height !== height || b.portrait !== layout.portrait) {
      box.current = { width, height, portrait: layout.portrait };
      onScreenBox(box.current);
    }
    const el = screenRef.current;
    if (!el) return;
    const w = Number(el.dataset.w) || width;
    const h = Number(el.dataset.h) || height;
    const m = homography(pts, w, h);
    const key = m.map((v) => v.toFixed(5)).join(',');
    if (key !== last.current) {
      last.current = key;
      el.style.setProperty('transform', `matrix3d(${key})`);
      el.style.setProperty('visibility', 'visible');
    }
  });
  return null;
}

/** CSS matrix3d (column-major) mapping the box [0,w]x[0,h] onto quad p0..p3 (TL, TR, BR, BL). */
function homography(p: [number, number][], w: number, h: number) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let k = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    k = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
}

function Scene({ segments, value, activeIndex, screenRef, onScreenBox }: EventDialProps) {
  const disk = useRef<THREE.Group>(null);
  const family = useFontFamily();
  const layout = useLayout();
  const count = Math.max(1, segments.length);
  const seg = (Math.PI * 2) / count;
  const { lens } = useProjectorPose(layout);
  const diskZ = layout.portrait ? 0.4 : 0.6;
  // Lens front in world space (projector group is scaled and offset with the disc).
  const lensWorld = useMemo(
    () => new THREE.Vector3(lens.x * layout.diskScale, lens.y * layout.diskScale, lens.z * layout.diskScale + diskZ),
    [lens, layout.diskScale, diskZ],
  );
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useFrame(() => {
    if (disk.current) disk.current.rotation.y = -valueRef.current * seg;
  });

  return (
    <>
      <CameraRig layout={layout} />
      <color attach="background" args={['#2a2350']} />
      <fog attach="fog" args={['#2a2350', 18, 34]} />

      {/* Local studio environment for reflections (no network). */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#fff4e0" position={[0, 6, 4]} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#bfe0ff" position={[-6, 3, 0]} rotation={[0, Math.PI / 2, 0]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffc7e6" position={[6, 3, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 3, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[0, 4, -6]} scale={3} />
      </Environment>

      <hemisphereLight args={['#d9d2ff', '#6b4a3a', 0.55]} />
      {/* key */}
      <directionalLight
        position={[-5, 9, 6]}
        intensity={1.9}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      {/* fill */}
      <directionalLight position={[6, 4, 5]} intensity={0.55} color="#c9dcff" />
      {/* rim from behind */}
      <directionalLight position={[0, 6, -6]} intensity={1.1} color="#ffd6f0" />

      <Room layout={layout} />
      <ScreenRig layout={layout} />
      <ScreenAnchor layout={layout} screenRef={screenRef} onScreenBox={onScreenBox} />

      <group scale={layout.diskScale} position={[0, 0, diskZ]}>
        <Turntable count={count} />
        <group ref={disk} position={[0, DISK_Y, 0]}>
          {segments.map((s, i) => (
            <Wedge key={s.key} index={i} count={count} segment={s} active={i === activeIndex} family={family} />
          ))}
        </group>
      </group>
      <group scale={layout.diskScale} position={[0, 0, diskZ]}>
        <Projector layout={layout} />
      </group>
      <Beam layout={layout} lensPos={lensWorld} />

      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
        <Vignette eskil={false} offset={0.25} darkness={0.55} />
      </EffectComposer>
    </>
  );
}

export default function EventDial(props: EventDialProps) {
  return (
    <Canvas
      className="event-dial-canvas"
      dpr={[1, 2]}
      shadows="soft"
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping }}
      camera={{ fov: 42, near: 0.1, far: 60, position: [0, 5.6, 9.6] }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
