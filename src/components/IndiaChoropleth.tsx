import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import { geoMercator, geoPath, geoCentroid } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import topoData from "@/assets/india-topo.json";
import type { StateRow } from "@/hooks/use-data";
import { Plus, Minus, RotateCcw } from "lucide-react";

// Map TopoJSON ids -> our DB state codes
const ID_TO_CODE: Record<string, string> = {
  CT: "CG", // Chhattisgarh
  TS: "TG", // Telangana
};

interface Props {
  states: StateRow[];
  metric: "status" | "consumption_index" | "dv_rate_per_100k" | "illegal_supply_risk";
  selectedCode: string | null;
  onSelect: (code: string | null) => void;
  /** State codes that should pulse (e.g. realtime new incidents). */
  pulseCodes?: Set<string>;
}

const STATUS_COLOR: Record<string, string> = {
  banned: "var(--banned)",
  partial: "var(--partial)",
  legal: "var(--legal)",
};

function rampColor(value: number, min: number, max: number, hueVar: string): string {
  if (max === min) return `oklch(0.30 0.05 260)`;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const l = 0.62 - t * 0.22;
  const c = 0.05 + t * 0.20;
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${hueVar})`;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export function IndiaChoropleth({
  states,
  metric,
  selectedCode,
  onSelect,
  pulseCodes,
}: Props) {
  const [hovered, setHovered] = useState<{ code: string; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const fc = useMemo(() => {
    // @ts-expect-error topojson types
    return feature(topoData, topoData.objects.india) as FeatureCollection<Geometry, { name: string }>;
  }, []);

  const features = useMemo(
    () => fc.features.filter((f) => f.id && f.id !== "-99"),
    [fc],
  );

  const width = 720;
  const height = 760;

  const projection = useMemo(
    () => geoMercator().fitSize([width, height], { type: "FeatureCollection", features } as FeatureCollection),
    [features],
  );
  const pathGen = useMemo(() => geoPath(projection), [projection]);

  const stateMap = useMemo(() => {
    const m = new Map<string, StateRow>();
    states.forEach((s) => m.set(s.code, s));
    return m;
  }, [states]);

  const range = useMemo(() => {
    if (metric === "status") return { min: 0, max: 1 };
    const vals = states.map((s) => Number(s[metric] ?? 0)).filter((v) => !isNaN(v));
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [states, metric]);

  const hue =
    metric === "dv_rate_per_100k" || metric === "illegal_supply_risk" ? "18" : "220";

  const colorFor = (code: string): string => {
    const row = stateMap.get(code);
    if (!row) return "oklch(0.22 0.01 260)";
    if (metric === "status") return STATUS_COLOR[row.status];
    const v = Number(row[metric] ?? 0);
    return rampColor(v, range.min, range.max, hue);
  };

  const statusColorRaw = (code: string): string => {
    const row = stateMap.get(code);
    if (!row) return "var(--primary)";
    return STATUS_COLOR[row.status] ?? "var(--primary)";
  };

  const selectedFeature = features.find(
    (f) => (ID_TO_CODE[String(f.id)] ?? String(f.id)) === selectedCode,
  );

  const pulseFeatures = useMemo(() => {
    if (!pulseCodes || pulseCodes.size === 0) return [];
    return features.filter((f) => pulseCodes.has(ID_TO_CODE[String(f.id)] ?? String(f.id)));
  }, [features, pulseCodes]);

  // Clamp pan so map stays roughly visible
  const clampPan = (z: number, p: { x: number; y: number }) => {
    const max = (z - 1) * (width / 2);
    return {
      x: Math.max(-max, Math.min(max, p.x)),
      y: Math.max(-max, Math.min(max, p.y)),
    };
  };

  const setZoomAt = (nextZoom: number, focal?: { x: number; y: number }) => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    if (z === zoom) return;
    if (focal && svgRef.current) {
      // Keep focal point under cursor when zooming
      const rect = svgRef.current.getBoundingClientRect();
      const fx = ((focal.x - rect.left) / rect.width) * width - width / 2;
      const fy = ((focal.y - rect.top) / rect.height) * height - height / 2;
      const ratio = z / zoom;
      const next = clampPan(z, {
        x: fx - (fx - pan.x) * ratio,
        y: fy - (fy - pan.y) * ratio,
      });
      setPan(next);
    } else {
      setPan((p) => clampPan(z, p));
    }
    setZoom(z);
  };

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const next = zoom * (1 + delta);
    setZoomAt(next, { x: e.clientX, y: e.clientY });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (zoom === 1) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    setPan(
      clampPan(zoom, {
        x: drag.px + (e.clientX - drag.x) * scaleX,
        y: drag.py + (e.clientY - drag.y) * scaleY,
      }),
    );
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  // Reset hover position on zoom/pan changes
  useEffect(() => {
    setHovered(null);
  }, [zoom, pan.x, pan.y]);

  const cursor = zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default";

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full select-none touch-none"
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor }}
      >
        <defs>
          <pattern id="diag" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="oklch(1 0 0 / 0.06)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={width} height={height} fill="url(#diag)" opacity="0.5" />

        <g
          transform={`translate(${width / 2 + pan.x} ${height / 2 + pan.y}) scale(${zoom}) translate(${-width / 2} ${-height / 2})`}
        >
          {features.map((f) => {
            const id = String(f.id);
            const code = ID_TO_CODE[id] ?? id;
            const row = stateMap.get(code);
            const isSelected = code === selectedCode;
            const fill = colorFor(code);
            const d = pathGen(f as Feature<Geometry>) ?? undefined;
            return (
              <path
                key={id}
                d={d}
                fill={fill}
                fillOpacity={row ? (isSelected ? 0.95 : 0.78) : 0.18}
                stroke={isSelected ? "var(--primary)" : "oklch(1 0 0 / 0.18)"}
                strokeWidth={(isSelected ? 1.6 : 0.6) / zoom}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer transition-[fill-opacity]"
                onMouseEnter={(e) => {
                  if (dragRef.current) return;
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHovered({ code, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseMove={(e) => {
                  if (dragRef.current) return;
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHovered({ code, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => {
                  // Suppress click after drag
                  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 4) return;
                  onSelect(code === selectedCode ? null : code);
                }}
              />
            );
          })}

          {/* Selected pulse */}
          {selectedFeature && (() => {
            const c = geoCentroid(selectedFeature as Feature<Geometry>);
            const p = projection(c as [number, number]);
            if (!p) return null;
            return (
              <g transform={`translate(${p[0]} ${p[1]})`}>
                <circle r={3 / zoom} fill="var(--primary)" />
                <circle r={3 / zoom} fill="var(--primary)" className="animate-ping-soft" />
              </g>
            );
          })()}

          {/* Realtime pulses on affected states */}
          {pulseFeatures.map((f) => {
            const id = String(f.id);
            const code = ID_TO_CODE[id] ?? id;
            const c = geoCentroid(f as Feature<Geometry>);
            const p = projection(c as [number, number]);
            if (!p) return null;
            const color = statusColorRaw(code);
            return (
              <g key={`pulse-${id}`} transform={`translate(${p[0]} ${p[1]})`}>
                <circle r={4 / zoom} fill={color} opacity={0.9} />
                <circle r={4 / zoom} fill={color} className="animate-ping-strong" />
                <circle r={9 / zoom} fill="none" stroke={color} strokeWidth={1.2 / zoom} className="animate-ping-strong" />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 rounded-md border border-border bg-popover/90 p-1 shadow-card backdrop-blur">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoomAt(zoom * 1.4)}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoomAt(zoom / 1.4)}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Reset view"
          onClick={reset}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div className="absolute bottom-2 right-3 z-10 rounded border border-border bg-popover/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground backdrop-blur">
        {zoom.toFixed(1)}×
      </div>

      {/* Tooltip */}
      {hovered && (() => {
        const row = stateMap.get(hovered.code);
        if (!row) return null;
        const val =
          metric === "status"
            ? row.status.toUpperCase()
            : `${row[metric] ?? "—"}${metric === "illegal_supply_risk" ? "%" : ""}`;
        return (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover/95 px-2.5 py-1.5 text-xs shadow-card backdrop-blur"
            style={{ left: hovered.x, top: hovered.y - 8 }}
          >
            <div className="font-semibold">{row.name}</div>
            <div className="label-mono mt-0.5">{metric.replace(/_/g, " ")}</div>
            <div className="font-mono text-[11px]">{val}</div>
          </div>
        );
      })()}
    </div>
  );
}
