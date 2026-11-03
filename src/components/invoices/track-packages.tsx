"use client";

import { ExternalLink, Truck } from "lucide-react";
import type { ReactNode } from "react";

import { CarrierLogo } from "@/components/invoices/carrier-logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CARRIER_LABELS, type TrackingGroup, trackingUrl } from "@/lib/shipping/carriers";

/** Every link that tracks the order: one per carrier group when the carrier
 *  can take several numbers at once, else one per number. */
function trackingLinks(groups: TrackingGroup[]) {
  return groups.flatMap((g) => {
    if (g.url) {
      const label =
        g.numbers.length === 1
          ? (g.numbers[0] ?? "")
          : `All ${g.numbers.length} ${CARRIER_LABELS[g.carrier]} packages`;
      return [{ key: `${g.carrier}-all`, carrier: g.carrier, label, url: g.url }];
    }
    return g.numbers.flatMap((number) => {
      const url = trackingUrl(g.carrier, number);
      return url ? [{ key: `${g.carrier}-${number}`, carrier: g.carrier, label: number, url }] : [];
    });
  });
}

/**
 * "Track" button for an invoice. A plain link when a single tab can track the
 * whole order (one package, or several with one carrier that supports it);
 * otherwise a menu with a link per carrier / per package. Nothing when no
 * package has a trackable number.
 */
export function TrackPackagesButton({ groups }: { groups: TrackingGroup[] }) {
  const links = trackingLinks(groups);
  const [only] = links;
  if (!only) return null;

  if (links.length === 1) {
    return (
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <a href={only.url} target="_blank" rel="noopener noreferrer">
          <Truck className="size-3.5" /> Track
        </a>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Truck className="size-3.5" /> Track
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Opens the carrier's tracking page
        </DropdownMenuLabel>
        {links.map((l) => (
          <DropdownMenuItem key={l.key} asChild className="gap-2">
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              <CarrierLogo carrier={l.carrier} />
              <span className="min-w-0 flex-1 truncate">{l.label}</span>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Saved tracking as compact links, for the shipping card. One package reads
 * exactly as it always has (logo + number); several collapse to one line per
 * carrier that opens every package in a single tab.
 */
export function TrackingSummary({ groups }: { groups: TrackingGroup[] }) {
  const total = groups.reduce((sum, g) => sum + g.numbers.length, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-1.5">
      {groups.map((g) => (
        <div key={g.carrier} className="flex items-start gap-2 text-sm">
          <CarrierLogo carrier={g.carrier} />
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {g.url ? (
              <TrackLink href={g.url}>
                {g.numbers.length === 1 ? g.numbers[0] : `Track all ${g.numbers.length} packages`}
              </TrackLink>
            ) : (
              g.numbers.map((number) => {
                const url = trackingUrl(g.carrier, number);
                return url ? (
                  <TrackLink key={number} href={url}>
                    {number}
                  </TrackLink>
                ) : (
                  <span key={number} className="text-muted-foreground">
                    {number}
                  </span>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3.5" />
    </a>
  );
}
