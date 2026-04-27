/**
 * AddressPreviewCard — compact "Stripe-like" card visualizing a normalized address.
 * Shows: formatted address (bold), city/state/zip, status + zone chips, Maps button.
 */
import { MapPin, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StructuredAddress } from "@/lib/address";
import { AddressStatusChip } from "./AddressStatusChip";

interface Props {
  address: StructuredAddress;
  className?: string;
  compact?: boolean;
}

export function AddressPreviewCard({ address, className, compact }: Props) {
  if (!address.formatted_address) return null;

  const subline = [address.city, address.state, address.postal_code]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-card/40 p-3 transition-colors hover:bg-card/60",
        compact && "p-2.5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <MapPin className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold leading-snug text-foreground">
            {address.address_line1 || address.formatted_address}
          </p>
          {subline && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subline}</p>
          )}
          {!subline && address.address_line1 && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {address.formatted_address}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <AddressStatusChip status={address.validation_status} />
            {address.operational_zone && (
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary">
                {address.operational_zone}
              </span>
            )}
            {address.country && address.country !== "US" && (
              <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                {address.country}
              </span>
            )}
          </div>
        </div>

        {address.maps_url && (
          <a
            href={address.maps_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <ExternalLink className="h-3 w-3" />
            Maps
          </a>
        )}
      </div>
    </div>
  );
}
