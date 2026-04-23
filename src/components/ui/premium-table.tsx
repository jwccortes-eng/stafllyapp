import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortIndicator, type SortDirection } from "@/components/ui/sort-indicator";
import type { ReactNode } from "react";

/**
 * PremiumTable — opinionated wrapper over the base Table primitive.
 *
 * Goals:
 *   - sticky header
 *   - refined hover/selected row styles
 *   - sortable column helper
 *   - density toggle (comfortable / compact)
 *
 * It deliberately does NOT replace the base Table; it composes on top of it,
 * so existing usages are untouched.
 */

export type TableDensity = "comfortable" | "compact";

interface PremiumTableShellProps {
  children: ReactNode;
  density?: TableDensity;
  className?: string;
  /** Extra height to leave when sticky-header + scrolling is enabled. */
  maxHeightClass?: string;
}

export function PremiumTableShell({
  children,
  density = "comfortable",
  className,
  maxHeightClass,
}: PremiumTableShellProps) {
  return (
    <div
      data-density={density}
      className={cn(
        "rounded-xl border border-border/50 bg-card overflow-hidden",
        className,
      )}
    >
      <div className={cn("relative overflow-auto", maxHeightClass)}>
        <Table>{children}</Table>
      </div>
    </div>
  );
}

export function PremiumTableHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TableHeader>
      <TableRow
        className={cn(
          "sticky top-0 z-10 bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-muted/30 hover:bg-muted/40",
          className,
        )}
      >
        {children}
      </TableRow>
    </TableHeader>
  );
}

interface PremiumTableHeadProps {
  children: ReactNode;
  className?: string;
  sortable?: boolean;
  sortDirection?: SortDirection;
  onSort?: () => void;
  align?: "left" | "right" | "center";
  width?: string;
}

export function PremiumTableHead({
  children,
  className,
  sortable,
  sortDirection,
  onSort,
  align = "left",
  width,
}: PremiumTableHeadProps) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const inner = (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 select-none",
        align === "right" && "justify-end w-full",
        align === "center" && "justify-center w-full",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
      {sortable && <SortIndicator direction={sortDirection ?? null} />}
    </div>
  );
  return (
    <TableHead
      className={cn(alignClass, sortable && "cursor-pointer hover:bg-muted/40 transition-colors", className)}
      style={width ? { width } : undefined}
      onClick={sortable ? onSort : undefined}
    >
      {inner}
    </TableHead>
  );
}

interface PremiumTableRowProps {
  children: ReactNode;
  selected?: boolean;
  muted?: boolean;
  onClick?: () => void;
  className?: string;
}

export function PremiumTableRow({ children, selected, muted, onClick, className }: PremiumTableRowProps) {
  return (
    <TableRow
      onClick={onClick}
      className={cn(
        "group transition-colors border-border/40",
        "hover:bg-accent/30",
        selected && "bg-primary/[0.06] hover:bg-primary/[0.08]",
        muted && "opacity-50",
        onClick && "cursor-pointer",
        // density-aware row height
        "data-[density=compact]:h-9 data-[density=comfortable]:h-12",
        className,
      )}
    >
      {children}
    </TableRow>
  );
}

interface PremiumTableCellProps {
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  numeric?: boolean;
}

export function PremiumTableCell({ children, className, align, numeric }: PremiumTableCellProps) {
  const a = align ?? (numeric ? "right" : "left");
  return (
    <TableCell
      className={cn(
        "py-2 text-xs",
        a === "right" && "text-right",
        a === "center" && "text-center",
        numeric && "tabular-nums font-medium",
        className,
      )}
    >
      {children}
    </TableCell>
  );
}

export { TableBody as PremiumTableBody };
