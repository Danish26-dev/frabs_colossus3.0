import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  type AgentId,
  type AgentRuntime,
  type Evidence,
  type RunStatus,
} from "../../../../lib/frab-investigation";
import { C, EvidenceTiles, Pathway, Station, toneColor, toneOf } from "./parts";

/** The Supervisor is not a desk — it is the orb at the centre of the floor. */
export const FLOOR_AGENTS: AgentId[] = ["WATCHMAN", "DETECTIVE", "JURIST", "SCRIBE"];

const LAYOUT: Record<AgentId, { pos: [number, number]; rotY: number; monitors: string[] }> = {
  SUPERVISOR: { pos: [0, 0.9], rotY: 0, monitors: [] },
  WATCHMAN: { pos: [-4.8, -1.6], rotY: Math.PI / 2.6, monitors: ["ALERT", "BASELINE"] },
  DETECTIVE: { pos: [-4.8, 3.2], rotY: Math.PI / 2.2, monitors: ["HISTORY", "KYC", "BENEFICIARY", "NETWORK"] },
  JURIST: { pos: [4.8, 3.2], rotY: -Math.PI / 2.2, monitors: ["REGULATION", "EXPOSURE"] },
  SCRIBE: { pos: [4.8, -1.6], rotY: -Math.PI / 2.6, monitors: ["CASE FILE", "AUDIT TRAIL"] },
};

const CONSOLE_POS: [number, number] = [0, 0.9];

export type FocusTarget = AgentId | "CENTER";

function statusLabel(rt: AgentRuntime): string {
  switch (rt.state) {
    case "COMPLETE":
      return "✓ COMPLETE";
    case "ACTIVE":
    case "QUERYING":
    case "ANALYZING":
      return rt.task || rt.state;
    case "QUEUED":
      return "QUEUED";
    case "ERROR":
      return "ERROR";
    default:
      return "STANDBY";
  }
}

/* -------------------------------------------------------------- environment */

function Floor() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(18, 18, C.edge, C.edge);
    const m = g.material as THREE.Material;
    m.transparent = true;
    m.opacity = 0.22;
    return g;
  }, []);

  return (
    <group>
      <mesh position={[0, -0.35, 0]} receiveShadow>
        <boxGeometry args={[19, 0.7, 15]} />
        <meshStandardMaterial color={C.obsidian} roughness={0.95} metalness={0.15} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[19, 15]} />
        <meshStandardMaterial color="#0C0E0B" roughness={0.85} metalness={0.25} />
      </mesh>
      <primitive object={grid} position={[0, 0.004, 0]} />
      {[
        { p: [0, 0.02, 7.5] as [number, number, number], a: [19, 0.06] },
        { p: [0, 0.02, -7.5] as [number, number, number], a: [19, 0.06] },
      ].map((s, i) => (
        <mesh key={i} position={s.p} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[s.a[0]!, s.a[1]!]} />
          <meshBasicMaterial color={C.lime} transparent opacity={0.25} toneMapped={false} />
        </mesh>
      ))}
      {[-9.5, 9.5].map((x) => (
        <mesh key={x} position={[x, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.06, 15]} />
          <meshBasicMaterial color={C.lime} transparent opacity={0.25} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, -7.6]} receiveShadow>
        <boxGeometry args={[19, 3.2, 0.25]} />
        <meshStandardMaterial color="#0B0D0A" roughness={0.95} />
      </mesh>
      <mesh position={[-9.6, 1.6, 0]} receiveShadow>
        <boxGeometry args={[0.25, 3.2, 15]} />
        <meshStandardMaterial color="#0B0D0A" roughness={0.95} />
      </mesh>
      <mesh position={[0, 2.6, -7.45]}>
        <planeGeometry args={[17, 0.04]} />
        <meshBasicMaterial color={C.lime} transparent opacity={0.35} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------ supervisor orb */

function SupervisorOrb({
  runtime,
  status,
  selected,
  speaking,
  onSelect,
}: {
  runtime: AgentRuntime;
  status: RunStatus;
  selected: boolean;
  speaking: boolean;
  onSelect: (id: AgentId) => void;
}) {
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const [hover, setHover] = useState(false);

  const complete = status === "COMPLETE";
  const color = complete ? C.green : C.lime;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ring.current) ring.current.rotation.z = t * 0.2;
    if (shell.current) {
      shell.current.rotation.y = t * 0.28;
      shell.current.rotation.x = Math.sin(t * 0.18) * 0.25;
    }
    if (core.current) {
      const pulse = speaking ? 0.08 : 0.03;
      core.current.position.y = 1.85 + Math.sin(t * 0.9) * 0.06;
      core.current.scale.setScalar(1 + Math.sin(t * (speaking ? 5 : 1.6)) * pulse);
    }
    if (light.current) {
      light.current.intensity =
        (speaking ? 3.6 : runtime.state === "IDLE" ? 1.6 : 2.6) + Math.sin(t * 2.4) * 0.5;
    }
  });

  return (
    <group position={[CONSOLE_POS[0], 0, CONSOLE_POS[1]]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.85, 2.1, 0.44, 6]} />
        <meshStandardMaterial color={C.surface} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[1.7, 1.8, 0.08, 6]} />
        <meshStandardMaterial color={C.edge} roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh ref={ring} position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.45, 1.55, 6]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected || hover ? 0.9 : 0.55}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* clickable orb */}
      <group
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
          onSelect("SUPERVISOR");
        }}
      >
        <mesh ref={core} position={[0, 1.85, 0]} castShadow>
          <icosahedronGeometry args={[0.52, 2]} />
          <meshStandardMaterial
            color="#0B0E09"
            emissive={color}
            emissiveIntensity={speaking ? 0.55 : 0.18}
            roughness={0.35}
            metalness={0.85}
          />
        </mesh>
        <mesh ref={shell} position={[0, 1.85, 0]}>
          <icosahedronGeometry args={[0.88, 1]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={hover ? 0.5 : 0.28} toneMapped={false} />
        </mesh>
      </group>

      <pointLight ref={light} position={[0, 1.9, 0]} color={color} intensity={4} distance={11} decay={2} />

      <Html position={[0, 0.62, 2.35]} center distanceFactor={12} pointerEvents="none" zIndexRange={[5, 0]}>
        <div className="select-none text-center">
          <div className="whitespace-nowrap font-mono text-[10px] tracking-[0.26em]" style={{ color }}>
            SUPERVISOR
          </div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-[8px] tracking-[0.2em]" style={{ color: C.grey }}>
            {statusLabel(runtime)}
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------- camera focus */

/** Isometric direction the camera always approaches the floor from. */
const VIEW_DIR = new THREE.Vector3(1, 0.78, 1).normalize();

/** Bounding box of the complete investigation floor (all five agents + desks). */
function floorBounds() {
  const box = new THREE.Box3();
  const ids: AgentId[] = ["SUPERVISOR", ...FLOOR_AGENTS];
  ids.forEach((id) => {
    const [x, z] = LAYOUT[id].pos;
    // each workstation occupies roughly 4 x 4 units around its anchor
    box.expandByPoint(new THREE.Vector3(x - 2.4, 0, z - 2.4));
    box.expandByPoint(new THREE.Vector3(x + 2.4, 2.6, z + 2.4));
  });
  return box;
}

/**
 * fitInvestigationFloor — frames the entire investigation floor for the
 * current usable 3D viewport (the canvas, not the browser window).
 */
export function fitInvestigationFloor(
  fov: number,
  aspect: number,
): { pos: THREE.Vector3; look: THREE.Vector3; dist: number } {
  const box = floorBounds();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = 0.5 * Math.hypot(size.x, size.z, size.y);

  const vFov = (fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.35));
  const dist = Math.max(radius / Math.tan(vFov / 2), radius / Math.tan(hFov / 2)) * 1.18;

  const look = new THREE.Vector3(center.x, 1.2, center.z);
  return { pos: look.clone().add(VIEW_DIR.clone().multiplyScalar(dist)), look, dist };
}

function focusPose(
  target: FocusTarget,
  fit: { pos: THREE.Vector3; look: THREE.Vector3 },
): { pos: THREE.Vector3; look: THREE.Vector3 } {
  if (target === "CENTER") return { pos: fit.pos.clone(), look: fit.look.clone() };
  if (target === "SUPERVISOR") {
    const look = new THREE.Vector3(LAYOUT.SUPERVISOR.pos[0], 1.5, LAYOUT.SUPERVISOR.pos[1]);
    return { pos: look.clone().add(VIEW_DIR.clone().multiplyScalar(13)), look };
  }
  const l = LAYOUT[target];
  const look = new THREE.Vector3(l.pos[0], 1.2, l.pos[1]);
  return { pos: look.clone().add(VIEW_DIR.clone().multiplyScalar(11)), look };
}

function CameraRig({
  focus,
  fitSignal,
  onFit,
}: {
  focus: FocusTarget;
  fitSignal?: number | undefined;
  onFit: (dist: number) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as
    | (THREE.EventDispatcher & { target: THREE.Vector3; update: () => void })
    | null;
  const goal = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);
  const anim = useRef(0);
  const aspect = size.width / Math.max(size.height, 1);

  const fit = useMemo(
    () => fitInvestigationFloor(camera.fov ?? 34, aspect),
    [camera.fov, aspect],
  );

  // report the fit distance so zoom bounds stay generous relative to it
  useEffect(() => onFit(fit.dist), [fit.dist, onFit]);

  // initial framing: snap straight to the full-floor view
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    camera.position.copy(fit.pos);
    if (controls) {
      controls.target.copy(fit.look);
      controls.update();
    }
  }, [camera, controls, fit]);

  useEffect(() => {
    goal.current = focusPose(focus, fit);
    anim.current = 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, fitSignal]);

  // viewport resize keeps a sensible full-floor framing when not focused
  useEffect(() => {
    if (focus !== "CENTER") return;
    goal.current = { pos: fit.pos.clone(), look: fit.look.clone() };
    anim.current = 1;
  }, [fit, focus]);

  useFrame((_, delta) => {
    if (anim.current <= 0 || !controls || !goal.current) return;
    const k = 1 - Math.pow(0.001, delta);
    camera.position.lerp(goal.current.pos, k);
    controls.target.lerp(goal.current.look, k);
    controls.update();
    if (camera.position.distanceTo(goal.current.pos) < 0.05) anim.current = 0;
  });

  return null;
}


/* --------------------------------------------------------------- the scene */

interface SceneProps {
  agents: Record<AgentId, AgentRuntime>;
  evidence: Evidence[];
  status: RunStatus;
  activeAgent: AgentId | null;
  selected: AgentId | null;
  focus: FocusTarget;
  speaking: AgentId | null;
  onSelect: (id: AgentId) => void;
  onSelectEvidence: (id: string) => void;
  fitSignal?: number | undefined;
}

function Scene(props: SceneProps) {
  const { agents, activeAgent, selected, onSelect, evidence } = props;
  const rig = useRef<THREE.Group>(null);
  const [fitDist, setFitDist] = useState(26);

  useFrame(({ clock }) => {
    if (!rig.current) return;
    rig.current.position.y = Math.sin(clock.getElapsedTime() * 0.25) * 0.06;
  });

  const evidenceIds = evidence.map((e) => e.id);

  return (

    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#39412F", "#0A0C08", 0.5]} />
      <directionalLight
        position={[10, 16, 8]}
        intensity={1.0}
        color="#C8D2B6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      <directionalLight position={[-12, 8, -10]} intensity={0.45} color="#9EDB6A" />
      <directionalLight position={[14, 7, 6]} intensity={0.55} color="#D7DECB" />

      <group ref={rig}>
        <Floor />

        <SupervisorOrb
          runtime={agents.SUPERVISOR}
          status={props.status}
          selected={selected === "SUPERVISOR"}
          speaking={props.speaking === "SUPERVISOR"}
          onSelect={onSelect}
        />

        {FLOOR_AGENTS.map((id) => (
          <Pathway
            key={`p-${id}`}
            from={CONSOLE_POS}
            to={LAYOUT[id].pos}
            active={activeAgent === id}
            done={agents[id].state === "COMPLETE"}
          />
        ))}

        {FLOOR_AGENTS.map((id) => {
          const l = LAYOUT[id];
          const rt = agents[id];
          return (
            <Station
              key={id}
              id={id}
              position={[l.pos[0], 0, l.pos[1]]}
              rotationY={l.rotY}
              tone={toneOf(rt.state)}
              statusLabel={statusLabel(rt)}
              task={rt.task}
              selected={selected === id}
              speaking={props.speaking === id}
              onSelect={onSelect}
              monitors={l.monitors}
            >
              {id === "DETECTIVE" && evidenceIds.length ? (
                <EvidenceTiles ids={evidenceIds} onSelect={props.onSelectEvidence} />
              ) : null}
            </Station>
          );
        })}
      </group>

      <CameraRig focus={props.focus} fitSignal={props.fitSignal} onFit={setFitDist} />

      <OrbitControls
        makeDefault
        enableRotate
        enablePan={false}
        enableZoom
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.35}
        maxPolarAngle={1.35}
        minAzimuthAngle={-Math.PI / 4 - 0.9}
        maxAzimuthAngle={-Math.PI / 4 + 0.9}
        minDistance={5}
        maxDistance={Math.max(fitDist * 2.4, 60)}
        zoomSpeed={0.9}
      />

    </>
  );
}

/* ------------------------------------------------------------------ canvas */

export default function Room3D(props: SceneProps) {
  const [mounted, setMounted] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  // the 3D floor owns the wheel: never let it become a page scroll
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mounted]);


  const active = props.activeAgent;
  const accent = active ? toneColor(toneOf(props.agents[active].state)) : C.grey;

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-[9px] tracking-[0.24em] text-muted-foreground">
          LOADING INVESTIGATION FLOOR…
        </span>
      </div>
    );
  }

  return (
    <div ref={wrap} className="relative h-full w-full overscroll-contain touch-none">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(60% 50% at 50% 45%, ${accent}14 0%, transparent 70%)`,
        }}
        aria-hidden
      />
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true }}
        camera={{ position: [16, 12.5, 16], fov: 34, near: 0.5, far: 400 }}
        onCreated={({ scene }) => {
          scene.fog = new THREE.Fog("#080A06", 34, 130);
        }}
      >

        <color attach="background" args={["#060705"]} />
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
