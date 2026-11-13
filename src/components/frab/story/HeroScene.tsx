import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Hero financial network (single WebGL canvas).
 *  - soft glowing points + hairline edges = accounts and their relationships
 *  - lime sparks                          = ordinary transaction flow
 *  - red dashed path + comet              = one suspicious transaction pathway
 *  - lime wireframe core + 5 satellites   = FRAB's intelligence layer and its specialist agents
 *  - faint star-dust                      = depth
 * Intro: points ignite -> edges draw -> sparks flow -> core appears -> pulse rings.
 * Deterministic (seeded) layout so it is identical on every load.
 */

const LIME = "#C7F000";
const CRITICAL = "#FF4A42";

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/* ------------------------------------------------------- glow point shader */

const VERT = /* glsl */ `
  attribute float aOrder;
  attribute float aSize;
  attribute float aTint;
  uniform float uProgress;
  uniform float uTime;
  uniform float uPx;
  varying float vTint;
  varying float vReveal;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float r = smoothstep(0.0, 1.0, clamp(uProgress * 1.6 - aOrder * 0.9, 0.0, 1.0));
    float pulse = 1.0 + 0.16 * sin(uTime * 1.6 + aOrder * 24.0);
    gl_PointSize = aSize * r * pulse * uPx * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vTint = aTint;
    vReveal = r;
  }
`;

const FRAG = /* glsl */ `
  uniform float uAlpha;
  varying float vTint;
  varying float vReveal;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float core = smoothstep(0.17, 0.09, d);
    float glow = pow(max(0.0, 1.0 - d * 2.0), 2.6);
    vec3 bone = vec3(0.79, 0.81, 0.75);
    vec3 lime = vec3(0.78, 0.94, 0.0);
    vec3 red = vec3(1.0, 0.29, 0.26);
    vec3 col = vTint < 0.5 ? bone : (vTint < 1.5 ? lime : red);
    float a = (core + glow * 0.6) * vReveal * uAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * (0.55 + core * 0.9), a);
  }
`;

function glowMaterial(alpha = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPx: { value: 1 },
      uAlpha: { value: alpha },
    },
  });
}

function setU(mat: THREE.ShaderMaterial, progress: number, time: number, px: number) {
  const u = mat.uniforms;
  u["uProgress"]!.value = progress;
  u["uTime"]!.value = time;
  u["uPx"]!.value = px;
}

function glowGeometry(
  positions: Float32Array,
  order: Float32Array,
  size: Float32Array,
  tint: Float32Array,
) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("aOrder", new THREE.BufferAttribute(order, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
  return g;
}

/* ----------------------------------------------------------------- layout */

function useNetwork(count: number) {
  return useMemo(() => {
    const rnd = mulberry(20260);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const r = 2.4 + rnd() * 4.0;
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      pts.push(
        new THREE.Vector3(
          r * Math.sin(ph) * Math.cos(th) * 1.15,
          r * Math.cos(ph) * 0.8,
          r * Math.sin(ph) * Math.sin(th) * 0.8,
        ),
      );
    }
    // each node links to its two nearest neighbours (deduped)
    const edgeSet = new Set<string>();
    const edges: [number, number][] = [];
    pts.forEach((p, i) => {
      pts
        .map((q, j) => ({ j, d: p.distanceTo(q) }))
        .filter((o) => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach(({ j }) => {
          const k = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (!edgeSet.has(k)) {
            edgeSet.add(k);
            edges.push([i, j]);
          }
        });
    });
    // suspicious path: greedy walk of 6 nodes starting from the left-most node
    const start = pts.reduce((b, p, i) => (p.x < pts[b]!.x ? i : b), 0);
    const used = new Set([start]);
    const path = [start];
    for (let s = 0; s < 5; s++) {
      const cur = pts[path[path.length - 1]!]!;
      let best = -1;
      let bd = Infinity;
      pts.forEach((q, j) => {
        if (used.has(j)) return;
        const d = cur.distanceTo(q) - (q.x - cur.x) * 0.35; // bias to move right
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      used.add(best);
      path.push(best);
    }
    const segs = new Float32Array(edges.length * 6);
    edges.forEach(([a, b], i) => {
      const pa = pts[a]!;
      const pb = pts[b]!;
      segs.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], i * 6);
    });
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(segs, 3));
    return { pts, edges, edgeGeo, path };
  }, [count]);
}

/* ------------------------------------------------------------------ scene */

const AGENT_COUNT = 5; // one satellite per specialist agent orbiting the Supervisor core

function Network({ low, reduced }: { low: boolean; reduced: boolean }) {
  const N = low ? 30 : 56;
  const M = low ? 30 : 72;
  const D = low ? 140 : 360;
  const { pts, edges, edgeGeo, path } = useNetwork(N);
  const { size, camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);
  const dust = useRef<THREE.Points>(null);
  const ring = useRef<THREE.Mesh>(null);
  const dash = useRef<any>(null);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const parentQ = useMemo(() => new THREE.Quaternion(), []);

  const pathPts = useMemo(() => path.map((i) => pts[i]!.clone()), [path, pts]);
  const pathCurve = useMemo(
    () => new THREE.CatmullRomCurve3(pathPts, false, "catmullrom", 0.2),
    [pathPts],
  );

  // ---- nodes (glow points)
  const nodes = useMemo(() => {
    const rnd = mulberry(5);
    const pos = new Float32Array(N * 3);
    const order = new Float32Array(N);
    const sz = new Float32Array(N);
    const tint = new Float32Array(N);
    pts.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3);
      order[i] = i / N;
      const onPath = path.includes(i);
      sz[i] = onPath ? 66 : 32 + rnd() * 24;
      tint[i] = onPath ? 2 : rnd() > 0.82 ? 1 : 0;
    });
    return { geo: glowGeometry(pos, order, sz, tint), mat: glowMaterial(1) };
  }, [N, pts, path]);

  // ---- transaction sparks (positions updated per frame)
  const sparks = useMemo(() => {
    const rnd = mulberry(77);
    const items = Array.from({ length: M }, () => ({
      e: Math.floor(rnd() * edges.length),
      t: rnd(),
      v: 0.12 + rnd() * 0.3,
      dir: rnd() > 0.5 ? 1 : -1,
    }));
    const geo = glowGeometry(
      new Float32Array(M * 3),
      new Float32Array(M),
      new Float32Array(M).fill(15),
      new Float32Array(M).fill(1),
    );
    return { items, geo, mat: glowMaterial(0.95) };
  }, [M, edges.length]);

  // ---- suspicious comet (head + fading trail)
  const comet = useMemo(() => {
    const K = 9;
    const sz = new Float32Array(K);
    const order = new Float32Array(K);
    const tint = new Float32Array(K).fill(2);
    for (let i = 0; i < K; i++) sz[i] = 56 * Math.pow(1 - i / K, 1.6) + 4;
    return { K, geo: glowGeometry(new Float32Array(K * 3), order, sz, tint), mat: glowMaterial(1) };
  }, []);

  // ---- agent satellites orbiting the core
  const sats = useMemo(() => {
    const pos = new Float32Array(AGENT_COUNT * 3);
    const order = new Float32Array(AGENT_COUNT);
    const sz = new Float32Array(AGENT_COUNT).fill(30);
    const tint = new Float32Array(AGENT_COUNT).fill(1);
    for (let i = 0; i < AGENT_COUNT; i++) {
      const a = (i / AGENT_COUNT) * Math.PI * 2;
      pos.set([Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25], i * 3);
    }
    return { geo: glowGeometry(pos, order, sz, tint), mat: glowMaterial(1) };
  }, []);

  // ---- one large soft glow at the core
  const halo = useMemo(
    () => ({
      geo: glowGeometry(
        new Float32Array(3),
        new Float32Array(1),
        new Float32Array([300]),
        new Float32Array([1]),
      ),
      mat: glowMaterial(0.42),
    }),
    [],
  );

  // ---- star-dust for depth
  const dustObj = useMemo(() => {
    const rnd = mulberry(909);
    const pos = new Float32Array(D * 3);
    const sz = new Float32Array(D);
    for (let i = 0; i < D; i++) {
      pos.set([(rnd() - 0.5) * 30, (rnd() - 0.5) * 18, -4 - rnd() * 14], i * 3);
      sz[i] = 6 + rnd() * 10;
    }
    return { geo: glowGeometry(pos, new Float32Array(D), sz, new Float32Array(D)), mat: glowMaterial(0.5) };
  }, [D]);

  const wide = size.width / size.height > 1.15;
  const offsetX = wide ? 3.6 : 0;

  useFrame((state, delta) => {
    const t = reduced ? 99 : state.clock.elapsedTime;
    const p = Math.min(1, Math.max(0, (t - 0.15) / 2.8));
    const px = gl.getPixelRatio();

    // pointer + scroll-linked camera
    mouse.current.x += (state.pointer.x - mouse.current.x) * 0.04;
    mouse.current.y += (state.pointer.y - mouse.current.y) * 0.04;
    const sy = typeof window === "undefined" ? 0 : Math.min(window.scrollY / window.innerHeight, 1.6);
    camera.position.x += (mouse.current.x * 0.7 - camera.position.x) * 0.05;
    camera.position.y += (mouse.current.y * 0.4 + 0.6 - sy * 0.8 - camera.position.y) * 0.05;
    camera.position.z += (9.5 + sy * 3.2 - camera.position.z) * 0.06;
    camera.lookAt(offsetX * 0.35, 0, 0);

    if (group.current) {
      group.current.position.x = offsetX;
      group.current.rotation.y += delta * 0.05 * (reduced ? 0 : 1);
      group.current.rotation.x = -0.18;
    }

    // shared uniforms
    const sparkReveal = smooth(p * 2 - 0.9);
    setU(nodes.mat, p, t, px);
    setU(sparks.mat, sparkReveal, t, px);
    setU(comet.mat, smooth(p * 2 - 1.0), t, px);
    setU(sats.mat, smooth(p * 2.2 - 1.2), t, px);
    setU(halo.mat, smooth(p * 2.2 - 1.2), t, px);
    setU(dustObj.mat, 1, t, px);

    // edges draw in
    edgeGeo.setDrawRange(0, Math.floor(edges.length * 2 * smooth(p * 1.5 - 0.3)));
    if (edgeMat.current) edgeMat.current.opacity = 0.55 * smooth(p * 2 - 0.2);

    // transaction sparks travel along edges
    const sp = sparks.geo.getAttribute("position") as THREE.BufferAttribute;
    sparks.items.forEach((q, i) => {
      q.t += delta * q.v * q.dir;
      if (q.t > 1) q.t -= 1;
      if (q.t < 0) q.t += 1;
      const [a, b] = edges[q.e]!;
      const pa = pts[a]!;
      const pb = pts[b]!;
      sp.setXYZ(i, pa.x + (pb.x - pa.x) * q.t, pa.y + (pb.y - pa.y) * q.t, pa.z + (pb.z - pa.z) * q.t);
    });
    sp.needsUpdate = true;

    // suspicious comet
    const cp = comet.geo.getAttribute("position") as THREE.BufferAttribute;
    const head = (t * 0.1) % 1;
    for (let i = 0; i < comet.K; i++) {
      const k = (((head - i * 0.014) % 1) + 1) % 1;
      const v = pathCurve.getPoint(k);
      cp.setXYZ(i, v.x, v.y, v.z);
    }
    cp.needsUpdate = true;
    if (dash.current?.material) {
      dash.current.material.dashOffset -= delta * 0.7;
      dash.current.material.opacity = smooth(p * 2 - 1) * 0.9;
    }

    // FRAB core appears last; satellites orbit it
    if (core.current) {
      const c = smooth(p * 2.2 - 1.2);
      core.current.scale.setScalar(Math.max(0.0001, c));
      core.current.rotation.y += delta * 0.35;
      core.current.rotation.x += delta * 0.12;
    }
    if (orbit.current) {
      orbit.current.rotation.y += delta * 0.7;
      orbit.current.rotation.z = Math.sin(t * 0.3) * 0.25;
    }
    // expanding pulse ring (billboarded)
    if (ring.current) {
      const k = (t % 4.2) / 4.2;
      const live = smooth(p * 2.2 - 1.2);
      ring.current.scale.setScalar(0.6 + k * 6.5);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k) * 0.5 * live;
      // billboard toward the camera in world space (parent group is tilted)
      if (ring.current.parent) {
        ring.current.parent.getWorldQuaternion(parentQ).invert();
        ring.current.quaternion.copy(parentQ).multiply(camera.quaternion);
      }
    }
    if (dust.current) dust.current.rotation.z += delta * 0.004;
  });

  return (
    <>
      {/* star-dust sits behind and does not follow the network group */}
      <points ref={dust} geometry={dustObj.geo} material={dustObj.mat} />
      <group ref={group}>
        <lineSegments geometry={edgeGeo}>
          <lineBasicMaterial
            ref={edgeMat}
            color="#94A57E"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>

        <points geometry={nodes.geo} material={nodes.mat} />
        <points geometry={sparks.geo} material={sparks.mat} frustumCulled={false} />

        <Line
          ref={dash}
          points={pathCurve.getPoints(80)}
          color={CRITICAL}
          lineWidth={1.4}
          dashed
          dashSize={0.2}
          gapSize={0.15}
          transparent
          opacity={0}
        />
        <points geometry={comet.geo} material={comet.mat} frustumCulled={false} />

        <group ref={core} scale={0.0001}>
          {/* soft radial glow behind the core */}
          <points geometry={halo.geo} material={halo.mat} frustumCulled={false} />
          <mesh>
            <icosahedronGeometry args={[0.66, 1]} />
            <meshBasicMaterial color={LIME} wireframe toneMapped={false} transparent opacity={0.9} />
          </mesh>
          <mesh>
            <icosahedronGeometry args={[0.4, 0]} />
            <meshStandardMaterial color="#0A0C07" metalness={0.9} roughness={0.25} emissive="#3a4a00" />
          </mesh>
          <mesh rotation={[Math.PI / 2.4, 0, 0]}>
            <torusGeometry args={[1.0, 0.012, 6, 96]} />
            <meshBasicMaterial color={LIME} toneMapped={false} transparent opacity={0.7} />
          </mesh>
          <mesh rotation={[Math.PI / 1.7, 0.6, 0]}>
            <torusGeometry args={[1.3, 0.008, 6, 96]} />
            <meshBasicMaterial color={LIME} toneMapped={false} transparent opacity={0.35} />
          </mesh>
          <group ref={orbit}>
            <points geometry={sats.geo} material={sats.mat} frustumCulled={false} />
          </group>
          <pointLight color={LIME} intensity={5} distance={7} />
        </group>

        <mesh ref={ring} position={[0, 0, 0]}>
          <ringGeometry args={[0.97, 1, 96]} />
          <meshBasicMaterial
            color={LIME}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </>
  );
}

export default function HeroScene({
  paused,
  low,
  reduced,
}: {
  paused: boolean;
  low: boolean;
  reduced: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 9.5], fov: 42 }}
      dpr={low ? [1, 1.25] : [1, 1.75]}
      frameloop={paused ? "never" : "always"}
      gl={{ antialias: !low, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.4} />
      <Network low={low} reduced={reduced} />
    </Canvas>
  );
}
