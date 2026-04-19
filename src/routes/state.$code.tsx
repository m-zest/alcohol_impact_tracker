import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Phone,
  ExternalLink,
  AlertTriangle,
  Activity,
  TrendingUp,
  Skull,
  Package,
  Clock,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type StateRow = Database["public"]["Tables"]["states"]["Row"];
type IncidentRow = Database["public"]["Tables"]["incidents"]["Row"];
type HelplineRow = Database["public"]["Tables"]["helplines"]["Row"];

async function fetchStateDetail(rawCode: string) {
  const code = rawCode.toUpperCase();
  const [stateRes, incidentsRes, helplinesRes] = await Promise.all([
    supabase.from("states").select("*").eq("code", code).maybeSingle(),
    supabase
      .from("incidents")
      .select("*")
      .eq("state_code", code)
      .order("occurred_on", { ascending: false }),
    supabase.from("helplines").select("*").order("category"),
  ]);

  if (stateRes.error) throw new Error(stateRes.error.message);
  if (!stateRes.data) return null;

  return {
    state: stateRes.data as StateRow,
    incidents: (incidentsRes.data ?? []) as IncidentRow[],
    helplines: (helplinesRes.data ?? []) as HelplineRow[],
  };
}

export const Route = createFileRoute("/state/$code")({
  loader: async ({ params }) => {
    const result = await fetchStateDetail(params.code);
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "State not found · SoberMap" }],
      };
    }
    const { state, incidents } = loaderData;
    const casualties = incidents
      .filter((i) => i.type === "hooch_tragedy")
      .reduce((a, i) => a + (i.casualties ?? 0), 0);
    const title = `${state.name} · Alcohol Policy & Incidents — SoberMap`;
    const desc = `${state.name} is ${state.status === "banned" ? "a prohibition state" : state.status === "partial" ? "partially regulated" : "an open-market state"}. ${incidents.length} tracked incidents, ${casualties} hooch casualties. Consumption index ${state.consumption_index ?? "—"}, DV ${state.dv_rate_per_100k ?? "—"}/100k.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
      <div className="font-mono text-5xl font-bold">404</div>
      <div className="text-sm text-muted-foreground">State not found</div>
      <Link
        to="/"
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </Link>
    </div>
  ),
  component: StateDetailPage,
});

const TYPE_META: Record<
  Database["public"]["Enums"]["incident_type"],
  { label: string; cls: string; Icon: typeof AlertTriangle }
> = {
  hooch_tragedy: { label: "Hooch tragedy", cls: "text-banned border-banned/30 bg-banned/10", Icon: Skull },
  illegal_seizure: { label: "Seizure", cls: "text-partial border-partial/30 bg-partial/10", Icon: Package },
  domestic_violence: { label: "Domestic violence", cls: "text-primary border-primary/30 bg-primary/10", Icon: AlertTriangle },
  alcohol_crime: { label: "Alcohol crime", cls: "text-accent2 border-accent2/30 bg-accent2/10", Icon: Activity },
};

function StateDetailPage() {
  const data = Route.useLoaderData() as {
    state: StateRow;
    incidents: IncidentRow[];
    helplines: HelplineRow[];
  };
  const { state, incidents, helplines } = data;

  const totals = useMemo(() => {
    const hooch = incidents.filter((i) => i.type === "hooch_tragedy");
    const seizures = incidents.filter((i) => i.type === "illegal_seizure").length;
    const dv = incidents.filter((i) => i.type === "domestic_violence").length;
    const casualties = hooch.reduce((a, i) => a + (i.casualties ?? 0), 0);
    return { hooch: hooch.length, seizures, dv, casualties };
  }, [incidents]);

  // Yearly trend (last 6 years)
  const trend = useMemo(() => {
    const map = new Map<number, { year: number; events: number; casualties: number }>();
    incidents.forEach((i) => {
      const y = new Date(i.occurred_on).getFullYear();
      if (!map.has(y)) map.set(y, { year: y, events: 0, casualties: 0 });
      const row = map.get(y)!;
      row.events += 1;
      row.casualties += i.casualties ?? 0;
    });
    return [...map.values()].sort((a, b) => a.year - b.year).slice(-6);
  }, [incidents]);

  const maxCasualties = Math.max(1, ...trend.map((t) => t.casualties));
  const maxEvents = Math.max(1, ...trend.map((t) => t.events));

  // Helplines: state coverage > national. Simple match by state name in coverage.
  const localHelplines = useMemo(() => {
    const local = helplines.filter((h) =>
      h.coverage.toLowerCase().includes(state.name.toLowerCase()),
    );
    const national = helplines.filter(
      (h) => !local.includes(h) && h.coverage.toLowerCase().includes("national"),
    );
    return [...local, ...national].slice(0, 8);
  }, [helplines, state.name]);

  const statusLabel =
    state.status === "banned"
      ? "Prohibition · alcohol banned"
      : state.status === "partial"
        ? "Partial · regulated / dry days"
        : "Legal · open market";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            SoberMap · {state.code}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {/* Hero */}
        <section className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                State / UT · {state.code}
              </div>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
                {state.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider status-dot-${state.status} status-pill-${state.status}`}
                  style={{
                    borderColor: `var(--${state.status})`,
                    color: `var(--${state.status})`,
                    background: `color-mix(in oklab, var(--${state.status}) 12%, transparent)`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: `var(--${state.status})` }}
                  />
                  {statusLabel}
                </span>
                {state.drinking_age && (
                  <span className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    Drinking age · {state.drinking_age}
                  </span>
                )}
                {state.population_millions && (
                  <span className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    Pop · {state.population_millions}M
                  </span>
                )}
              </div>
            </div>
          </div>

          {state.policy_notes && (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-foreground/85">
              {state.policy_notes}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPI label="Consumption idx" value={state.consumption_index ?? "—"} accent="accent2" />
            <KPI label="DV / 100k" value={state.dv_rate_per_100k ?? "—"} accent="primary" />
            <KPI label="Illicit risk" value={`${state.illegal_supply_risk ?? 0}%`} accent="banned" />
            <KPI label="Hooch deaths" value={totals.casualties} accent="banned" />
          </div>
        </section>

        {/* Trend */}
        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">
                Trend · last {trend.length || 0} year{trend.length === 1 ? "" : "s"}
              </h2>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-primary" />
                Events
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-banned" />
                Casualties
              </span>
            </div>
          </div>

          {trend.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              No incidents on record.
            </p>
          ) : (
            <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(0, 1fr))` }}>
              {trend.map((t) => (
                <div key={t.year} className="flex flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end justify-center gap-1.5">
                    <div
                      className="w-1/3 rounded-t bg-primary/80 transition-all"
                      style={{ height: `${(t.events / maxEvents) * 100}%` }}
                      title={`${t.events} events`}
                    />
                    <div
                      className="w-1/3 rounded-t bg-banned/80 transition-all"
                      style={{ height: `${(t.casualties / maxCasualties) * 100}%` }}
                      title={`${t.casualties} casualties`}
                    />
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">{t.year}</div>
                  <div className="font-mono text-[10px] tabular-nums">
                    <span className="text-primary">{t.events}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-banned">{t.casualties}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Two-column: timeline + helplines */}
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="panel p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent2" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">
                Incident timeline
              </h2>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {incidents.length} records
              </span>
            </div>

            {incidents.length === 0 ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                No incidents recorded for this state.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {incidents.map((i) => {
                  const meta = TYPE_META[i.type];
                  const Icon = meta.Icon;
                  return (
                    <li
                      key={i.id}
                      className="flex gap-3 border-b border-border/50 pb-3 last:border-0"
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${meta.cls}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${meta.cls}`}>
                            {meta.label}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {new Date(i.occurred_on).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          {i.district && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              · {i.district}
                            </span>
                          )}
                          {(i.casualties ?? 0) > 0 && (
                            <span className="rounded bg-banned/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-banned">
                              {i.casualties} casualties
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1 text-sm font-semibold leading-snug">{i.title}</h3>
                        {i.description && (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {i.description}
                          </p>
                        )}
                        {i.source_url && (
                          <a
                            href={i.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] text-accent2 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Source
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel p-5">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-legal" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">
                Helplines
              </h2>
            </div>
            <ul className="mt-4 space-y-3">
              {localHelplines.map((h) => (
                <li
                  key={h.id}
                  className="rounded-md border border-border bg-background/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-tight">{h.name}</div>
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {h.category} · {h.coverage}
                      </div>
                    </div>
                    {h.available_24_7 && (
                      <span className="shrink-0 rounded bg-legal/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-legal">
                        24×7
                      </span>
                    )}
                  </div>
                  {h.description && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/75">
                      {h.description}
                    </p>
                  )}
                  <a
                    href={`tel:${h.phone.replace(/\s+/g, "")}`}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                  >
                    <Phone className="h-3 w-3" />
                    {h.phone}
                  </a>
                </li>
              ))}
              {localHelplines.length === 0 && (
                <li className="text-center text-xs text-muted-foreground">No helplines on file.</li>
              )}
            </ul>
          </section>
        </div>

        <footer className="pb-8 text-center font-mono text-[10px] text-muted-foreground">
          Public-domain signals · figures may lag or under-report. Treat as orientation, not adjudication.
        </footer>
      </main>
    </div>
  );
}

function KPI({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: "primary" | "accent2" | "banned";
}) {
  const cls =
    accent === "primary"
      ? "text-primary"
      : accent === "accent2"
        ? "text-accent2"
        : "text-banned";
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
