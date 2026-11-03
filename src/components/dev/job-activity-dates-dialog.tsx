"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Ring } from "@/components/ui/ring";
import { type JobActivityItem, getJobActivity, setJobActivityDates } from "@/lib/actions/debug";

export function JobActivityDatesDialog({
  open,
  onOpenChange,
  jobId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  jobId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<JobActivityItem[]>([]);
  // Working copy of each event's date, keyed by event id.
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getJobActivity(jobId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setEvents(res.events);
        setDates(Object.fromEntries(res.events.map((e) => [e.id, e.date])));
      } else {
        toast.error("Couldn't load activity", { description: res.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  // Only events whose day was actually changed — untouched ones keep their
  // exact timestamp (and so their order in the log).
  const updates = events
    .map((e) => ({ id: e.id, date: dates[e.id] ?? e.date }))
    .filter((u, i) => u.date !== "" && u.date !== events[i]?.date);

  async function save() {
    if (updates.length === 0) return;
    setSaving(true);
    const res = await setJobActivityDates(jobId, updates);
    setSaving(false);
    if (!res.ok) {
      toast.error("Couldn't update activity dates", { description: res.error });
      return;
    }
    toast.success("Activity dates updated");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Edit activity dates</DialogTitle>
          <DialogDescription>Backdate any event in this job's activity log.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Ring className="text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{e.message}</p>
                    {e.actor ? (
                      <p className="truncate text-xs text-muted-foreground">{e.actor}</p>
                    ) : null}
                  </div>
                  <Input
                    type="date"
                    value={dates[e.id] ?? ""}
                    onChange={(ev) => setDates((d) => ({ ...d, [e.id]: ev.target.value }))}
                    className="h-8 w-36 shrink-0 text-xs"
                    aria-label={`Date for ${e.message}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t border-border p-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading || updates.length === 0}>
            {saving ? <Ring size="sm" className="text-current" /> : "Save dates"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
