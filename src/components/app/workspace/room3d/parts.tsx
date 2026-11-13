import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AgentId, AgentRuntime } from "../../../../lib/frab-investigation";

export const C = {
  obsidian: "#090A08",
  surface: "#121410",
  edge: "#292D26",
  lime: "#C7F000",
  green: "#7DFF4D",
  bone: "#F1F0E8",
  grey: "#858A7D",
  red: "#FF3B30",
  amber: "#FFB020",
};

export type StationTone = "idle" | "queued" | "active" | "complete" | "error";

export function toneOf(state: AgentRuntime["state"]): StationTone {
  if (state === "COMPLETE") return "complete";
  if (state === "ERROR") return "error";
  if (state === "IDLE") return "idle";
  if (state === "QUEUED") return "queued";
  return "active";
}

export function toneColor(t: StationTone) {
  if (t === "active") return C.lime;
  if (t === "complete") return C.green;
  if (t === "error") return C.red;
  if (t === "queued") return C.amber;
  return C.grey;
}

function emissiveIntensity(t: StationTone) {
  if (t === "active") return 1.5;
  if (t === "complete") return 0.55;
  if (t === "error") return 0.9;
  if (t === "queued") return 0.35;
  return 0.08;
}

/* ------------------------------------------------------------------ pieces */

function Desk({ tone }: { tone: StationTone }) {
  return (
    <group>
      {/* top */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.08, 1.05]} />
        <meshStandardMaterial color="#262B20" roughness={0.55} metalness={0.35} />
      </mesh>
      {/* front fascia with light strip */}
      <mesh position={[0, 0.45, 0.5]} castShadow>
        <boxGeometry args={[2.5, 0.5, 0.07]} />
        <meshStandardMaterial color="#1B1F17" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.28, 0.545]}>
        <boxGeometry args={[2.15, 0.03, 0.02]} />
        <meshStandardMaterial
          color={toneColor(tone)}
          emissive={toneColor(tone)}
          emissiveIntensity={emissiveIntensity(tone)}
          toneMapped={false}
        />
      </mesh>
      {/* legs */}
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 0.35, -0.35]} castShadow>
          <boxGeometry args={[0.1, 0.7, 0.1]} />
          <meshStandardMaterial color={C.surface} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function ScreenBars({ tone, seed }: { tone: StationTone; seed: number }) {
  const group = useRef<THREE.Group>(null);
  const color = toneColor(tone);
  const bars = useMemo(() => [0, 1, 2, 3, 4, 5], []);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.children.forEach((child, i) => {
      const base = tone === "active" ? 0.55 : tone === "complete" ? 0.45 : 0.2;
      const wave = tone === "active" ? 0.42 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.3 + seed)) : 0.06;
      child.scale.x = base + wave;
      child.position.x = -0.34 + (base + wave) * 0.34;
    });
  });

  return (
    <group ref={group} position={[0, 0, 0.012]}>
      {bars.map((i) => (
        <mesh key={i} position={[-0.3, 0.19 - i * 0.075, 0]}>
          <planeGeometry args={[0.68, 0.028]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={tone === "idle" ? 0.18 : 0.85}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Monitor({
  tone,
  position,
  rotation = [0, 0, 0],
  scale = 1,
  seed = 0,
  caption,
}: {
  tone: StationTone;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  seed?: number;
  caption?: string;
}) {
  const color = toneColor(tone);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[0.1, 0.12, 0.1]} />
        <meshStandardMaterial color={C.surface} metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.86, 0.56, 0.05]} />
        <meshStandardMaterial color={C.edge} metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.42, 0.028]}>
        <planeGeometry args={[0.78, 0.48]} />
        <meshBasicMaterial color={C.obsidian} toneMapped={false} />
      </mesh>
      <group position={[0, 0.42, 0.032]}>
        <ScreenBars tone={tone} seed={seed} />
      </group>
      {/* screen glow */}
      <mesh position={[0, 0.42, 0.031]}>
        <planeGeometry args={[0.78, 0.48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={tone === "active" ? 0.1 : tone === "idle" ? 0.02 : 0.05}
          toneMapped={false}
        />
      </mesh>
      {caption ? (
        <Html
          position={[0, 0.74, 0]}
          center
          distanceFactor={11}
          pointerEvents="none"
          zIndexRange={[4, 0]}
        >
          <span
            className="whitespace-nowrap font-mono text-[7px] tracking-[0.2em]"
            style={{ color: tone === "idle" ? C.grey : color, opacity: tone === "idle" ? 0.6 : 1 }}
          >
            {caption}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

function Chair() {
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.5, 0.07, 0.48]} />
        <meshStandardMaterial color={C.surface} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.68, 0.24]} castShadow>
        <boxGeometry args={[0.48, 0.46, 0.07]} />
        <meshStandardMaterial color={C.surface} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
        <meshStandardMaterial color={C.edge} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.28, 0.3, 0.05, 10]} />
        <meshStandardMaterial color={C.edge} metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Low-poly seated analyst. Idle breathing; typing + monitor-glance when active. */
function Agent({ tone }: { tone: StationTone }) {
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const color = toneColor(tone);
  const active = tone === "active";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (torso.current) {
      torso.current.rotation.x = active
        ? -0.12 + Math.sin(t * 1.6) * 0.012
        : Math.sin(t * 0.9) * 0.015;
    }
    if (head.current) {
      head.current.rotation.y = active ? Math.sin(t * 0.7) * 0.12 : Math.sin(t * 0.35) * 0.2;
      head.current.rotation.x = active ? -0.16 : 0;
    }
    const type = (phase: number) =>
      active ? -1.15 + Math.sin(t * 9 + phase) * 0.12 : -0.75 + Math.sin(t * 1.1 + phase) * 0.02;
    if (armL.current) armL.current.rotation.x = type(0);
    if (armR.current) armR.current.rotation.x = type(1.7);
  });

  const skin = "#3A3F35";

  return (
    <group position={[0, 0.49, 0]}>
      {/* thighs */}
      <mesh position={[0, 0.02, -0.16]} castShadow>
        <boxGeometry args={[0.38, 0.14, 0.44]} />
        <meshStandardMaterial color={C.surface} roughness={0.9} />
      </mesh>
      {/* shins */}
      <mesh position={[0, -0.2, -0.36]} castShadow>
        <boxGeometry args={[0.32, 0.4, 0.14]} />
        <meshStandardMaterial color={C.obsidian} roughness={0.95} />
      </mesh>
      <group ref={torso} position={[0, 0.09, 0]}>
        <mesh position={[0, 0.24, 0]} castShadow>
          <boxGeometry args={[0.42, 0.44, 0.28]} />
          <meshStandardMaterial color={skin} roughness={0.8} metalness={0.1} />
        </mesh>
        {/* badge strip */}
        <mesh position={[0, 0.3, -0.145]}>
          <planeGeometry args={[0.18, 0.045]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={active ? 1 : 0.5} />
        </mesh>
        <mesh ref={head} position={[0, 0.62, -0.02]} castShadow>
          <boxGeometry args={[0.24, 0.26, 0.24]} />
          <meshStandardMaterial color="#4B5145" roughness={0.75} />
        </mesh>
        <group ref={armL} position={[-0.26, 0.4, 0]}>
          <mesh position={[0, 0, -0.2]} castShadow>
            <boxGeometry args={[0.12, 0.12, 0.44]} />
            <meshStandardMaterial color={skin} roughness={0.85} />
          </mesh>
        </group>
        <group ref={armR} position={[0.26, 0.4, 0]}>
          <mesh position={[0, 0, -0.2]} castShadow>
            <boxGeometry args={[0.12, 0.12, 0.44]} />
            <meshStandardMaterial color={skin} roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Small evidence tiles that materialise around the Detective desk. */
export function EvidenceTiles({
  ids,
  onSelect,
}: {
  ids: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <group>
      {ids.slice(0, 6).map((id, i) => (
        <EvidenceTile
          key={id}
          id={id}
          index={i}
          position={[-1.5 + (i % 3) * 0.55, 0.95 + Math.floor(i / 3) * 0.42, 0.72]}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

function EvidenceTile({
  id,
  index,
  position,
  onSelect,
}: {
  id: string;
  index: number;
  position: [number, number, number];
  onSelect: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const born = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (born.current === null) born.current = t;
    if (!ref.current) return;
    const age = Math.min(1, (t - born.current) / 0.5);
    const s = 0.6 + 0.4 * age;
    ref.current.scale.setScalar(hover ? s * 1.14 : s);
    ref.current.position.y = position[1] + Math.sin(t * 1.2 + index) * 0.02;
    const mat = (ref.current.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    mat.opacity = 0.22 * age + (hover ? 0.2 : 0);
  });

  return (
    <group
      ref={ref}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      <mesh>
        <planeGeometry args={[0.46, 0.3]} />
        <meshBasicMaterial color={C.lime} transparent opacity={0.22} toneMapped={false} />
      </mesh>
      <Html center distanceFactor={11} pointerEvents="none" zIndexRange={[4, 0]}>
        <span className="whitespace-nowrap font-mono text-[7px] tracking-[0.18em] text-lime">
          {id}
        </span>
      </Html>
    </group>
  );
}

/* ---------------------------------------------------------------- station */

export interface StationProps {
  id: AgentId;
  position: [number, number, number];
  rotationY: number;
  tone: StationTone;
  statusLabel: string;
  task: string;
  selected: boolean;
  speaking?: boolean;
  onSelect: (id: AgentId) => void;
  monitors: string[];
  children?: React.ReactNode;
}

export function Station({
  id,
  position,
  rotationY,
  tone,
  statusLabel,
  selected,
  speaking = false,
  onSelect,
  monitors,
  children,
}: StationProps) {
  const [hover, setHover] = useState(false);
  const light = useRef<THREE.PointLight>(null);
  const color = toneColor(tone);
  const active = tone === "active" || speaking;

  useFrame(({ clock }) => {
    if (!light.current) return;
    const t = clock.getElapsedTime();
    const base = active ? 5.5 : tone === "complete" ? 1.4 : 0.25;
    light.current.intensity = base + (active ? Math.sin(t * 2.2) * 0.7 : 0);
  });

  const count = monitors.length;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* interaction pad + zone plate */}
      <mesh
        position={[0, 0.015, -0.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(id);
        }}
      >
        <planeGeometry args={[3.4, 3.2]} />
        <meshStandardMaterial
          color={selected || hover ? color : C.surface}
          transparent
          opacity={selected ? 0.22 : hover ? 0.14 : active ? 0.1 : 0.05}
          roughness={0.9}
        />
      </mesh>

      {/* zone outline */}
      <lineSegments position={[0, 0.02, -0.1]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(3.4, 3.2)]} />
        <lineBasicMaterial
          color={active || selected ? color : C.edge}
          transparent
          opacity={active || selected ? 0.9 : 0.5}
        />
      </lineSegments>

      <Desk tone={tone} />
      <group position={[0, 0, -0.75]}>
        <Chair />
        <Agent tone={tone} />
      </group>

      {monitors.map((cap, i) => {
        const spread = count === 1 ? 0 : (i - (count - 1) / 2) * 0.95;
        const yaw = -spread * 0.22;
        return (
          <Monitor
            key={cap}
            tone={tone}
            caption={cap}
            seed={i * 2.1}
            position={[spread, 0.78, -0.16]}
            rotation={[0, yaw, 0]}
            scale={count > 2 ? 0.88 : 1}
          />
        );
      })}

      {/* keyboard */}
      <mesh position={[0, 0.79, 0.24]} castShadow>
        <boxGeometry args={[0.66, 0.03, 0.24]} />
        <meshStandardMaterial color={C.obsidian} roughness={0.9} />
      </mesh>

      <pointLight
        ref={light}
        position={[0, 1.5, 0.2]}
        color={color}
        distance={6}
        decay={2}
        intensity={0.3}
      />

      {/* station label */}
      <Html
        position={[0, 0.06, 1.5]}
        center
        distanceFactor={12}
        pointerEvents="none"
        zIndexRange={[5, 0]}
      >
        <div className="select-none text-center">
          <div
            className="whitespace-nowrap font-mono text-[10px] tracking-[0.26em]"
            style={{ color: active || selected ? color : C.bone }}
          >
            {id}
          </div>
          <div
            className="mt-0.5 whitespace-nowrap font-mono text-[8px] tracking-[0.2em]"
            style={{ color: tone === "idle" ? C.grey : color }}
          >
            {statusLabel}
          </div>
        </div>
      </Html>

      {children}
    </group>
  );
}

/* --------------------------------------------------------------- pathways */

export function Pathway({
  from,
  to,
  active,
  done,
}: {
  from: [number, number];
  to: [number, number];
  active: boolean;
  done: boolean;
}) {
  const pulse = useRef<THREE.Mesh>(null);
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const mid: [number, number, number] = [from[0] + dx / 2, 0.012, from[1] + dz / 2];

  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const t = (clock.getElapsedTime() * 0.55) % 1;
    pulse.current.position.x = -len / 2 + len * t;
    const m = pulse.current.material as THREE.MeshBasicMaterial;
    m.opacity = active ? 0.85 * Math.sin(Math.PI * t) : 0;
  });

  const color = active ? C.lime : done ? C.green : C.edge;

  return (
    <group position={mid} rotation={[-Math.PI / 2, 0, -angle]}>
      <mesh>
        <planeGeometry args={[len, 0.1]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={active ? 0.5 : done ? 0.3 : 0.14}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={pulse}>
        <planeGeometry args={[0.9, 0.14]} />
        <meshBasicMaterial color={C.lime} transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}
