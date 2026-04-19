import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type StateRow = Database["public"]["Tables"]["states"]["Row"];
export type IncidentRow = Database["public"]["Tables"]["incidents"]["Row"];
export type HelplineRow = Database["public"]["Tables"]["helplines"]["Row"];

export function useStates() {
  const [data, setData] = useState<StateRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("states")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setData(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}

export function useIncidents(type?: Database["public"]["Enums"]["incident_type"]) {
  const [data, setData] = useState<IncidentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let q = supabase.from("incidents").select("*").order("occurred_on", { ascending: false });
    if (type) q = q.eq("type", type);
    q.then(({ data }) => {
      if (cancelled) return;
      setData(data);
      setLoading(false);
    });

    const channel = supabase
      .channel(`incidents-realtime-${type ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incidents" },
        (payload) => {
          const row = payload.new as IncidentRow;
          if (type && row.type !== type) return;
          setData((prev) => {
            if (!prev) return [row];
            if (prev.some((r) => r.id === row.id)) return prev;
            return [row, ...prev];
          });
          setNewIds((prev) => {
            const next = new Set(prev);
            next.add(row.id);
            return next;
          });
          setTimeout(() => {
            setNewIds((prev) => {
              if (!prev.has(row.id)) return prev;
              const next = new Set(prev);
              next.delete(row.id);
              return next;
            });
          }, 6000);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [type]);

  return { data, loading, newIds };
}

export function useHelplines() {
  const [data, setData] = useState<HelplineRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("helplines")
      .select("*")
      .order("category", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setData(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
