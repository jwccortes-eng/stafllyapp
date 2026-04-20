import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Search, ChevronDown, X, Check, Car, Send } from "lucide-react";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { cn } from "@/lib/utils";
import type { Employee } from "./types";

export interface SingleEmployeePickerProps {
  employees: Employee[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  /** Allow choosing the same employee already selected elsewhere; show usage count */
  usageCount?: (id: string) => number;
  placeholder?: string;
  /** When true, picking the value clears it (unassign) */
  allowClear?: boolean;
  /** Show driver badge for employees with a car */
  highlightDrivers?: boolean;
  /** Restrict the list to driver-only when true */
  driversOnly?: boolean;
  /** Show portal-access state badges (Active / Pending / New) per row */
  showPortalState?: boolean;
  /** Inline invite action triggered from a row (admin-only flow) */
  onInviteEmployee?: (employee: Employee) => void;
  triggerClassName?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Optional label rendered when nothing is selected */
  emptyLabel?: string;
  align?: "start" | "center" | "end";
}

import { isEmployeeDriver } from "./types";
const isDriver = (e: Employee) => isEmployeeDriver(e);

type PortalState = "active" | "pending" | "new";

function resolvePortalState(e: Employee): PortalState {
  if (e.user_id) return "active";
  if (e.access_pin) return "pending";
  return "new";
}

const PORTAL_BADGE: Record<PortalState, { label: string; className: string }> = {
  active: { label: "Activo", className: "bg-[hsl(var(--earning))]/12 text-[hsl(var(--earning))] border-[hsl(var(--earning))]/25" },
  pending: { label: "Pendiente", className: "bg-warning/12 text-warning border-warning/25" },
  new: { label: "Nuevo", className: "bg-muted text-muted-foreground border-border/40" },
};

/**
 * Unified single-employee selector for the Shifts module.
 * - Searchable (name, role, phone, group)
 * - Alphabetical sorting
 * - Avatar + role context
 * - Optional usage counter (e.g. multiple rides per driver)
 * - Optional driver-only filtering / driver highlight
 */
export function SingleEmployeePicker({
  employees,
  value,
  onChange,
  usageCount,
  placeholder = "Seleccionar empleado...",
  allowClear = true,
  highlightDrivers = false,
  driversOnly = false,
  showPortalState = false,
  onInviteEmployee,
  triggerClassName,
  size = "md",
  disabled = false,
  emptyLabel,
  align = "start",
}: SingleEmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const pool = useMemo(
    () => (driversOnly ? employees.filter(isDriver) : employees),
    [employees, driversOnly],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? pool.filter(e =>
          `${e.first_name ?? ""} ${e.last_name ?? ""} ${e.phone_number ?? ""} ${e.employee_role ?? ""} ${e.groups ?? ""}`
            .toLowerCase()
            .includes(q),
        )
      : pool;
    return [...list].sort((a, b) =>
      `${a.first_name ?? ""} ${a.last_name ?? ""}`.localeCompare(`${b.first_name ?? ""} ${b.last_name ?? ""}`),
    );
  }, [pool, search]);

  const selected = value ? employees.find(e => e.id === value) ?? null : null;

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const triggerHeight = size === "sm" ? "h-8" : "h-9";
  const triggerText = size === "sm" ? "text-[11px]" : "text-sm";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            triggerHeight,
            triggerText,
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2 min-w-0">
              <EmployeeAvatar
                firstName={selected.first_name}
                lastName={selected.last_name}
                avatarUrl={selected.avatar_url}
                gender={selected.gender}
                size="xs"
              />
              <span className="truncate">
                {formatPersonName(selected.first_name)} {formatPersonName(selected.last_name)}
              </span>
              {highlightDrivers && isDriver(selected) && (
                <Car className="h-3 w-3 text-primary/70 shrink-0" />
              )}
            </span>
          ) : (
            <span className="truncate">{emptyLabel ?? placeholder}</span>
          )}
          <span className="flex items-center gap-1 shrink-0">
            {selected && allowClear && (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                className="rounded-sm p-0.5 hover:bg-muted text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align={align}>
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="h-8 text-xs pl-8"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
            {filtered.length} {filtered.length === 1 ? "empleado" : "empleados"}
            {driversOnly ? " · solo conductores" : ""}
          </p>
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Sin resultados</p>
          ) : (
            filtered.map(emp => {
              const used = usageCount?.(emp.id) ?? 0;
              const isSelected = emp.id === value;
              const empIsDriver = isDriver(emp);
              const portalState = resolvePortalState(emp);
              const portalBadge = PORTAL_BADGE[portalState];
              const canInvite = !!onInviteEmployee && portalState !== "active" && !!(emp.phone_number || emp.email);
              return (
                <div
                  key={emp.id}
                  className={cn(
                    "flex items-center gap-2 w-full px-2.5 py-2 text-xs hover:bg-accent/60 transition-colors border-b border-border/10 last:border-0",
                    isSelected && "bg-primary/[0.07]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(emp.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <EmployeeAvatar
                      firstName={emp.first_name}
                      lastName={emp.last_name}
                      avatarUrl={emp.avatar_url}
                      gender={emp.gender}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate flex items-center gap-1">
                        {formatPersonName(emp.first_name)} {formatPersonName(emp.last_name)}
                        {highlightDrivers && empIsDriver && (
                          <Car className="h-3 w-3 text-primary/70 shrink-0" />
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {emp.employee_role && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {formatDisplayText(emp.employee_role, "label")}
                          </span>
                        )}
                        {emp.phone_number && (
                          <span className="text-[10px] text-muted-foreground/80 truncate">· {emp.phone_number}</span>
                        )}
                      </div>
                    </div>
                  </button>
                  {showPortalState && (
                    <Badge variant="outline" className={cn("text-[9px] shrink-0", portalBadge.className)}>
                      {portalBadge.label}
                    </Badge>
                  )}
                  {used > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[9px] bg-primary/10 text-primary border-primary/20 shrink-0"
                    >
                      {used}×
                    </Badge>
                  )}
                  {canInvite && (
                    <button
                      type="button"
                      title={portalState === "pending" ? "Reenviar invitación" : "Enviar invitación"}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onInviteEmployee?.(emp);
                      }}
                      className="rounded-md p-1 hover:bg-primary/10 text-primary shrink-0"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  )}
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
