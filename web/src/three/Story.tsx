// The landing film: one continuous, photographically lit set; the camera travels along the
// "pipeline" as you scroll.
//   product on a marble plinth (x 0) -> posts fan out (x 4-8) -> voice (x 9) -> calendar (x 13) -> phone (x 19.5)
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, PerformanceMonitor, RoundedBox, useTexture } from "@react-three/drei";
import { EffectComposer, N8AO, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { CH, ease, measureStory, ramp, win } from "./story";
import { calendarTexture, feedTexture, heartTexture, phoneUiTexture, presetOf, reelTexture, slideTexture, type Demo } from "./textures";
import { BRASS, PRINT, PhotoPrint, Plinth } from "./Print";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = { v: 0 }; // scroll progress, sampled once per frame
const LOOK = V(0, 0.6, 0); // where the camera is aiming (also the depth-of-field focus)

const PRODUCT = V(0, 0, 0);
const STATION = [
  { pos: V(4.35, 1.35, 0.5), ry: 0.32 },
  { pos: V(5.9, 1.45, 0), ry: 0 },
  { pos: V(7.45, 1.35, 0.5), ry: -0.32 },
];
const CAL = V(13, -0.47, 0.2);
const TILES = [V(11.11, CAL.y + 0.05, CAL.z - 0.2), V(13.0, CAL.y + 0.05, CAL.z - 0.2), V(14.89, CAL.y + 0.05, CAL.z - 0.2)];
const PHONE = V(19.5, 1.25, 0);
const PHONE_RY = -0.22;

type Key = [number, THREE.Vector3, THREE.Vector3];
type Shot = [t: number, subj: THREE.Vector3, wide: [THREE.Vector3, THREE.Vector3], tall: [THREE.Vector3, THREE.Vector3]];
/** Camera path: subject, then [camera offset, aim offset] for wide and for portrait screens. */
const SHOTS: Shot[] = [
  [0.0, V(0, 1.0, 0), [V(0.7, 0.55, 6.2), V(-1.4, 0, 0)], [V(0.3, 0.6, 11.4), V(0, 3.0, 0)]],
  [0.13, V(0, 1.0, 0), [V(-2.2, 1.1, 5.4), V(-1.55, 0, 0)], [V(0.7, 1.2, 8.4), V(-0.5, -1.0, 0)]],
  [0.21, V(2.4, 1.1, 0), [V(0.4, 1.1, 7.8), V(-1.6, 0, 0)], [V(0.4, 1.3, 10.5), V(0, -1.0, 0)]],
  [0.3, V(5.9, 1.35, 0.3), [V(0, 0.55, 9.2), V(-2.3, 0, 0)], [V(0, 0.7, 12.8), V(0, -1.3, 0)]],
  [0.37, V(5.9, 1.35, 0.3), [V(0.4, 0.4, 8.6), V(-2.2, 0, 0)], [V(0.3, 0.5, 12.0), V(0, -1.3, 0)]],
  [0.46, V(8.6, 1.35, 0.5), [V(0.8, 0.35, 5.6), V(-1.6, 0, 0)], [V(0.2, 0.3, 8.6), V(-0.5, -1.1, 0)]],
  [0.54, V(10.6, 0.8, 0), [V(0, 2.6, 9.0), V(-1.6, 0, 0)], [V(0, 3.4, 12), V(0, -1, 0)]],
  [0.64, V(13, -0.4, 0.2), [V(0, 5.6, 7.4), V(-2.2, 0, 0)], [V(0, 9.5, 8.0), V(0, -1.6, 0)]],
  [0.71, V(13, -0.4, 0.2), [V(0.6, 5.2, 7.0), V(-2.1, 0, 0)], [V(0.4, 9.0, 7.6), V(0, -1.6, 0)]],
  [0.79, V(19.5, 1.25, 0), [V(-1.4, 0.35, 6.8), V(-1.5, 0, 0)], [V(-1.2, 0.3, 8.4), V(0, -1.1, 0)]],
  [0.88, V(19.5, 1.25, 0), [V(0.5, 0.2, 6.0), V(-1.4, 0, 0)], [V(0.4, 0.2, 7.6), V(0, -1.1, 0)]],
  [1.0, V(9.8, 0.2, 0), [V(0, 7.5, 21), V(0, 2.2, 0)], [V(0, 16, 34), V(0, -4, 0)]],
];
function keys(wide: boolean): Key[] {
  return SHOTS.map(([t, subj, w, h]) => {
    const [off, aim] = wide ? w : h;
    return [t, subj.clone().add(off), subj.clone().add(aim)];
  });
}

/**
 * Quality tier, decided once at load so we never recompile shaders mid-scroll:
 * 2 = dedicated GPU (depth of field, finer glass), 1 = laptop/phone GPU, 0 = software rendering.
 */
function gpuTier(): number {
  const forced = new URLSearchParams(location.search).get("tier");
  if (forced && /^[0-2]$/.test(forced)) return Number(forced);
  let name = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    name = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  } catch {
    /* ignore */
  }
  if (/swiftshader|llvmpipe|software/i.test(name)) return 0;
  if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900) return 1;
  if (/intel|radeon\(tm\) graphics|vega \d+ graphics|uhd|iris|mali|adreno|powervr/i.test(name)) return 1;
  return 2;
}

export default function Story({ demo, reduced, onReady }: { demo: Demo; reduced: boolean; onReady?: () => void }) {
  const [tier] = useState(gpuTier);
  const maxDpr = tier >= 2 ? 1.6 : tier === 1 ? 1.25 : 1;
  const [dpr, setDpr] = useState(maxDpr);
  return (
    <Canvas flat shadows="soft" dpr={dpr} camera={{ position: [0.7, 1.55, 6.2], fov: 38, near: 0.1, far: 120 }} gl={{ antialias: false, powerPreference: "high-performance" }}>
      {/* only resolution adapts at runtime (cheap); effects stay fixed */}
      <PerformanceMonitor onChange={({ factor }) => setDpr(Math.round(Math.min(maxDpr, 0.75 + factor * (maxDpr - 0.75)) * 20) / 20)} />
      <color attach="background" args={["#0b0b0a"]} />
      <fog attach="fog" args={["#0b0b0a", 9, 34]} />
      <Progress />
      <Rig reduced={reduced} />
      <Suspense fallback={null}>
        <Environment files="/hdr/studio.hdr" environmentIntensity={0.55} />
        <KeyLight tier={tier} />
        <Floor tier={tier} />
        <Product demo={demo} reduced={reduced} />
        <Cards demo={demo} />
        <Voice />
        <CalendarBoard />
        <Phone demo={demo} />
        <Hearts />
        <Labels demo={demo} />
        <Ready onReady={onReady} />
      </Suspense>
      <Effects tier={tier} />
    </Canvas>
  );
}

function Effects({ tier }: { tier: number }) {
  if (tier === 0)
    return (
      <EffectComposer multisampling={2}>
        <ToneMapping mode={ToneMappingMode.AGX} />
        <Vignette offset={0.3} darkness={0.55} />
      </EffectComposer>
    );
  if (tier === 1)
    return (
      <EffectComposer multisampling={2}>
        <N8AO aoRadius={0.55} intensity={1.6} distanceFalloff={0.8} halfRes quality="performance" />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <Vignette offset={0.28} darkness={0.6} />
      </EffectComposer>
    );
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.55} intensity={1.8} distanceFalloff={0.8} halfRes quality="medium" />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Noise opacity={0.035} blendFunction={BlendFunction.OVERLAY} />
      <Vignette offset={0.28} darkness={0.6} />
    </EffectComposer>
  );
}

function Progress() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    // shadows are drawn once per frame, not again for every extra glass pass
    gl.shadowMap.autoUpdate = false;
  }, [gl]);
  useFrame(() => {
    P.v = measureStory();
    gl.shadowMap.needsUpdate = true;
  }, -2);
  return null;
}

function Ready({ onReady }: { onReady?: () => void }) {
  const n = useRef(0);
  useFrame(() => {
    // wait a few frames so the transmission/reflection buffers are filled before fading in
    if (++n.current === 4) onReady?.();
  });
  return null;
}

/** Warm key light with real soft shadows; it follows the camera's subject along the set. */
function KeyLight({ tier }: { tier: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    l.position.set(LOOK.x - 4.5, 9, LOOK.z + 5.5);
    target.position.set(LOOK.x, 0, LOOK.z);
    target.updateMatrixWorld();
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight ref={light} target={target} intensity={2.4} color="#fff1dc" castShadow shadow-mapSize={tier >= 2 ? [2048, 2048] : [1024, 1024]} shadow-bias={-0.0003} shadow-normalBias={0.03}>
        <orthographicCamera attach="shadow-camera" args={[-8, 8, 8, -8, 1, 30]} />
      </directionalLight>
      <spotLight position={[3, 4, -5]} angle={0.7} penumbra={1} intensity={30} color="#f3d2a2" distance={18} />
      <spotLight position={[16, 5, -4]} angle={0.8} penumbra={1} intensity={40} color="#f3d2a2" distance={20} />
      <ambientLight intensity={0.05} />
    </>
  );
}

function Rig({ reduced }: { reduced: boolean }) {
  const { camera, size, scene } = useThree();
  const wide = size.width / size.height >= 0.85;
  const ks = useMemo(() => keys(wide), [wide]);
  const pc = useMemo(() => new THREE.CatmullRomCurve3(ks.map((k) => k[1]), false, "centripetal"), [ks]);
  const tc = useMemo(() => new THREE.CatmullRomCurve3(ks.map((k) => k[2]), false, "centripetal"), [ks]);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const tgt = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = wide ? 38 : 52;
    cam.updateProjectionMatrix();
  }, [camera, wide]);
  useFrame(({ pointer, clock }, dt) => {
    const p = P.v;
    let i = 0;
    while (i < ks.length - 2 && p > ks[i + 1]![0]) i++;
    const f = THREE.MathUtils.smoothstep((p - ks[i]![0]) / Math.max(1e-6, ks[i + 1]![0] - ks[i]![0]), 0, 1);
    const u = (i + f) / (ks.length - 1);
    pc.getPoint(u, pos);
    tc.getPoint(u, tgt);
    if (!reduced) {
      // mouse parallax + a barely-there handheld drift
      pos.x += pointer.x * 0.3 + Math.sin(clock.elapsedTime * 0.5) * 0.02;
      pos.y += pointer.y * 0.18 + Math.cos(clock.elapsedTime * 0.37) * 0.015;
    }
    const k = reduced ? 30 : 5;
    camera.position.set(THREE.MathUtils.damp(camera.position.x, pos.x, k, dt), THREE.MathUtils.damp(camera.position.y, pos.y, k, dt), THREE.MathUtils.damp(camera.position.z, pos.z, k, dt));
    LOOK.set(THREE.MathUtils.damp(LOOK.x, tgt.x, k, dt), THREE.MathUtils.damp(LOOK.y, tgt.y, k, dt), THREE.MathUtils.damp(LOOK.z, tgt.z, k, dt));
    camera.lookAt(LOOK);
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      const f2 = ramp(p, 0.86, 1);
      fog.near = 9 + 10 * f2;
      fog.far = 34 + (wide ? 34 : 50) * f2;
    }
  });
  return null;
}

// ---------------------------------------------------------------- floor: polished concrete

function useMaps(prefix: string, repeat: [number, number]) {
  const t = useTexture({ map: `/tex/${prefix}_diff.jpg`, roughnessMap: `/tex/${prefix}_rough.jpg`, normalMap: `/tex/${prefix}_nor.jpg` });
  useMemo(() => {
    t.map.colorSpace = THREE.SRGBColorSpace;
    for (const x of [t.map, t.roughnessMap, t.normalMap]) {
      x.wrapS = x.wrapT = THREE.RepeatWrapping;
      x.repeat.set(repeat[0], repeat[1]);
      x.anisotropy = 8;
    }
  }, [t, repeat]);
  return t;
}

const FLOOR_REPEAT: [number, number] = [22, 10];
const MARBLE_REPEAT: [number, number] = [2, 1];

function Floor({ tier }: { tier: number }) {
  const c = useMaps("concrete", FLOOR_REPEAT);
  const ns = useMemo(() => new THREE.Vector2(0.35, 0.35), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[10, -0.5, 0]} receiveShadow>
        <planeGeometry args={[90, 40]} />
        {/* sealed, polished concrete: the clearcoat picks up the studio lights without an extra mirror pass */}
        <meshPhysicalMaterial color="#2c2a27" map={c.map} roughnessMap={c.roughnessMap} normalMap={c.normalMap} normalScale={ns} roughness={0.85} clearcoat={tier >= 1 ? 0.55 : 0.3} clearcoatRoughness={0.28} envMapIntensity={0.9} />
      </mesh>
      {/* inlaid brass line connecting every station */}
      <mesh rotation-x={-Math.PI / 2} position={[9.75, -0.498, 1.6]}>
        <planeGeometry args={[19.5, 0.014]} />
        <meshPhysicalMaterial color={BRASS} metalness={1} roughness={0.3} />
      </mesh>
      {[0, 5.9, 13, 19.5].map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, -0.497, 1.6]}>
          <circleGeometry args={[0.06, 32]} />
          <meshPhysicalMaterial color={BRASS} metalness={1} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- product

function Product({ demo, reduced }: { demo: Demo; reduced: boolean }) {
  const marble = useMaps("marble", MARBLE_REPEAT);
  const sway = useRef<THREE.Group>(null);
  const bar = useRef<THREE.Mesh>(null);
  const band = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    // the framed photo turns gently so the light moves across the frame and paper
    if (sway.current) sway.current.rotation.y = reduced ? -0.16 : Math.sin(clock.elapsedTime * 0.32) * 0.2 - 0.14;
    const p = P.v;
    const s = win(p, CH.product[0], CH.product[1] + 0.01, 0.02);
    // the AI "scan": a polished brass rule sweeping down the photo
    const y = PRINT.cy + PRINT.h / 2 - ease(ramp(p, CH.product[0], CH.product[1])) * PRINT.h;
    if (bar.current) {
      bar.current.position.y = y;
      bar.current.visible = s > 0.01;
    }
    if (band.current) {
      band.current.position.y = y + 0.18;
      (band.current.material as THREE.MeshBasicMaterial).opacity = s * 0.16;
      band.current.visible = s > 0.01;
    }
  });
  return (
    <group position={PRODUCT}>
      <Plinth maps={marble} />
      <group ref={sway}>
        <PhotoPrint demo={demo} />
        <mesh ref={bar} position={[0, 0, 0.09]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.012, 0.012, PRINT.w + 0.5, 24]} />
          <meshPhysicalMaterial color={BRASS} metalness={1} roughness={0.15} />
        </mesh>
        <mesh ref={band} position={[0, 0, 0.05]}>
          <planeGeometry args={[PRINT.w, 0.36]} />
          <meshBasicMaterial color={BRASS} transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- post cards (printed, with paper edges)

function Card({ w, h, map, back = "#ece6db", front }: { w: number; h: number; map: THREE.Texture; back?: string; front?: RefObject<THREE.MeshPhysicalMaterial | null> }) {
  return (
    <group>
      <RoundedBox args={[w, h, 0.035]} radius={0.04} smoothness={4} castShadow>
        <meshPhysicalMaterial color={back} roughness={0.75} sheen={0.4} sheenColor="#ffffff" />
      </RoundedBox>
      <mesh position={[0, 0, 0.0181]}>
        <planeGeometry args={[w * 0.998, h * 0.998]} />
        <meshPhysicalMaterial ref={front} map={map} transparent roughness={0.38} clearcoat={0.35} clearcoatRoughness={0.3} emissive="#ffffff" emissiveMap={map} emissiveIntensity={0} />
      </mesh>
    </group>
  );
}

const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) => out.copy(a).lerp(b, t);

function Cards({ demo }: { demo: Demo }) {
  const feed = useMemo(() => feedTexture(demo), [demo]);
  const slides = useMemo(() => [0, 1, 2].map((i) => slideTexture(demo, i)), [demo]);
  const reel = useMemo(() => reelTexture(demo), [demo]);
  useEffect(() => () => [feed, reel, ...slides].forEach((t) => t.dispose()), [feed, reel, slides]);
  const refs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const reelFront = useRef<THREE.MeshPhysicalMaterial>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const start = useMemo(() => V(0, 1.1, 0), []);
  const screen = useMemo(() => PHONE.clone().add(V(Math.sin(PHONE_RY) * 0.105, -0.02, Math.cos(PHONE_RY) * 0.105)), []);
  const tileScale = [0.4, 0.4, 0.37];

  useFrame(({ clock }) => {
    const p = P.v;
    refs.forEach((r, k) => {
      const g = r.current;
      if (!g) return;
      const s0 = STATION[k]!;
      const a = ease(ramp(p, 0.2 + k * 0.022, 0.29 + k * 0.022));
      const b = ease(ramp(p, 0.545 + k * 0.025, 0.645 + k * 0.025));
      const c = k === 2 ? ease(ramp(p, 0.72, 0.8)) : 0;
      g.visible = a > 0.001;
      lerpV(start, s0.pos, a, tmp);
      let rx = 0;
      let ry = THREE.MathUtils.lerp(Math.PI * 1.5, s0.ry, a);
      let sc = THREE.MathUtils.lerp(0.05, 1, a);
      tmp.y += Math.sin(clock.elapsedTime * 0.9 + k) * 0.04 * a * (1 - b);
      if (k < 2) {
        const aside = ease(win(p, CH.voice[0] - 0.02, CH.voice[1], 0.03)) * (1 - b);
        tmp.z -= 1.6 * aside;
        tmp.x -= 0.5 * aside;
      }
      if (b > 0) {
        const from = tmp.clone();
        lerpV(from, TILES[k]!, b, tmp);
        tmp.y += Math.sin(b * Math.PI) * 1.4;
        rx = THREE.MathUtils.lerp(0, -Math.PI / 2, b);
        ry = THREE.MathUtils.lerp(s0.ry, 0, b);
        sc = THREE.MathUtils.lerp(1, tileScale[k]!, b);
      }
      if (c > 0) {
        const from = tmp.clone();
        lerpV(from, screen, c, tmp);
        tmp.y += Math.sin(c * Math.PI) * 1.2;
        rx = THREE.MathUtils.lerp(-Math.PI / 2, 0, c);
        ry = THREE.MathUtils.lerp(0, PHONE_RY, c);
        sc = THREE.MathUtils.lerp(tileScale[k]!, 1.1, c);
      }
      g.position.copy(tmp);
      g.rotation.set(rx, ry, 0, "YXZ");
      g.scale.setScalar(sc);
    });
    // once docked, the reel becomes a lit screen
    if (reelFront.current) reelFront.current.emissiveIntensity = ease(ramp(p, 0.77, 0.81)) * 0.85;
  });

  return (
    <>
      <group ref={refs[0]}>
        <Card w={1.6} h={2.0} map={feed} />
      </group>
      <group ref={refs[1]}>
        {slides
          .map((t, i) => (
            <group key={i} position={[i * 0.16, i * 0.05, -i * 0.09]} rotation-z={i * -0.03}>
              <Card w={1.6} h={2.0} map={t} back="#ddd5c6" />
            </group>
          ))
          .reverse()}
      </group>
      <group ref={refs[2]}>
        <Card w={1.2} h={2.13} map={reel} back="#151412" front={reelFront} />
      </group>
    </>
  );
}

// ---------------------------------------------------------------- voice

function Voice() {
  const N = 26;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const m = useMemo(() => new THREE.Object3D(), []);
  const x0 = STATION[2]!.pos.x + 0.9;
  useFrame(({ clock }) => {
    const amp = win(P.v, CH.voice[0] - 0.03, CH.voice[1] + 0.02, 0.03);
    const t = clock.elapsedTime;
    if (!mesh.current) return;
    for (let i = 0; i < N; i++) {
      const env = Math.sin((i / (N - 1)) * Math.PI);
      const h = 0.04 + amp * env * (0.35 + 0.65 * Math.abs(Math.sin(t * 5.2 + i * 0.55) * Math.cos(t * 2.1 + i * 0.27)));
      m.position.set(x0 + i * 0.055, STATION[2]!.pos.y, STATION[2]!.pos.z);
      m.scale.set(1, h * 0.9 + 0.001, 1);
      m.updateMatrix();
      mesh.current.setMatrixAt(i, m.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.visible = amp > 0.01;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N]} castShadow>
      <cylinderGeometry args={[0.014, 0.014, 1, 12]} />
      <meshPhysicalMaterial color={BRASS} metalness={1} roughness={0.22} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------- calendar: a printed board on a slab

function CalendarBoard() {
  const tex = useMemo(calendarTexture, []);
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const a = ease(ramp(P.v, 0.5, 0.58));
    if (g.current) {
      g.current.position.y = CAL.y - 0.4 * (1 - a);
      g.current.visible = a > 0.001 || P.v > 0.58;
    }
  });
  return (
    <group ref={g} position={CAL}>
      <RoundedBox args={[7.1, 0.08, 4.4]} radius={0.035} smoothness={4} position={[0, -0.03, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#151513" roughness={0.55} clearcoat={0.3} clearcoatRoughness={0.4} />
      </RoundedBox>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0115, 0]} receiveShadow>
        <planeGeometry args={[7, 4.3]} />
        <meshStandardMaterial map={tex} bumpMap={tex} bumpScale={1.5} roughness={0.85} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- phone: gold titanium frame, glass front

function Phone({ demo }: { demo: Demo }) {
  const name = presetOf(demo).name;
  const ui = useMemo(() => phoneUiTexture(name), [name]);
  useEffect(() => () => ui.dispose(), [ui]);
  const uiMat = useRef<THREE.MeshBasicMaterial>(null);
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const p = P.v;
    if (uiMat.current) uiMat.current.opacity = ease(ramp(p, 0.79, 0.83));
    if (g.current) {
      g.current.position.y = PHONE.y + Math.sin(clock.elapsedTime * 0.8) * 0.03;
      g.current.visible = p > 0.6;
    }
  });
  return (
    <group ref={g} position={PHONE} rotation-y={PHONE_RY}>
      <RoundedBox args={[1.56, 3.1, 0.13]} radius={0.21} smoothness={8} position={[0, 0, -0.012]} castShadow>
        <meshPhysicalMaterial color="#b8925f" metalness={1} roughness={0.32} anisotropy={0.7} />
      </RoundedBox>
      {[0.55, 0.25].map((y) => (
        <RoundedBox key={y} args={[0.03, 0.22, 0.05]} radius={0.012} position={[-0.79, y, -0.01]}>
          <meshPhysicalMaterial color="#b8925f" metalness={1} roughness={0.3} />
        </RoundedBox>
      ))}
      <RoundedBox args={[1.5, 3.04, 0.15]} radius={0.2} smoothness={8}>
        <meshPhysicalMaterial color="#060606" roughness={0.12} metalness={0.1} />
      </RoundedBox>
      <mesh position={[0, 0, 0.0765]}>
        <planeGeometry args={[1.38, 2.9]} />
        <meshBasicMaterial color="#020202" />
      </mesh>
      <mesh position={[0, 1.33, 0.079]}>
        <planeGeometry args={[0.36, 0.09]} />
        <meshBasicMaterial color="#000" />
      </mesh>
      <mesh position={[0, -0.2, 0.128]} renderOrder={5}>
        <planeGeometry args={[1.36, 2.42]} />
        <meshBasicMaterial ref={uiMat} map={ui} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Hearts() {
  const tex = useMemo(heartTexture, []);
  const N = 9;
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(({ clock }) => {
    const on = win(P.v, 0.81, 0.9, 0.02);
    refs.current.forEach((s, k) => {
      if (!s) return;
      const t = (clock.elapsedTime * 0.32 + k / N) % 1;
      s.position.set(PHONE.x + 0.95 + Math.sin(k * 2.3 + t * 3) * 0.18, PHONE.y - 0.9 + t * 2.6, PHONE.z + 0.35);
      const sc = 0.12 + (k % 3) * 0.035;
      s.scale.set(sc, sc, sc);
      (s.material as THREE.SpriteMaterial).opacity = on * Math.sin(t * Math.PI);
      s.visible = on > 0.01;
    });
  });
  return (
    <>
      {Array.from({ length: N }, (_, k) => (
        <sprite key={k} ref={(r) => (refs.current[k] = r)}>
          <spriteMaterial map={tex} transparent opacity={0} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- labels pinned to objects

function Label({ at, show, children, tone = "dark" }: { at: [number, number, number]; show: (p: number) => number; children: ReactNode; tone?: "dark" | "brass" }) {
  const el = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const o = show(P.v);
    if (el.current) {
      el.current.style.opacity = String(o);
      el.current.style.transform = `translateY(${(1 - o) * 8}px)`;
      el.current.style.visibility = o < 0.01 ? "hidden" : "visible";
    }
  });
  return (
    <Html position={at} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div
        ref={el}
        style={{ opacity: 0 }}
        className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${tone === "brass" ? "bg-brass text-ink" : "border border-white/15 bg-[#0f0f0e]/85 text-paper backdrop-blur-sm"}`}
      >
        {children}
      </div>
    </Html>
  );
}

function Labels({ demo }: { demo: Demo }) {
  const [a, b] = CH.product;
  const s = STATION.map((x) => x.pos);
  return (
    <>
      <Label at={[0, 2.85, 0]} show={(p) => win(p, 0.06, b)} tone="brass">
        Your product photo
      </Label>
      <Label at={[-1.4, 2.1, 0.3]} show={(p) => win(p, a + 0.02, b)}>
        Price · {demo.price}
      </Label>
      <Label at={[-1.55, 1.45, 0.3]} show={(p) => win(p, a + 0.035, b)}>
        Tone · warm, premium
      </Label>
      <Label at={[-1.4, 0.8, 0.3]} show={(p) => win(p, a + 0.05, b)}>
        Audience · 25–40, gifting
      </Label>
      <Label at={[s[0]!.x, s[0]!.y + 1.32, s[0]!.z]} show={(p) => win(p, 0.29, CH.design[1])}>
        Feed post
      </Label>
      <Label at={[s[1]!.x + 0.15, s[1]!.y + 1.38, s[1]!.z]} show={(p) => win(p, 0.31, CH.design[1])}>
        Carousel · 5 slides
      </Label>
      <Label at={[s[2]!.x, s[2]!.y + 1.38, s[2]!.z]} show={(p) => win(p, 0.33, CH.voice[1])}>
        Reel · 15 s
      </Label>
      <Label at={[s[2]!.x + 1.6, s[2]!.y + 0.75, s[2]!.z]} show={(p) => win(p, CH.voice[0], CH.voice[1])} tone="brass">
        Voiceover
      </Label>
      {[
        ["हिन्दी", 0.95, 1.95],
        ["English", 2.3, 2.5],
        ["தமிழ்", 1.2, -0.65],
        ["Hinglish", 2.2, -0.35],
      ].map(([t, dx, dy], i) => (
        <Label key={t as string} at={[s[2]!.x + (dx as number), s[2]!.y + (dy as number) * 0.5, s[2]!.z]} show={(p) => win(p, CH.voice[0] + 0.01 + i * 0.008, CH.voice[1])}>
          {t}
        </Label>
      ))}
      {["Tue · 7:00 PM", "Thu · 7:00 PM", "Sat · 11:00 AM"].map((t, i) => (
        <Label key={t} at={[TILES[i]!.x, TILES[i]!.y + 0.55, TILES[i]!.z]} show={(p) => win(p, 0.63 + i * 0.012, CH.plan[1])} tone={i === 2 ? "brass" : "dark"}>
          {t}
        </Label>
      ))}
      <Label at={[PHONE.x, PHONE.y + 1.95, PHONE.z]} show={(p) => win(p, 0.8, CH.post[1])} tone="brass">
        Posted on Instagram · 11:00 AM
      </Label>
      {[
        ["1 · Your product", 0],
        ["2 · Posts made", 5.9],
        ["3 · Calendar", 13],
        ["4 · Live", 19.5],
      ].map(([t, x]) => (
        <Label key={t as string} at={[x as number, -0.2, 2.2]} show={(p) => win(p, CH.end[0], 1.2)}>
          {t}
        </Label>
      ))}
    </>
  );
}
