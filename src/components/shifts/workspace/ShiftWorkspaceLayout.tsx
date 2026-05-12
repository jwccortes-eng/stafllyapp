/**
 * ShiftWorkspaceLayout — desktop 2-column grid for the shift form pane.
 *
 * The right summary rail is owned by ShiftFormShell. This component arranges
 * the existing form sections into:
 *
 *   ┌─ Col 1: What & Where ──┐  ┌─ Col 2: Team & Operations ─┐
 *   │ basic info             │  │ team                        │
 *   │ job site               │  │ transportation              │
 *   │ meeting points         │  │ pay                         │
 *   └────────────────────────┘  └─────────────────────────────┘
 *   ┌─ Full-width: Additional details ──────────────────────────┐
 *
 * No business logic. Pure layout.
 */
import type { ReactNode } from "react";

interface Props {
  /** Generated display name banner (auto-title) shown above the columns. */
  displayName: string;
  /** Helper hint under the display name. */
  displayNameHint?: string;
  whatWhere: ReactNode;
  teamOps: ReactNode;
  advanced?: ReactNode;
}

export function ShiftWorkspaceLayout({
  displayName,
  displayNameHint,
  whatWhere,
  teamOps,
  advanced,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Auto display name banner */}
      <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-muted/30 to-background px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Nombre del turno
        </p>
        <h3 className="text-base font-bold font-heading mt-0.5 leading-tight truncate">
          {displayName}
        </h3>
        {displayNameHint && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{displayNameHint}</p>
        )}
      </div>

      {/* 2-column grid (collapses to single column under lg) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-3 min-w-0">{whatWhere}</div>
        <div className="space-y-3 min-w-0">{teamOps}</div>
      </div>

      {advanced && <div className="space-y-3">{advanced}</div>}
    </div>
  );
}
