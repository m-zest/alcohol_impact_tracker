import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["ban_status"];

const styles: Record<Status, string> = {
  banned: "bg-banned/15 text-banned border-banned/30",
  partial: "bg-partial/15 text-partial border-partial/30",
  legal: "bg-legal/15 text-legal border-legal/30",
};

const labels: Record<Status, string> = {
  banned: "Prohibition",
  partial: "Partial",
  legal: "Legal",
};

export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${styles[status]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full status-dot-${status}`} />
      {labels[status]}
    </span>
  );
}
