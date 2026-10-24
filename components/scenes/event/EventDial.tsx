'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PX } from '@/components/pixel/palette';

export interface DialSegment {
  key: string;
  label: string;
  placeholder?: boolean;
}

export interface EventDialProps {
  segments: DialSegment[];
  /** Eased dial position; segment index as a float (unbounded, wraps). */
  value: number;
  /** Index (0..segments.length-1) of the wedge at front-center. */
  activeIndex: number;
  /** DOM element kept positioned over the hub (holds the Import button). */
  hubAnchor: React.RefObject<HTMLDivElement | null>;
  /** Wall screen center as a fraction of stage height (0 = top), given stage px size. */
  screenY: ScreenFn;
  /** Wall screen width as a fraction of stage width, given stage px size. */
  screenW: ScreenFn;
}

export type ScreenFn = (width: number, height: number) => number;

const WEDGE_COLORS = [PX.sun, PX.pink, PX.teal, PX.orange, PX.purple, PX.grass, PX.blue, PX.red];
const DISK_R = 3;
const WEDGE_H = 0.28;
const HUB_R = 0.85;

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

function makeLabelTexture(text: string, family: string, aspect: number) {
  const w = 512;
  const h = Math.max(96, Math.round(w / aspect));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  let size = Math.round(h * 0.42);
  ctx.font = `700 ${size}px ${family}`;
  let lines = wrapText(ctx, text, w * 0.94, 2);
  while (size > 18 && lines.some((l) => ctx.measureText(l).width > w * 0.94)) {
    size -= 4;
    ctx.font = `700 ${size}px ${family}`;
    lines = wrapText(ctx, text, w * 0.94, 2);
  }
  if (lines.length === 2) {
    size = Math.min(size, Math.round(h * 0.36));
    ctx.font = `700 ${size}px ${family}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = size * 1.05;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    ctx.fillStyle = 'rgba(27,21,48,0.35)';
    ctx.fillText(l, w / 2 + 4, y0 + i * lh + 4);
    ctx.fillStyle = PX.ink;
    ctx.fillText(l, w / 2, y0 + i * lh);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  return tex;
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
  const mat = useRef<THREE.MeshLambertMaterial>(null);
  const seg = (Math.PI * 2) / count;
  const theta = index * seg;
  const gap = count > 1 ? Math.min(0.04, seg * 0.04) : 0;
  const color = segment.placeholder ? PX.stone : WEDGE_COLORS[index % WEDGE_COLORS.length];

  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(
      DISK_R,
      DISK_R,
      WEDGE_H,
      Math.max(8, Math.round(48 / count)),
      1,
      false,
      -seg / 2 + gap,
      seg - gap * 2,
    );
    g.translate(0, WEDGE_H / 2, 0);
    return g;
  }, [count, seg, gap]);

  // Label plane: placed between hub and rim, sized to the wedge chord.
  const labelR = count === 1 ? DISK_R * 0.72 : (HUB_R + DISK_R) / 2 + 0.15;
  const chord = count === 1 ? DISK_R * 1.4 : Math.min(2 * labelR * Math.sin(seg / 2) * 0.92, 3.2);
  const labelW = Math.max(0.5, chord);
  const labelH = Math.min(1.25, labelW * 0.45);

  const texture = useMemo(
    () => (family ? makeLabelTexture(segment.label, family, labelW / labelH) : null),
    [family, segment.label, labelW, labelH],
  );
  useEffect(() => () => texture?.dispose(), [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const k = 1 - Math.pow(0.0001, delta);
    const ty = active ? 0.45 : 0;
    const ts = active ? 1.06 : 1;
    const tr = active ? 0.18 : 0;
    g.position.y += (ty - g.position.y) * k;
    const s = g.scale.x + (ts - g.scale.x) * k;
    g.scale.set(s, s, s);
    const r = Math.hypot(g.position.x, g.position.z);
    const nr = r + (tr - r) * k;
    g.position.x = Math.sin(theta) * nr;
    g.position.z = Math.cos(theta) * nr;
    if (mat.current) {
      const ti = active ? 0.35 : 0;
      mat.current.emissiveIntensity += (ti - mat.current.emissiveIntensity) * k;
    }
  });

  return (
    <group ref={group} rotation={[0, theta, 0]}>
      <mesh geometry={geometry} castShadow={false}>
        <meshLambertMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0} />
      </mesh>
      {texture && (
        <mesh position={[0, WEDGE_H + 0.01, labelR]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[labelW, labelH]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

const BEAM_ORIGIN = new THREE.Vector3(0, 1.35, 0);
const WALL_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 6.1);
const tmpTarget = new THREE.Vector3();
const tmpRay = new THREE.Raycaster();
const tmpNdc = new THREE.Vector2();

/** Translucent flickering cone from the hub to the projected screen on the wall. */
function Beam({ screenY, screenW }: { screenY: ScreenFn; screenW: ScreenFn }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    // Unit cone with apex at the origin, opening along +Y.
    const g = new THREE.ConeGeometry(1, 1, 28, 1, true);
    g.rotateX(Math.PI);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock, camera, size }) => {
    const m = ref.current;
    if (!m) return;
    // Aim at the wall point behind the DOM screen's center.
    const sy = screenY(size.width, size.height);
    const sw = screenW(size.width, size.height);
    tmpNdc.set(0, 1 - 2 * sy);
    tmpRay.setFromCamera(tmpNdc, camera);
    if (tmpRay.ray.intersectPlane(WALL_PLANE, tmpTarget)) {
      const len = tmpTarget.distanceTo(BEAM_ORIGIN);
      // Screen half-size on the wall, from the camera frustum at that depth.
      const cam = camera as THREE.PerspectiveCamera;
      const halfH = tmpTarget.distanceTo(cam.position) * Math.tan((cam.fov * Math.PI) / 360);
      const half = Math.max(0.6, halfH * cam.aspect * sw * 0.92);
      const halfV = Math.max(0.4, halfH * 0.38 * 0.95);
      m.position.copy(BEAM_ORIGIN);
      m.lookAt(tmpTarget);
      m.rotateX(Math.PI / 2);
      m.scale.set(half, len, halfV);
    }
    if (mat.current) {
      const t = clock.elapsedTime;
      mat.current.opacity =
        0.14 + Math.sin(t * 7.3) * 0.015 + Math.sin(t * 17.1) * 0.01 + (Math.sin(t * 1.3) > 0.97 ? -0.05 : 0);
    }
  });
  return (
    <mesh ref={ref} geometry={geometry}>
      <meshBasicMaterial
        ref={mat}
        color="#cfeaff"
        transparent
        opacity={0.14}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

const tmpHub = new THREE.Vector3();

/** Pins a DOM element (the hub's Import button) to the hub's projected screen position. */
function HubAnchor({ anchor }: { anchor: React.RefObject<HTMLDivElement | null> }) {
  useFrame(({ camera, size }) => {
    const el = anchor.current;
    if (!el) return;
    tmpHub.set(0, 1.45, 0).project(camera);
    const x = ((tmpHub.x + 1) / 2) * size.width;
    const y = ((1 - tmpHub.y) / 2) * size.height;
    el.style.setProperty('transform', `translate(${x}px, ${y}px) translate(-50%, -50%)`);
    el.style.setProperty('opacity', '1');
  });
  return null;
}

/** Pulls the camera back on narrow (portrait) viewports so the disk fits. */
function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const dist = aspect < 1 ? 1 + (1 - aspect) * 1.7 : aspect > 1.3 ? 0.88 : 1;
    camera.position.set(0, 9 * dist, 12 * dist);
    camera.lookAt(0, 2.2 + (dist - 1) * 2.2, -1);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function Scene({ segments, value, activeIndex, hubAnchor, screenY, screenW }: EventDialProps) {
  const disk = useRef<THREE.Group>(null);
  const family = useFontFamily();
  const count = Math.max(1, segments.length);
  const seg = (Math.PI * 2) / count;
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useFrame(() => {
    if (disk.current) disk.current.rotation.y = -valueRef.current * seg;
  });

  return (
    <>
      <CameraRig />
      <color attach="background" args={[PX.night]} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 9, 6]} intensity={1.6} />

      {/* wall */}
      <mesh position={[0, 6, -6.2]}>
        <planeGeometry args={[60, 14]} />
        <meshLambertMaterial color={PX.night} />
      </mesh>
      {/* wall skirting */}
      <mesh position={[0, 0.25, -6.1]}>
        <boxGeometry args={[60, 0.5, 0.2]} />
        <meshLambertMaterial color={PX.purple} />
      </mesh>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[60, 30]} />
        <meshLambertMaterial color={PX.wood} />
      </mesh>
      {/* floor rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, 0.3]}>
        <circleGeometry args={[4.4, 24]} />
        <meshLambertMaterial color={PX.cream} />
      </mesh>

      {/* turntable base */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[DISK_R + 0.25, DISK_R + 0.35, 0.4, 40]} />
        <meshLambertMaterial color={PX.ink} />
      </mesh>

      <group ref={disk} position={[0, 0.4, 0]}>
        {segments.map((s, i) => (
          <Wedge key={s.key} index={i} count={count} segment={s} active={i === activeIndex} family={family} />
        ))}
      </group>

      {/* front pointer */}
      <mesh position={[0, 0.55, DISK_R + 0.55]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.35, 0.35, 0.35]} />
        <meshLambertMaterial color={PX.red} />
      </mesh>

      {/* hub */}
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[HUB_R, HUB_R + 0.1, 0.9, 24]} />
        <meshLambertMaterial color={PX.paper} />
      </mesh>
      <mesh position={[0, 1.32, 0]}>
        <cylinderGeometry args={[HUB_R * 0.55, HUB_R * 0.6, 0.12, 16]} />
        <meshLambertMaterial color={PX.sky} emissive={PX.sky} emissiveIntensity={0.6} />
      </mesh>

      <Beam screenY={screenY} screenW={screenW} />
      <HubAnchor anchor={hubAnchor} />
    </>
  );
}

export default function EventDial(props: EventDialProps) {
  const [dpr] = useState(() =>
    typeof window === 'undefined' ? 0.3 : Math.min(window.devicePixelRatio || 1, 2) * 0.38,
  );
  return (
    <Canvas
      className="event-dial-canvas"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 40, near: 0.1, far: 80, position: [0, 8.2, 10.6] }}
      style={{ imageRendering: 'pixelated' }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
