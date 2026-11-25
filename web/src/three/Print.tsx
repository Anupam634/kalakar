// Real-world props for the film: a marble plinth and a framed print of the product photo.
import { useEffect, useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { printTexture, type Demo } from "./textures";

export const BRASS = "#c9a26b";
/** Print size (4:5 like an Instagram post) and the height of its centre above the plinth. */
export const PRINT = { w: 1.44, h: 1.8, cy: 1.18 };

/** Dark marble plinth with a brass inlay ring. */
export function Plinth({ maps }: { maps: { map: THREE.Texture; roughnessMap: THREE.Texture; normalMap: THREE.Texture } }) {
  const geo = useMemo(() => {
    const p = [new THREE.Vector2(0, -0.5), new THREE.Vector2(1.2, -0.5), new THREE.Vector2(1.2, -0.03), new THREE.Vector2(1.185, -0.008), new THREE.Vector2(1.16, 0), new THREE.Vector2(0, 0)];
    return new THREE.LatheGeometry(p, 128);
  }, []);
  const ns = useMemo(() => new THREE.Vector2(0.4, 0.4), []);
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshPhysicalMaterial {...maps} color="#4a4743" roughness={0.9} clearcoat={0.5} clearcoatRoughness={0.25} normalScale={ns} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.03, 1.05, 128]} />
        <meshPhysicalMaterial color={BRASS} metalness={1} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** The product photo as a real print: brushed-brass frame, cotton mat, satin photo paper, easel leg. */
export function PhotoPrint({ demo }: { demo: Demo }) {
  // only the chosen product changes the photo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tex = useMemo(() => printTexture(demo), [demo.preset]);
  useEffect(() => () => tex.dispose(), [tex]);
  const { w, h, cy } = PRINT;
  const mat = 0.1;
  const frame = 0.07;
  return (
    <group position={[0, cy, 0]}>
      <RoundedBox args={[w + mat * 2 + frame * 2, h + mat * 2 + frame * 2, 0.06]} radius={0.012} smoothness={3} castShadow receiveShadow>
        <meshPhysicalMaterial color={BRASS} metalness={1} roughness={0.34} anisotropy={0.6} />
      </RoundedBox>
      <mesh position={[0, 0, 0.031]} receiveShadow>
        <planeGeometry args={[w + mat * 2, h + mat * 2]} />
        <meshStandardMaterial color="#efe9de" roughness={0.95} />
      </mesh>
      {/* bevelled mat edge */}
      <mesh position={[0, 0, 0.0315]}>
        <planeGeometry args={[w + 0.014, h + 0.014]} />
        <meshStandardMaterial color="#fbf8f2" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.033]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial map={tex} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.35} />
      </mesh>
      {/* easel leg behind */}
      <mesh position={[0, -0.25, -0.32]} rotation-x={0.42} castShadow>
        <boxGeometry args={[0.06, 1.5, 0.03]} />
        <meshStandardMaterial color="#1a1816" roughness={0.6} />
      </mesh>
    </group>
  );
}
