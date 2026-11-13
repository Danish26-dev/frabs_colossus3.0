import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

const LIME = "#C7F000";
const EDGE = "#2E3329";

type Agent = {
  id: string;
  name: string;
  status: string;
  angle: number;
  shape: "octa" | "box" | "cyl" | "tetra" | "torus";
};

const AGENTS: Agent[] = [
  { id: "AG-01", name: "WATCHMAN", status: "TRIAGE", angle: -Math.PI / 2, shape: "octa" },
  { id: "AG-02", name: "DETECTIVE", status: "EVIDENCE", angle: -Math.PI / 2 + (2 * Math.PI) / 5, shape: "box" },
  { id: "AG-03", name: "JURIST", status: "RISK", angle: -Math.PI / 2 + (4 * Math.PI) / 5, shape: "cyl" },
  { id: "AG-04", name: "SCRIBE", status: "AUDIT", angle: -Math.PI / 2 + (6 * Math.PI) / 5, shape: "tetra" },
  { id: "AG-05", name: "CALLING AGENT", status: "ORCHESTRATION", angle: -Math.PI / 2 + (8 * Math.PI) / 5, shape: "torus" },
];

const R = 2.5;

function nodePos(a: Agent): [number, number, number] {
  return [Math.cos(a.angle) * R, Math.sin(a.angle) * R * 0.74, Math.sin(a.angle * 2) * 0.35];
}

function AgentGeometry({ shape }: { shape: Agent["shape"] }) {
  switch (shape) {
    case "octa":
      return <octahedronGeometry args={[0.34, 0]} />;
    case "box":
      return <boxGeometry args={[0.48, 0.48, 0.48]} />;
    case "cyl":
      return <cylinderGeometry args={[0.3, 0.3, 0.42, 6]} />;
    case "tetra":
      return <tetrahedronGeometry args={[0.42, 0]} />;
    default:
      return <torusGeometry args={[0.28, 0.09, 8, 24]} />;
  }
}

function AgentNode({ agent, index }: { agent: Agent; index: number }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const pos = useMemo(() => nodePos(agent), [agent]);

  useFrame((state, delta) => {
    if (mesh.current) {
      mesh.current.rotation.y += delta * 0.25;
      mesh.current.rotation.x += delta * 0.08;
    }
    if (group.current) {
      const t = state.clock.elapsedTime;
      group.current.position.z = pos[2] + Math.sin(t * 0.5 + index) * 0.06;
    }
  });

  return (
    <group ref={group} position={pos}>
      <mesh
        ref={mesh}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.15 : 1}
      >
        <AgentGeometry shape={agent.shape} />
        <meshStandardMaterial
          color="#0A0C07"
          metalness={0.92}
          roughness={0.3}
          emissive={LIME}
          emissiveIntensity={hovered ? 0.5 : 0.14}
        />
      </mesh>
      <mesh scale={hovered ? 1.16 : 1.01}>
        <AgentGeometry shape={agent.shape} />
        <meshBasicMaterial color={LIME} wireframe transparent opacity={hovered ? 0.5 : 0.22} />
      </mesh>

      <Html center distanceFactor={9} position={[0, -0.72, 0]} pointerEvents="none">
        <div className="w-40 -translate-y-1 select-none text-center">
          <div className="font-mono text-[10px] tracking-[0.18em] text-bone">{agent.name}</div>
          <div className="mt-0.5 flex items-center justify-center gap-1.5">
            <span
              className="frab-dot inline-block h-[3px] w-[3px] bg-lime"
              style={{ animationDelay: `${index * 0.4}s` }}
            />
            <span className="font-mono text-[8px] tracking-[0.22em] text-muted-foreground">
              {agent.status}
            </span>
          </div>
        </div>
      </Html>
    </group>
  );
}

function Connections() {
  const points = useMemo(
    () => AGENTS.map((a) => new THREE.Vector3(...nodePos(a))),
    [],
  );
  return (
    <group>
      {points.map((p, i) => (
        <Line
          key={`spoke-${i}`}
          points={[new THREE.Vector3(0, 0, 0), p]}
          color={LIME}
          lineWidth={1}
          transparent
          opacity={0.22}
        />
      ))}
      {points.map((p, i) => (
        <Line
          key={`ring-${i}`}
          points={[p, points[(i + 1) % points.length]!]}
          color={EDGE}
          lineWidth={1}
          transparent
          opacity={0.75}
        />
      ))}
    </group>
  );
}

function Particles() {
  const count = 30;
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        node: i % AGENTS.length,
        offset: Math.random(),
        speed: 0.12 + Math.random() * 0.18,
        inbound: i % 2 === 0,
      })),
    [],
  );

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    seeds.forEach((s, i) => {
      const target = nodePos(AGENTS[s.node]!);
      let k = (s.offset + t * s.speed) % 1;
      if (!s.inbound) k = 1 - k;
      dummy.position.set(target[0] * k, target[1] * k, target[2] * k);
      dummy.scale.setScalar(0.9 + Math.sin(t * 3 + i) * 0.25);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.032, 8, 8]} />
      <meshBasicMaterial color={LIME} transparent opacity={0.85} />
    </instancedMesh>
  );
}

function Core() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.06;
  });
  return (
    <group ref={ref}>
      <mesh>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial color="#070805" metalness={0.95} roughness={0.26} />
      </mesh>
      <mesh scale={1.005}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshBasicMaterial color={EDGE} wireframe transparent opacity={0.7} />
      </mesh>
      <mesh scale={1.55} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.95, 0.006, 6, 96]} />
        <meshBasicMaterial color={LIME} transparent opacity={0.45} />
      </mesh>
      <mesh scale={1.85} rotation={[Math.PI / 2.6, 0.4, 0]}>
        <torusGeometry args={[0.95, 0.004, 6, 96]} />
        <meshBasicMaterial color={LIME} transparent opacity={0.22} />
      </mesh>
      <pointLight position={[0, 0, 0]} color={LIME} intensity={2.6} distance={5} />
    </group>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  useFrame((_, delta) => {
    if (!group.current) return;
    const k = 1 - Math.exp(-3 * Math.min(delta, 0.05));
    group.current.rotation.y += (pointer.x * 0.22 - group.current.rotation.y) * k;
    group.current.rotation.x += (-pointer.y * 0.14 - group.current.rotation.x) * k;
  });
  return <group ref={group}>{children}</group>;
}

export default function InvestigationCore() {
  return (
    <Canvas
      camera={{ position: [0, 0, 9.4], fov: 44 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.14} color="#4A5A3A" />
      <directionalLight position={[-3, 5, -6]} intensity={1.1} color="#F1F0E8" />
      <directionalLight position={[5, -4, 4]} intensity={0.7} color={LIME} />
      <spotLight position={[0, 9, 2]} angle={0.5} penumbra={1} intensity={1.6} color="#DDE8C0" />
      <Rig>
        <Connections />
        <Particles />
        <Core />
        {AGENTS.map((a, i) => (
          <AgentNode key={a.id} agent={a} index={i} />
        ))}
        <Html center pointerEvents="none">
          <div className="select-none text-center leading-[1.15]">
            <div className="font-mono text-[11px] font-medium tracking-[0.34em] text-lime">FRAB</div>
            <div className="font-mono text-[8px] tracking-[0.3em] text-bone/70">INVESTIGATION</div>
            <div className="font-mono text-[8px] tracking-[0.3em] text-bone/70">CORE</div>
          </div>
        </Html>
      </Rig>
    </Canvas>
  );
}
