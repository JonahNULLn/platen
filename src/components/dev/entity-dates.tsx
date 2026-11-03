"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ring } from "@/components/ui/ring";
import { getEntityDates, setEntityDates } from "@/lib/actions/debug";
import { DATE_FIELDS, type EntityKind } from "@/lib/debug/date-fields";

/**
 * Debug-only: load + edit one entity's date columns. "missing" means the row
 * doesn't exist (e.g. a job with no packing slip yet) — callers can hide their
 * section rather than show an error.
 */
export function useEntityDates(kind: EntityKind, id: string) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  // What's stored right now — the baseline for "did anything change?".
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getEntityDates(kind, id).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setDates(res.dates);
        setSaved(res.dates);
        setStatus("ready");
      } else {
        setError(res.error);
        setStatus(res.error === "Not found" ? "missing" : "error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  const changed = Object.fromEntries(
    Object.entries(dates).filter(([column, value]) => value !== (saved[column] ?? "")),
  );
  const dirty = Object.keys(changed).length > 0;

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    // Send only what changed so saving one date never rewrites the others.
    const res = await setEntityDates(kind, id, changed);
    setSaving(false);
    if (!res.ok) {
      toast.error("Couldn't update dates", { description: res.error });
      return;
    }
    setDates(res.dates);
    setSaved(res.dates);
    toast.success("Dates updated");
    router.refresh();
  }

  return {
    kind,
    status,
    error,
    dates,
    setField: (column: string, value: string) => setDates((d) => ({ ...d, [column]: value })),
    dirty,
    saving,
    save,
    /** Flip to "missing" after the row is deleted elsewhere. */
    markMissing: () => setStatus("missing"),
  };
}

type EntityDatesState = ReturnType<typeof useEntityDates>;

/** The date inputs + save button for an entity loaded with `useEntityDates`. */
export function EntityDatesForm({ state }: { state: EntityDatesState }) {
  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-3">
        <Ring size="sm" className="text-muted-foreground" />
      </div>
    );
  }
  if (state.status !== "ready") {
    return <p className="text-[11px] text-destructive">Couldn't load dates: {state.error}</p>;
  }
  return (
    <div className="space-y-2">
      {DATE_FIELDS[state.kind].map((f) => {
        const inputId = `dbg-${state.kind}-${f.column}`;
        return (
          <div key={f.column} className="flex items-center justify-between gap-2">
            <label htmlFor={inputId} className="text-[11px] text-muted-foreground">
              {f.label}
            </label>
            <Input
              id={inputId}
              type="date"
              value={state.dates[f.column] ?? ""}
              onChange={(e) => state.setField(f.column, e.target.value)}
              className="h-7 w-36 text-xs"
            />
          </div>
        );
      })}
      <Button
        size="sm"
        className="w-full"
        onClick={state.save}
        disabled={state.saving || !state.dirty}
      >
        {state.saving ? <Ring size="sm" className="text-current" /> : "Save dates"}
      </Button>
    </div>
  );
}

/** Self-contained date editor for one entity (loads on mount). */
export function EntityDatesEditor({ kind, id }: { kind: EntityKind; id: string }) {
  const state = useEntityDates(kind, id);
  return <EntityDatesForm state={state} />;
}
