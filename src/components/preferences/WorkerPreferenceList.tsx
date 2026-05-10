/**
 * WorkerPreferenceList — admin-only reusable list of worker_client_preferences.
 *
 * Modes:
 *  - mode="worker"   → shows ALL active preferences for one employee (grouped by Clients / Locations).
 *  - mode="client"   → shows ALL active preferences for one client    (grouped by preference type).
 *  - mode="location" → shows ALL active preferences for one location  (grouped by preference type).
 *
 * Read-first. The only mutation is "Clear" which calls archive_worker_client_preference RPC.
 *
 * Strict tenant scoping — the caller must pass `companyId` and a target id.
 * RLS additionally enforces can_manage_shift_company.
 *
 * Does NOT touch payroll, time_entries, attendance, or worker portal.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { Building2, MapPin, Users, X, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  WorkerPreferenceBadge,
  PREFERENCE_LABELS,
  type WorkerPreferenceType,
} from "./WorkerPreferenceBadge";

interface PreferenceRow {
  id: string;
  employee_id: string;
  client_id: string | null;
  location_id: string | null;
  preference_type: WorkerPreferenceType;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  employee?: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    employer_identification: string | null;
  } | null;
  client?: { id: string; name: string } | null;
  location?: { id: string; name: string; city: string | null } | null;
}

type Mode = "worker" | "client" | "location";

const ORDER: WorkerPreferenceType[] = [
  "preferred",
  "prequalified",
  "captain_preferred",
  "driver_preferred",
  "not_recommended",
  "blocked",
];

export function WorkerPreferenceList({
  mode,
  companyId,
  targetId,
  canManage = true,
  onChanged,
}: {
  mode: Mode;
  companyId: string;
  /** employee_id when mode="worker", client_id when mode="client", location_id when mode="location". */
  targetId: string;
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<PreferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const select = `
      id, employee_id, client_id, location_id, preference_type,
      reason, notes, created_at, updated_at,
      employee:employees!worker_client_preferences_employee_id_fkey ( first_name, last_name, phone_number, employer_identification ),
      client:clients!worker_client_preferences_client_id_fkey ( id, name ),
      location:locations!worker_client_preferences_location_id_fkey ( id, name, city )
    `;
    let q = supabase
      .from("worker_client_preferences")
      .select(select)
      .eq("company_id", companyId)
      .is("archived_at", null);

    if (mode === "worker") q = q.eq("employee_id", targetId);
    else if (mode === "client") q = q.eq("client_id", targetId);
    else q = q.eq("location_id", targetId);

    const { data, error } = await q.order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load preferences", description: error.message, variant: "destructive" });
      setRows([]);
    } else {
      setRows((data as any) ?? []);
    }
    setLoading(false);
  }, [mode, companyId, targetId, toast]);

  useEffect(() => {
    if (companyId && targetId) fetchRows();
  }, [fetchRows, companyId, targetId]);

  const handleClear = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.rpc("archive_worker_client_preference", {
      p_preference_id: id,
      p_reason: null,
    });
    setBusyId(null);
    if (error) {
      toast({ title: "Couldn't clear", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Preference cleared" });
    setRows(prev => prev.filter(r => r.id !== id));
    onChanged?.();
  };

  /* ── Grouping ─────────────────────────────────────────── */

  const grouped = useMemo(() => {
    if (mode === "worker") {
      const clients: PreferenceRow[] = [];
      const locations: PreferenceRow[] = [];
      for (const r of rows) {
        if (r.client_id) clients.push(r);
        else if (r.location_id) locations.push(r);
      }
      return { clients, locations };
    }
    const byType = new Map<WorkerPreferenceType, PreferenceRow[]>();
    for (const r of rows) {
      const list = byType.get(r.preference_type) ?? [];
      list.push(r);
      byType.set(r.preference_type, list);
    }
    return { byType };
  }, [rows, mode]);

  /* ── Render ───────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    const emptyCopy =
      mode === "worker"
        ? "No client or location fit has been saved for this worker yet."
        : mode === "client"
          ? "No preferred or blocked workers saved for this client yet."
          : "No preferred or blocked workers saved for this venue yet.";
    return (
      <EmptyState
        icon={mode === "worker" ? Building2 : Users}
        title="No fit saved"
        description={emptyCopy}
      />
    );
  }

  if (mode === "worker") {
    const { clients = [], locations = [] } = grouped as { clients: PreferenceRow[]; locations: PreferenceRow[] };
    return (
      <div className="space-y-4">
        {clients.length > 0 && (
          <PreferenceGroup
            title="Clients"
            icon={<Building2 className="h-3.5 w-3.5" />}
            items={clients}
            renderTarget={(r) =>
              r.client ? (
                <Link to={`/app/clients/${r.client.id}`} className="font-medium hover:underline">
                  {r.client.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">Unknown client</span>
              )
            }
            canManage={canManage}
            busyId={busyId}
            onClear={handleClear}
          />
        )}
        {locations.length > 0 && (
          <PreferenceGroup
            title="Locations"
            icon={<MapPin className="h-3.5 w-3.5" />}
            items={locations}
            renderTarget={(r) =>
              r.location ? (
                <span className="font-medium">
                  {r.location.name}
                  {r.location.city ? ` · ${r.location.city}` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">Unknown location</span>
              )
            }
            canManage={canManage}
            busyId={busyId}
            onClear={handleClear}
          />
        )}
      </div>
    );
  }

  // client / location mode → group by type
  const { byType } = grouped as { byType: Map<WorkerPreferenceType, PreferenceRow[]> };
  return (
    <div className="space-y-4">
      {ORDER.filter(t => byType.has(t)).map(type => (
        <PreferenceGroup
          key={type}
          title={PREFERENCE_LABELS[type]}
          icon={<WorkerPreferenceBadge type={type} className="text-[9px]" />}
          items={byType.get(type)!}
          renderTarget={(r) => {
            const name = r.employee
              ? `${r.employee.first_name ?? ""} ${r.employee.last_name ?? ""}`.trim() || "Unknown worker"
              : "Unknown worker";
            const subtitle = [
              r.employee?.employer_identification ? `#${r.employee.employer_identification}` : null,
              r.employee?.phone_number ?? null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div className="space-y-0.5">
                <div className="font-medium">{name}</div>
                {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
              </div>
            );
          }}
          canManage={canManage}
          busyId={busyId}
          onClear={handleClear}
          hideTypeBadge
        />
      ))}
    </div>
  );
}

function PreferenceGroup({
  title,
  icon,
  items,
  renderTarget,
  canManage,
  busyId,
  onClear,
  hideTypeBadge,
}: {
  title: string;
  icon: React.ReactNode;
  items: PreferenceRow[];
  renderTarget: (r: PreferenceRow) => React.ReactNode;
  canManage: boolean;
  busyId: string | null;
  onClear: (id: string) => void;
  hideTypeBadge?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="text-muted-foreground/60">· {items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.map(r => (
          <Card key={r.id} className="rounded-lg border-border/40">
            <CardContent className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1 text-xs">
                {renderTarget(r)}
                <div className="flex flex-wrap items-center gap-2">
                  {!hideTypeBadge && <WorkerPreferenceBadge type={r.preference_type} />}
                  <span className="text-[10px] text-muted-foreground">
                    Updated {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true, locale: enUS })}
                  </span>
                </div>
                {(r.reason || r.notes) && (
                  <p className="text-[11px] text-muted-foreground italic">
                    {r.reason ?? r.notes}
                  </p>
                )}
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                  disabled={busyId === r.id}
                  onClick={() => onClear(r.id)}
                  aria-label="Clear preference"
                >
                  {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  Clear
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
