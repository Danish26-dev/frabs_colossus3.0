import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NetworkEdge, NetworkGraph, NetworkNode } from "../../../lib/frab-result";
import { Mono } from "../ui";

const W = 1000;
const H = 520;

const COLUMN: Record<NetworkNode["kind"], number> = {
  CUSTOMER: 0,
  ACCOUNT: 1,
  CONNECTED_ACCOUNT: 1,
  TRANSACTION: 2,
  BENEFICIARY: 3,
  COUNTERPARTY: 4,
  MERCHANT: 4,
};

const RISKY: NetworkNode["kind"][] = ["COUNTERPARTY", "CONNECTED_ACCOUNT"];

type Pos = { x: number; y: number };

function layout(nodes: NetworkNode[]) {
  const byColumn = new Map<number, NetworkNode[]>();
  for (const n of nodes) {
    const col = COLUMN[n.kind];
    byColumn.set(col, [...(byColumn.get(col) ?? []), n]);
  }
  const cols = [...byColumn.keys()].sort((a, b) => a - b);
  const pos = new Map<string, Pos>();
  cols.forEach((col, ci) => {
    const list = byColumn.get(col)!;
    const x = cols.length === 1 ? W / 2 : 110 + (ci * (W - 220)) / (cols.length - 1);
    list.forEach((n, ri) => {
      pos.set(n.id, { x, y: (H / (list.length + 1)) * (ri + 1) });
    });
  });
  return pos;
}

/**
 * Interactive money-trace network. Nodes, edges, labels and details come from
 * the backend network graph; the interface only positions and renders them.
 */
export default function MoneyTrace({ network }: { network: NetworkGraph }) {
  const [hops, setHops] = useState<1 | 2>(2);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<number | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState<{ id: string | null; sx: number; sy: number } | null>(null);
  const [offsets, setOffsets] = useState<Record<string, Pos>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);

  const root = useMemo(
    () => network.nodes.find((n) => n.kind === "CUSTOMER") ?? network.nodes[0] ?? null,
    [network],
  );

  const visible = useMemo(() => {
    if (hops === 2 || !root) return network.nodes;
    const near = new Set<string>([root.id]);
    for (const e of network.edges) {
      if (e.from === root.id) near.add(e.to);
      if (e.to === root.id) near.add(e.from);
    }
    // one hop from the customer includes its accounts and their transactions
    const second = new Set(near);
    for (const e of network.edges) {
      if (near.has(e.from) && e.kind === "TRANSACTION") second.add(e.to);
    }
    return network.nodes.filter((n) => second.has(n.id));
  }, [network, hops, root]);

  const ids = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const edges = useMemo(
    () => network.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    [network, ids],
  );

  const base = useMemo(() => layout(visible), [visible]);
  const posOf = useCallback(
    (id: string): Pos => {
      const b = base.get(id) ?? { x: W / 2, y: H / 2 };
      const o = offsets[id];
      return o ? { x: b.x + o.x, y: b.y + o.y } : b;
    },
    [base, offsets],
  );

  const fit = useCallback(() => setView({ k: 1, x: 0, y: 0 }), []);
  useEffect(() => {
    fit();
    setOffsets({});
  }, [hops, fit]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, k: Math.min(2.4, Math.max(0.5, v.k * (e.deltaY < 0 ? 1.12 : 0.9))) }));
  };

  const toSvg = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onPointerDown = (e: React.PointerEvent, id: string | null) => {
    const p = toSvg(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ id, sx: p.x, sy: p.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toSvg(e);
    const dx = p.x - drag.sx;
    const dy = p.y - drag.sy;
    if (drag.id) {
      setOffsets((o) => ({
        ...o,
        [drag.id!]: { x: (o[drag.id!]?.x ?? 0) + dx, y: (o[drag.id!]?.y ?? 0) + dy },
      }));
    } else {
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
    setDrag({ ...drag, sx: p.x, sy: p.y });
  };

  const node = selNode ? network.nodes.find((n) => n.id === selNode) ?? null : null;
  const edge: NetworkEdge | null = selEdge === null ? null : edges[selEdge] ?? null;

  const nodeStats = (n: NetworkNode) => {
    const inbound = network.edges.filter((e) => e.to === n.id);
    const outbound = network.edges.filter((e) => e.from === n.id);
    return { inbound: inbound.length, outbound: outbound.length };
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {([1, 2] as const).map((h) => (
          <button
            key={h}
            onClick={() => setHops(h)}
            className={`border px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] transition-colors ${
              hops === h
                ? "border-lime/60 bg-lime-soft text-lime"
                : "border-border text-technical hover:text-foreground"
            }`}
          >
            {h === 1 ? "[ 1 HOP ]" : "[ 2 HOPS ]"}
          </button>
        ))}
        <button
          onClick={fit}
          className="border border-border px-2.5 py-1 font-mono text-[8px] tracking-[0.18em] text-technical transition-colors hover:border-lime/60 hover:text-lime"
        >
          [ FIT NETWORK ]
        </button>
        <Mono className="ml-auto text-[8px] text-muted-foreground">
          DRAG NODES · SCROLL TO ZOOM · DRAG BACKGROUND TO PAN
        </Mono>
      </div>

      <div className="relative border border-border bg-background">
        <div className="frab-grid pointer-events-none absolute inset-0 opacity-[0.10]" />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="relative h-[340px] w-full touch-none select-none md:h-[460px]"
          role="img"
          aria-label="Money trace network"
          onWheel={onWheel}
          onPointerDown={(e) => onPointerDown(e, null)}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          <defs>
            <marker id="mt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="var(--border)" />
            </marker>
            <marker id="mt-arrow-hot" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="var(--lime)" />
            </marker>
          </defs>

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {edges.map((e, i) => {
              const a = posOf(e.from);
              const b = posOf(e.to);
              const mx = (a.x + b.x) / 2;
              const hot = selEdge === i || selNode === e.from || selNode === e.to;
              const risky =
                RISKY.includes(network.nodes.find((n) => n.id === e.to)?.kind ?? "ACCOUNT") ||
                RISKY.includes(network.nodes.find((n) => n.id === e.from)?.kind ?? "ACCOUNT");
              return (
                <g
                  key={`${e.from}-${e.to}-${i}`}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => {
                    setSelEdge(selEdge === i ? null : i);
                    setSelNode(null);
                  }}
                  className="cursor-pointer"
                >
                  <path
                    d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                    fill="none"
                    stroke={
                      hot ? "var(--lime)" : risky ? "var(--warning, #FFB020)" : "var(--border)"
                    }
                    strokeWidth={hot ? 1.8 : 1.1}
                    markerEnd={hot ? "url(#mt-arrow-hot)" : "url(#mt-arrow)"}
                  />
                  <path
                    d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                  />
                  <text
                    x={mx}
                    y={(a.y + b.y) / 2 - 7}
                    textAnchor="middle"
                    className={hot ? "fill-[var(--lime)] font-mono" : "fill-[var(--technical)] font-mono"}
                    fontSize="8"
                    letterSpacing="1.6"
                  >
                    {e.label}
                  </text>
                </g>
              );
            })}

            {visible.map((n) => {
              const p = posOf(n.id);
              const active = selNode === n.id;
              const risky = RISKY.includes(n.kind);
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x}, ${p.y})`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onPointerDown(e, n.id);
                  }}
                  onClick={() => {
                    setSelNode(active ? null : n.id);
                    setSelEdge(null);
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    x={-68}
                    y={-21}
                    width={136}
                    height={42}
                    fill={active ? "var(--lime-soft)" : "var(--surface, #242821)"}
                    stroke={
                      active ? "var(--lime)" : risky ? "var(--warning, #FFB020)" : "var(--border)"
                    }
                    strokeWidth={active ? 1.6 : 1}
                  />
                  <text
                    y={-5}
                    textAnchor="middle"
                    className="fill-[var(--muted-foreground)] font-mono"
                    fontSize="7"
                    letterSpacing="1.8"
                  >
                    {n.kind.replace(/_/g, " ")}
                  </text>
                  <text
                    y={10}
                    textAnchor="middle"
                    className={active ? "fill-[var(--lime)] font-mono" : "fill-[var(--foreground)] font-mono"}
                    fontSize="9.5"
                    letterSpacing="1.4"
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {node ? (
        <div className="mt-3 border-l-2 border-lime bg-surface px-4 py-3">
          <Mono className="text-[8px] text-muted-foreground">{node.kind.replace(/_/g, " ")}</Mono>
          <Mono className="mt-1 block text-[11px] text-lime">{node.label}</Mono>
          <p className="mt-2 text-[12.5px] leading-relaxed text-foreground">{node.detail}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <Mono className="text-[8px] text-technical">
              INBOUND EDGES · {nodeStats(node).inbound}
            </Mono>
            <Mono className="text-[8px] text-technical">
              OUTBOUND EDGES · {nodeStats(node).outbound}
            </Mono>
            <Mono className="text-[8px] text-lime">
              EVIDENCE · {node.evidenceIds.join(" · ") || "NOT AVAILABLE"}
            </Mono>
          </div>
        </div>
      ) : edge ? (
        <div className="mt-3 border-l-2 border-lime bg-surface px-4 py-3">
          <Mono className="text-[8px] text-muted-foreground">{edge.kind.replace(/_/g, " ")}</Mono>
          <Mono className="mt-1 block text-[11px] text-lime">{edge.label}</Mono>
          <div className="mt-2 flex flex-wrap gap-5">
            <span>
              <Mono className="block text-[8px] text-muted-foreground">FROM</Mono>
              <Mono className="text-[10px] text-foreground">{edge.from}</Mono>
            </span>
            <span>
              <Mono className="block text-[8px] text-muted-foreground">TO</Mono>
              <Mono className="text-[10px] text-foreground">{edge.to}</Mono>
            </span>
          </div>
        </div>
      ) : (
        <Mono className="mt-3 block text-[8px] text-muted-foreground">
          SELECT A NODE OR AN EDGE TO INSPECT THE BACKEND RECORD
        </Mono>
      )}

      <div className="mt-6">
        <Mono className="text-[9px] text-muted-foreground">NETWORK FINDINGS</Mono>
        <ul className="mt-3 space-y-2">
          {network.findings.length === 0 ? (
            <li>
              <Mono className="text-[9px] text-warning">NOT AVAILABLE</Mono>
            </li>
          ) : null}
          {network.findings.map((f) => (
            <li key={f.no} className="border-l border-border pl-3">
              <Mono className="text-[8px] text-lime">{f.evidenceIds.join(" · ") || "—"}</Mono>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground">{f.statement}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
