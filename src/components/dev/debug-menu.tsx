"use client";

import {
  Bug,
  CalendarClock,
  CircleCheck,
  FastForward,
  Hash,
  History,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Shortcut } from "@/components/common/shortcut";
import { EntityDatesEditor } from "@/components/dev/entity-dates";
import { JobActivityDatesDialog } from "@/components/dev/job-activity-dates-dialog";
import { MigrateQuotesDialog } from "@/components/dev/migrate-quotes-dialog";
import { PackingSlipDebugSection } from "@/components/dev/packing-slip-debug-section";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Ring } from "@/components/ui/ring";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getQuoteNumber, setQuoteNumber } from "@/lib/actions/debug";
import { cn } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DeleteTarget = { kind: "quote" | "invoice" | "job"; id: string; list: string };

/** Resolve the entity to delete from the current detail-page path, or null. */
function deleteTarget(pathname: string): DeleteTarget | null {
  const m = /^\/(quotes|invoices|jobs)\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  const seg = m[1];
  const id = m[2];
  if (!seg || !id || !UUID_RE.test(id)) return null;
  const kind = seg === "quotes" ? "quote" : seg === "invoices" ? "invoice" : "job";
  return { kind, id, list: `/${seg}` };
}

export function DebugMenu() {
  const { platform, setPlatform, isOverridden, resetToDetected } = usePlatform();
  const pathname = usePathname();
  const router = useRouter();
  const target = deleteTarget(pathname);
  const isQuotesList = pathname === "/quotes";
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [quoteNumberInput, setQuoteNumberInput] = useState("");
  const [savingNumber, setSavingNumber] = useState(false);

  // Load the quote's number whenever the panel opens on a quote. (Dates load
  // inside their own sections, which only mount while the panel is open.)
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only when the panel opens on a new entity
  useEffect(() => {
    if (!open || !target || target.kind !== "quote") return;
    let cancelled = false;
    getQuoteNumber(target.id).then((res) => {
      if (!cancelled) setQuoteNumberInput(res.ok ? res.number : "");
    });
    return () => {
      cancelled = true;
    };
  }, [open, target?.kind, target?.id]);

  async function handleSaveNumber() {
    if (!target || target.kind !== "quote" || savingNumber) return;
    setSavingNumber(true);
    const res = await setQuoteNumber(target.id, quoteNumberInput);
    setSavingNumber(false);
    if (!res.ok) {
      toast.error("Couldn't update quote number", { description: res.error });
      return;
    }
    toast.success("Quote number updated");
    router.refresh();
  }

  async function handleDelete() {
    if (!target || deleting) return;
    setDeleting(true);
    let result: { ok: true } | { ok: false; error: string };
    if (target.kind === "quote") {
      const { deleteQuote } = await import("@/lib/actions/quotes");
      result = await deleteQuote(target.id);
    } else if (target.kind === "invoice") {
      const { deleteInvoice } = await import("@/lib/actions/invoices");
      result = await deleteInvoice(target.id);
    } else {
      const { deleteJob } = await import("@/lib/actions/jobs");
      result = await deleteJob(target.id);
    }
    setDeleting(false);
    if (!result.ok) {
      toast.error(`Couldn't delete ${target.kind}`, { description: result.error });
      return;
    }
    toast.success(`${target.kind[0]?.toUpperCase()}${target.kind.slice(1)} deleted`);
    router.push(target.list);
    router.refresh();
  }

  return (
    <>
      <Tooltip>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open debug panel">
                <Bug className="size-4" />
              </Button>
            </TooltipTrigger>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-72 p-0"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <header className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Bug className="size-4" />
                Debug
              </div>
            </header>

            <div className="space-y-4 p-3">
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Platform
                  </h3>
                  {isOverridden ? (
                    <button
                      type="button"
                      onClick={resetToDetected}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="size-3" /> Auto-detect
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">auto-detected</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <PlatformButton
                    active={platform === "mac"}
                    onClick={() => setPlatform("mac")}
                    label="Mac"
                    hint="⌘ ⌥ ⇧ ⌃"
                  />
                  <PlatformButton
                    active={platform === "windows"}
                    onClick={() => setPlatform("windows")}
                    label="Windows"
                    hint="Ctrl Alt Shift"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                  <span className="text-[11px] text-muted-foreground">Preview</span>
                  <Shortcut keys={["mod", "k"]} />
                </div>
              </section>

              <Separator />

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Toast preview
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <ToastPreviewButton
                    kind="success"
                    onClick={() =>
                      toast.success("Operation succeeded", {
                        description: "Your changes were saved.",
                      })
                    }
                  />
                  <ToastPreviewButton
                    kind="error"
                    onClick={() =>
                      toast.error("Operation failed", {
                        description: "Something went wrong. Please try again.",
                      })
                    }
                  />
                  <ToastPreviewButton
                    kind="loading"
                    onClick={() =>
                      toast.loading("Processing…", {
                        description: "Hang tight, this won't take long.",
                      })
                    }
                  />
                </div>
              </section>

              {isQuotesList ? (
                <>
                  <Separator />
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <FastForward className="size-3.5" /> Migrate
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5"
                      onClick={() => {
                        setOpen(false);
                        setMigrateOpen(true);
                      }}
                    >
                      <FastForward className="size-4" /> Migrate to invoices/jobs
                    </Button>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Fast-forward approved quotes to delivered, paid orders.
                    </p>
                  </section>
                </>
              ) : null}

              <Separator />

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CalendarClock className="size-3.5" /> Dates
                </h3>
                {target ? (
                  <EntityDatesEditor kind={target.kind} id={target.id} />
                ) : (
                  <p className="text-[11px] text-muted-foreground/60">
                    Open a quote, invoice, or job to edit its dates.
                  </p>
                )}
              </section>

              {/* Only renders when this job has a generated packing slip. */}
              {target?.kind === "job" ? <PackingSlipDebugSection jobId={target.id} /> : null}

              {target?.kind === "job" ? (
                <>
                  <Separator />
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <History className="size-3.5" /> Activity
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5"
                      onClick={() => {
                        setOpen(false);
                        setActivityOpen(true);
                      }}
                    >
                      <History className="size-4" /> Edit activity dates
                    </Button>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Backdate any event in this job's activity log.
                    </p>
                  </section>
                </>
              ) : null}

              {target?.kind === "quote" ? (
                <>
                  <Separator />
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Hash className="size-3.5" /> Quote number
                    </h3>
                    <div className="flex items-center gap-2">
                      <Input
                        value={quoteNumberInput}
                        onChange={(e) => setQuoteNumberInput(e.target.value)}
                        placeholder="MPBI-12384"
                        className="h-7 flex-1 text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveNumber}
                        disabled={savingNumber || quoteNumberInput.trim() === ""}
                      >
                        {savingNumber ? <Ring size="sm" className="text-current" /> : "Save"}
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Set this quote's number by hand — handy with random numbering.
                    </p>
                  </section>
                </>
              ) : null}

              <Separator />

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Danger zone
                </h3>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!target || deleting}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    target
                      ? "cursor-pointer border-destructive text-destructive hover:bg-destructive/10"
                      : "cursor-not-allowed border-border text-muted-foreground/40",
                  )}
                >
                  {deleting ? (
                    <Ring size="sm" className="text-current" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {target ? `Delete ${target.kind}` : "Delete (open a quote, invoice, or job)"}
                </button>
                {target ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Permanently wipes this {target.kind} and everything tied to it.
                  </p>
                ) : null}
              </section>
            </div>
          </PopoverContent>
        </Popover>
        <TooltipContent side="bottom">Debug</TooltipContent>
      </Tooltip>
      <MigrateQuotesDialog open={migrateOpen} onOpenChange={setMigrateOpen} />
      {target?.kind === "job" ? (
        <JobActivityDatesDialog
          open={activityOpen}
          onOpenChange={setActivityOpen}
          jobId={target.id}
        />
      ) : null}
    </>
  );
}

type PlatformButtonProps = {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
};

function PlatformButton({ active, onClick, label, hint }: PlatformButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
      aria-pressed={active}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="font-mono text-[10px] opacity-70">{hint}</span>
    </button>
  );
}

type ToastKind = "success" | "error" | "loading";

const toastKindStyles: Record<ToastKind, { border: string; iconWrap: string; label: string }> = {
  success: {
    border: "border-success hover:bg-success/10",
    iconWrap: "text-success",
    label: "Success",
  },
  error: {
    border: "border-destructive hover:bg-destructive/10",
    iconWrap: "text-destructive",
    label: "Fail",
  },
  loading: {
    border: "border-foreground hover:bg-foreground/10",
    iconWrap: "text-foreground",
    label: "Processing",
  },
};

function ToastPreviewButton({ kind, onClick }: { kind: ToastKind; onClick: () => void }) {
  const styles = toastKindStyles[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-md border bg-background px-2 py-2 text-[11px] font-medium text-foreground transition-colors",
        styles.border,
      )}
    >
      <span className={cn("flex size-4 items-center justify-center", styles.iconWrap)}>
        {kind === "success" ? <CircleCheck className="size-4" /> : null}
        {kind === "error" ? <TriangleAlert className="size-4" /> : null}
        {kind === "loading" ? <Ring size="sm" className="text-current" /> : null}
      </span>
      <span>{styles.label}</span>
    </button>
  );
}
