import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { IndiaChoropleth } from "@/components/IndiaChoropleth";
import { useStates, useIncidents, useHelplines } from "@/hooks/use-data";
import type { StateRow, IncidentRow, HelplineRow } from "@/hooks/use-data";
import {
  Activity,
  AlertTriangle,
  Skull,
  Package,
  Phone,
  Search,
  Clock,
  ExternalLink,
  TrendingUp,
  Map as MapIcon,
  BarChart3,
  Shield,
  LifeBuoy,
  Radio,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SoberMap — India Alcohol Policy & Impact Monitor" },
      {
        name: "description",
        content:
          "Live command-center for Indian alcohol policy: legality heat-map, illicit liquor incidents, consumption × domestic-violence correlations, and verified helplines.",
      },
      { property: "og:title", content: "SoberMap — India Alcohol Policy Monitor" },
      {
        property: "og:description",
        content:
          "An interactive intelligence dashboard tracking prohibition, illicit supply and social harm across all Indian states.",
      },
    ],
  }),
  component: DashboardPage,
});

type Tab = "overview" | "map" | "incidents" | "resources";
type Metric = "status" | "consumption_index" | "dv_rate_per_100k" | "illegal_supply_risk";

const METRICS: { id: Metric; label: string }[] = [
  { id: "status", label: "Legality" },
  { id: "consumption_index", label: "Consumption" },
  { id: "dv_rate_per_100k", label: "DV / 100k" },
  { id: "illegal_supply_risk", label: "Illicit risk" },
];

const TABS: { id: Tab; label: string; icon: typeof MapIcon }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "map", label: "Heat-map", icon: MapIcon },
  { id: "incidents", label: "Incidents", icon: AlertTriangle },
  { id: "resources", label: "Helplines", icon: LifeBuoy },
];

function DashboardPage() {
  const { data: statesData } = useStates();
  const { data: incidentsData, newIds: newIncidentIds } = useIncidents();
  const { data: helplinesData } = useHelplines();

  const states = statesData ?? [];
  const incidents = incidentsData ?? [];
  const helplines = helplinesData ?? [];

  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<Metric>("status");
  const [selected, setSelected] = useState<string | null>(null);

  const stateNames = useMemo(() => {
    const m: Record<string, string> = {};
    states.forEach((s) => (m[s.code] = s.name));
    return m;
  }, [states]);

  const totals = useMemo(() => {
    const banned = states.filter((s) => s.status === "banned").length;
    const partial = states.filter((s) => s.status === "partial").length;
    const legal = states.filter((s) => s.status === "legal").length;
    const hooch = incidents.filter((i) => i.type === "hooch_tragedy");
    const seizures = incidents.filter((i) => i.type === "illegal_seizure").length;
    const casualties = hooch.reduce((a, i) => a + (i.casualties ?? 0), 0);
    return { banned, partial, legal, hoochCount: hooch.length, seizures, casualties };
  }, [states, incidents]);

  const correlation = useMemo(() => {
    if (states.length === 0) return 0;
    const xs = states.map((s) => Number(s.consumption_index ?? 0));
    const ys = states.map((s) => Number(s.dv_rate_per_100k ?? 0));
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
    }
    const r = num / Math.sqrt(dx2 * dy2);
    return isNaN(r) ? 0 : r;
  }, [states]);

  const selectedState = selected ? states.find((s) => s.code === selected) ?? null : null;

  const feed = useMemo(
    () =>
      incidents.slice(0, 40).map((i) => ({
        id: i.id,
        kind: i.type as string,
        title: i.title,
        where: `${stateNames[i.state_code] ?? i.state_code}${i.district ? " · " + i.district : ""}`,
        when: i.occurred_on,
        casualties: i.casualties ?? 0,
      })),
    [incidents, stateNames],
  );

  // Map state codes to pulse on the choropleth when realtime new incidents arrive.
  const pulseCodes = useMemo(() => {
    const set = new Set<string>();
    if (newIncidentIds.size === 0) return set;
    incidents.forEach((i) => {
      if (newIncidentIds.has(i.id)) set.add(i.state_code);
    });
    return set;
  }, [incidents, newIncidentIds]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar tab={tab} setTab={setTab} />

      <div className="grid flex-1 grid-cols-12 gap-px overflow-hidden bg-border">
        <aside className="col-span-12 overflow-y-auto bg-background scroll-thin md:col-span-3">
          <LeftRail
            totals={totals}
            correlation={correlation}
            states={states}
            selected={selected}
            onSelect={setSelected}
          />
        </aside>

        <main className="col-span-12 overflow-y-auto bg-background scroll-thin md:col-span-6">
          {tab === "overview" && (
            <OverviewPanel
              states={states}
              incidents={incidents}
              correlation={correlation}
              selectedState={selectedState}
              onSelect={setSelected}
              pulseCodes={pulseCodes}
            />
          )}
          {tab === "map" && (
            <MapPanel
              states={states}
              metric={metric}
              setMetric={setMetric}
              selected={selected}
              setSelected={setSelected}
              pulseCodes={pulseCodes}
            />
          )}
          {tab === "incidents" && (
            <IncidentsPanel incidents={incidents} stateNames={stateNames} />
          )}
          {tab === "resources" && <ResourcesPanel helplines={helplines} />}
        </main>

        <aside className="col-span-12 overflow-y-auto bg-background scroll-thin md:col-span-3">
          <SignalFeed feed={feed} newIds={newIncidentIds} />
        </aside>
      </div>
    </div>
  );
}

/* ---------- Top bar ---------- */
function TopBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary shadow-glow-primary">
          <Activity className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="font-display text-sm font-bold tracking-tight">
            SOBERMAP <span className="text-primary">·</span>{" "}
            <span className="font-mono text-[10px] font-normal text-muted-foreground">
              IN.MONITOR.v1
            </span>
          </div>
          <div className="label-mono">India alcohol policy &amp; impact</div>
        </div>
      </div>

      <nav className="hidden items-center gap-1 rounded-lg border border-border bg-card p-1 md:flex">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-glow-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="hidden items-center gap-2 md:flex">
        <span className="flex items-center gap-1.5 rounded-md border border-legal/30 bg-legal/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-legal">
          <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-legal" />
          Live
        </span>
      </div>
    </header>
  );
}

/* ---------- Mobile tab strip (visible only on small screens) ---------- */

/* ---------- Left rail ---------- */
type Totals = {
  banned: number; partial: number; legal: number;
  hoochCount: number; seizures: number; casualties: number;
};
function LeftRail({
  totals,
  correlation,
  states,
  selected,
  onSelect,
}: {
  totals: Totals;
  correlation: number;
  states: StateRow[];
  selected: string | null;
  onSelect: (c: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = states.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="label-mono">Threat Grid</div>
        <div className="mt-3 space-y-2.5">
          <Stat dot="banned" label="Prohibition states" value={totals.banned} sub="full bans" />
          <Stat dot="partial" label="Partial / regulated" value={totals.partial} sub="dry-day or local" />
          <Stat dot="legal" label="Legal sale" value={totals.legal} sub="open market" />
          <Stat dot="banned" label="Hooch casualties" value={totals.casualties} sub={`${totals.hoochCount} events`} />
          <Stat dot="partial" label="Illegal seizures" value={totals.seizures} sub="logged" />
          <Stat dot="legal" label="Pearson r (cons × DV)" value={correlation.toFixed(2)} sub="reported" />
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="label-mono">States &amp; UTs</div>
        <span className="font-mono text-[10px] text-muted-foreground">{filtered.length}</span>
      </div>

      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter state…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto scroll-thin">
        {filtered.map((s) => {
          const active = selected === s.code;
          return (
            <li key={s.code}>
              <button
                onClick={() => onSelect(active ? null : s.code)}
                className={`flex w-full items-center gap-2.5 border-b border-border/60 px-4 py-2.5 text-left transition-colors hover:bg-accent ${
                  active ? "bg-accent" : ""
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full status-dot-${s.status}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{s.name}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {s.code} · DV {s.dv_rate_per_100k ?? "—"} · risk {s.illegal_supply_risk ?? 0}%
                  </span>
                </span>
                {Number(s.illegal_supply_risk) >= 30 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-banned shadow-[0_0_8px_var(--banned)]" />
                )}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center font-mono text-[10px] text-muted-foreground">
            No matches
          </li>
        )}
      </ul>
    </div>
  );
}

function Stat({
  dot,
  label,
  value,
  sub,
}: {
  dot: "banned" | "partial" | "legal";
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2 w-2 shrink-0 rounded-full status-dot-${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold leading-tight">{label}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>
      </div>
      <div className="font-mono text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

/* ---------- Overview tab ---------- */
function OverviewPanel({
  states,
  incidents,
  correlation,
  selectedState,
  onSelect,
  pulseCodes,
}: {
  states: StateRow[];
  incidents: IncidentRow[];
  correlation: number;
  selectedState: StateRow | null;
  onSelect: (c: string | null) => void;
  pulseCodes: Set<string>;
}) {
  const byDv = [...states].sort(
    (a, b) => Number(b.dv_rate_per_100k ?? 0) - Number(a.dv_rate_per_100k ?? 0),
  );
  const byRisk = [...states].sort(
    (a, b) => Number(b.illegal_supply_risk ?? 0) - Number(a.illegal_supply_risk ?? 0),
  );

  return (
    <div className="space-y-4 p-4">
      <SectionHeader
        eyebrow="Mission brief"
        title="India Alcohol Policy Monitor"
        sub="Aggregated public-domain signals on prohibition, illicit supply and correlated social harm. Reporting biases vary — treat as orientation, not adjudication."
      />

      <div className="panel overflow-hidden">
        <PanelHeader icon={MapIcon} title="Legality heat-map" right={`${states.length} regions`} />
        <div className="aspect-[16/12] border-t border-border">
          <IndiaChoropleth
            states={states}
            metric="status"
            selectedCode={selectedState?.code ?? null}
            onSelect={onSelect}
            pulseCodes={pulseCodes}
          />
        </div>
      </div>

      {selectedState && <SelectedStateCard state={selectedState} />}

      <div className="panel p-4">
        <PanelHeader icon={TrendingUp} title="Consumption × Domestic Violence" />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MiniMetric label="Pearson r" value={correlation.toFixed(2)} accent />
          <MiniMetric
            label="Highest DV"
            value={byDv[0]?.name.split(" ")[0] ?? "—"}
            sub={`${byDv[0]?.dv_rate_per_100k ?? 0} per 100k`}
          />
          <MiniMetric
            label="Top illicit risk"
            value={byRisk[0]?.name.split(" ")[0] ?? "—"}
            sub={`${byRisk[0]?.illegal_supply_risk ?? 0}%`}
          />
        </div>
        <div className="mt-5 space-y-2">
          {byDv.slice(0, 12).map((s) => {
            const c = Number(s.consumption_index ?? 0);
            const d = Number(s.dv_rate_per_100k ?? 0);
            return (
              <div key={s.code} className="grid grid-cols-[88px_1fr_56px] items-center gap-3">
                <button
                  onClick={() => onSelect(s.code)}
                  className="truncate text-left text-xs font-semibold hover:text-primary"
                >
                  {s.name}
                </button>
                <div className="space-y-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-accent">
                    <div className="h-full rounded-full bg-accent2" style={{ width: `${Math.min(c, 100)}%` }} />
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-accent">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((d / 50) * 100, 100)}%` }} />
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] tabular-nums">
                  <div className="text-accent2">{c}</div>
                  <div className="text-primary">{d}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Legend dot="bg-accent2" label="Consumption idx" />
          <Legend dot="bg-primary" label="DV per 100k" />
        </div>
      </div>

      <div className="panel p-4">
        <PanelHeader icon={Shield} title="Average DV by policy regime" />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(["banned", "partial", "legal"] as const).map((status) => {
            const subset = states.filter((s) => s.status === status);
            const avg =
              subset.reduce((a, s) => a + Number(s.dv_rate_per_100k ?? 0), 0) /
              Math.max(subset.length, 1);
            return (
              <div key={status} className="rounded-md border border-border bg-background/50 p-3">
                <div className={`label-mono text-${status}`}>{status}</div>
                <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums">{avg.toFixed(1)}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  avg DV / 100k · {subset.length} states
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 rounded-md border border-partial/30 bg-partial/10 p-2.5 text-[11px] leading-relaxed text-foreground/80">
          <strong className="text-partial">Caveat:</strong> prohibition states often show lower
          <em> reported</em> DV but higher illicit-liquor seizures and hooch fatalities.
          Underreporting and parallel illegal markets distort the signal.
        </p>
      </div>

      <div className="panel p-4">
        <PanelHeader icon={Radio} title="Recent incidents" />
        <ul className="mt-3 space-y-2">
          {incidents.slice(0, 5).map((i) => (
            <li key={i.id} className="flex items-start gap-3 border-b border-border/60 pb-2 last:border-0">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">{i.title}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {i.state_code} · {new Date(i.occurred_on).toLocaleDateString()}
                  {i.casualties ? ` · ${i.casualties} casualties` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Map tab ---------- */
function MapPanel({
  states,
  metric,
  setMetric,
  selected,
  setSelected,
  pulseCodes,
}: {
  states: StateRow[];
  metric: Metric;
  setMetric: (m: Metric) => void;
  selected: string | null;
  setSelected: (c: string | null) => void;
  pulseCodes: Set<string>;
}) {
  const selectedRow = selected ? states.find((s) => s.code === selected) ?? null : null;

  return (
    <div className="space-y-4 p-4">
      <SectionHeader
        eyebrow="Layer 01"
        title="Heat-map · India"
        sub="Switch the active layer to color states by legality, consumption proxy, reported DV, or estimated illicit-supply share."
      />

      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            className={`rounded-md border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              metric === m.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden">
        <PanelHeader
          icon={MapIcon}
          title={METRICS.find((m) => m.id === metric)?.label ?? "Map"}
          right={metric === "status" ? "Categorical" : "Choropleth"}
        />
        <div className="aspect-[4/5] border-t border-border">
          <IndiaChoropleth
            states={states}
            metric={metric}
            selectedCode={selected}
            onSelect={setSelected}
            pulseCodes={pulseCodes}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
          {metric === "status" ? (
            <div className="flex items-center gap-3">
              <Legend dot="bg-banned" label="Prohibition" />
              <Legend dot="bg-partial" label="Partial" />
              <Legend dot="bg-legal" label="Legal" />
            </div>
          ) : (
            <RampLegend states={states} metric={metric} />
          )}
          <span className="font-mono text-[10px] text-muted-foreground">
            Click a state · {states.length} regions
          </span>
        </div>
      </div>

      {selectedRow && <SelectedStateCard state={selectedRow} />}
    </div>
  );
}

function RampLegend({ states, metric }: { states: StateRow[]; metric: Metric }) {
  const vals = states
    .map((s) => Number(s[metric as keyof StateRow] ?? 0))
    .filter((v) => !isNaN(v));
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="font-mono">{min}</span>
      <span className="h-2 w-32 rounded-full bg-gradient-to-r from-[oklch(0.62_0.05_220)] to-[oklch(0.40_0.25_18)]" />
      <span className="font-mono">{max}</span>
    </div>
  );
}

/* ---------- Incidents tab ---------- */
function IncidentsPanel({
  incidents,
  stateNames,
}: {
  incidents: IncidentRow[];
  stateNames: Record<string, string>;
}) {
  const [filter, setFilter] = useState<string>("all");
  const TYPES = ["hooch_tragedy", "illegal_seizure", "domestic_violence", "alcohol_crime"];
  const list = filter === "all" ? incidents : incidents.filter((i) => i.type === filter);

  const totals = {
    hooch: incidents.filter((i) => i.type === "hooch_tragedy").length,
    casualties: incidents.reduce((a, i) => a + (i.casualties ?? 0), 0),
    seizures: incidents.filter((i) => i.type === "illegal_seizure").length,
    crimes: incidents.filter((i) => i.type === "alcohol_crime").length,
  };

  return (
    <div className="space-y-4 p-4">
      <SectionHeader
        eyebrow="Layer 02"
        title="Illicit supply & hooch tracker"
        sub="Methanol poisonings, illegal-liquor seizures and alcohol-linked crimes — proxy signals for India's parallel alcohol economy."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile icon={Skull} value={totals.hooch} label="Hooch events" tone="banned" />
        <Tile icon={Skull} value={totals.casualties} label="Casualties" tone="banned" />
        <Tile icon={Package} value={totals.seizures} label="Seizures" tone="partial" />
        <Tile icon={AlertTriangle} value={totals.crimes} label="Other crimes" tone="warning" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        {TYPES.map((t) => (
          <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
            {t.replace(/_/g, " ")}
          </Chip>
        ))}
      </div>

      <ol className="space-y-3">
        {list.map((i) => (
          <li key={i.id} className="panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                {i.type.replace(/_/g, " ")}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {new Date(i.occurred_on).toLocaleDateString("en-IN", {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">·</span>
              <span className="text-xs font-semibold">
                {stateNames[i.state_code] ?? i.state_code}
                {i.district ? ` — ${i.district}` : ""}
              </span>
              {(i.casualties ?? 0) > 0 && (
                <span className="ml-auto rounded-md bg-banned/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-banned">
                  {i.casualties} casualties
                </span>
              )}
            </div>
            <h4 className="mt-2 text-sm font-semibold">{i.title}</h4>
            {i.description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{i.description}</p>
            )}
          </li>
        ))}
        {list.length === 0 && (
          <li className="panel p-6 text-center text-xs text-muted-foreground">
            No incidents for this filter.
          </li>
        )}
      </ol>
    </div>
  );
}

/* ---------- Resources tab ---------- */
function ResourcesPanel({ helplines }: { helplines: HelplineRow[] }) {
  const [q, setQ] = useState("");
  const filtered = helplines.filter(
    (h) =>
      !q ||
      h.name.toLowerCase().includes(q.toLowerCase()) ||
      h.category.toLowerCase().includes(q.toLowerCase()) ||
      h.coverage.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4 p-4">
      <SectionHeader
        eyebrow="Layer 03"
        title="Verified helplines"
        sub="National and state-level numbers for domestic violence, de-addiction and mental-health support. Most operate 24×7."
      />

      <div className="rounded-md border border-banned/30 bg-banned/10 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-banned/20">
            <Phone className="h-5 w-5 text-banned" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">In immediate danger?</div>
            <div className="text-xs text-muted-foreground">
              Dial <strong className="text-foreground">112</strong> (national emergency) or{" "}
              <strong className="text-foreground">181</strong> (Women Helpline).
            </div>
          </div>
          <a
            href="tel:112"
            className="rounded-md bg-banned px-3 py-1.5 font-mono text-xs font-bold uppercase text-destructive-foreground"
          >
            Call 112
          </a>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, category, or coverage…"
          className="w-full rounded-md border border-border bg-card py-2 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((h) => (
          <div key={h.id} className="panel p-4 transition-colors hover:border-primary/40">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{h.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {h.category} · {h.coverage}
                </div>
              </div>
              {h.available_24_7 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-legal/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-legal">
                  <Clock className="h-2.5 w-2.5" /> 24×7
                </span>
              )}
            </div>
            {h.description && (
              <p className="mt-2 text-xs text-muted-foreground">{h.description}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <a
                href={`tel:${h.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground"
              >
                <Phone className="h-3 w-3" /> {h.phone}
              </a>
              {h.url && (
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Site <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Right rail: live signal feed ---------- */
function SignalFeed({
  feed,
  newIds,
}: {
  feed: { id: string; kind: string; title: string; where: string; when: string; casualties: number }[];
  newIds: Set<string>;
}) {
  const KIND_TONE: Record<string, string> = {
    hooch_tragedy: "text-banned border-banned/30 bg-banned/10",
    illegal_seizure: "text-partial border-partial/30 bg-partial/10",
    domestic_violence: "text-accent2 border-accent2/30 bg-accent2/10",
    alcohol_crime: "text-primary border-primary/30 bg-primary/10",
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="label-mono">Signal Feed</div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-banned">
          <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-banned" /> LIVE
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto scroll-thin">
        {feed.map((f) => {
          const isNew = newIds.has(f.id);
          return (
            <li
              key={f.id}
              className={`relative border-b border-border/60 px-4 py-3 ${isNew ? "animate-signal-flash" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
                    KIND_TONE[f.kind] ?? "text-muted-foreground border-border"
                  }`}
                >
                  {f.kind.replace(/_/g, " ")}
                </span>
                {isNew && (
                  <span className="flex items-center gap-1 rounded-sm bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-primary">
                    <span className="h-1 w-1 animate-pulse-glow rounded-full bg-primary" />
                    New
                  </span>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {timeAgo(f.when)}
                </span>
              </div>
              <div className="mt-1.5 text-xs font-semibold leading-snug">{f.title}</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                · {f.where}
                {f.casualties > 0 ? `  ·  ${f.casualties} casualties` : ""}
              </div>
            </li>
          );
        })}
        {feed.length === 0 && (
          <li className="px-4 py-8 text-center font-mono text-[10px] text-muted-foreground">
            No signals
          </li>
        )}
      </ul>
    </div>
  );
}

/* ---------- Reusable bits ---------- */
function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div>
      <div className="label-mono text-primary">{eyebrow}</div>
      <h1 className="mt-1 font-display text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{sub}</p>
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: typeof MapIcon;
  title: string;
  right?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="label-mono">{title}</span>
      </div>
      {right && <span className="font-mono text-[10px] text-muted-foreground">{right}</span>}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <div className="label-mono">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold tabular-nums ${accent ? "text-primary" : ""}`}>
        {value}
      </div>
      {sub && <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Tile({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Skull;
  value: number;
  label: string;
  tone: "banned" | "partial" | "warning";
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 text-${tone}`} />
        <span className={`label-mono text-${tone}`}>{tone}</span>
      </div>
      <div className="mt-2 font-mono text-2xl font-bold tabular-nums">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
      <span className={`h-2 w-3 rounded-sm ${dot}`} />
      {label}
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SelectedStateCard({ state }: { state: StateRow }) {
  return (
    <div className="panel p-4">
      <PanelHeader icon={MapIcon} title="State detail" right={state.code} />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-bold">{state.name}</h3>
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider bg-${state.status}/15 text-${state.status} border-${state.status}/30`}
        >
          {state.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniMetric label="Drink age" value={`${state.drinking_age ?? "—"}`} sub="years" />
        <MiniMetric label="Population" value={`${state.population_millions ?? "—"}`} sub="millions" />
        <MiniMetric label="Consumption" value={`${state.consumption_index ?? "—"}`} sub="index" />
        <MiniMetric label="DV / 100k" value={`${state.dv_rate_per_100k ?? "—"}`} sub="reported" />
      </div>
      {state.policy_notes && (
        <p className="mt-3 rounded-md border border-border bg-background/50 p-3 text-xs leading-relaxed text-foreground/80">
          {state.policy_notes}
        </p>
      )}
      {state.status !== "legal" && (
        <div className="mt-3 rounded-md border border-banned/30 bg-banned/10 p-3">
          <div className="label-mono text-banned">Illicit supply risk</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-banned">
              {state.illegal_supply_risk}%
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              estimated share from illegal sources
            </span>
          </div>
        </div>
      )}
      <Link
        to="/state/$code"
        params={{ code: state.code }}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-90"
      >
        Open full state report →
      </Link>
    </div>
  );
}

/* ---------- Helpers ---------- */
function timeAgo(date: string): string {
  const d = new Date(date).getTime();
  const diff = Date.now() - d;
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return "today";
  const days = Math.floor(diff / day);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
