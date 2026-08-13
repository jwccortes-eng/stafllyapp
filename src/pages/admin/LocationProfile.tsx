/**
 * Location Profile — physical-place detail page (Phase 10B).
 *
 * Read-first. Reuses existing tables: locations, scheduled_shifts, clients,
 * worker_client_preferences. No schema changes, no payroll/time_entries/
 * attendance writes, no worker portal impact.
 *
 * A shift "happens at" this location if ANY of these match:
 *   scheduled_shifts.location_id = id
 *   scheduled_shifts.job_site_location_id = id
 *   scheduled_shifts.meeting_point_location_id = id
 *
 * Strict tenant scoping via useCompany().selectedCompanyId.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkerPreferenceList } from "@/components/preferences/WorkerPreferenceList";
import {
  ArrowLeft, MapPin, Building2, CalendarDays, Users, Pencil, Loader2,
  AlertCircle, Star, Phone, Mail, Car, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationRow {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string;
  client_id: string | null;
  geofence_radius: number | null;
  deleted_at: string | null;
  default_pay_type: string | null;
  default_clock_method: string | null;
  require_car: boolean | null;
  default_instructions: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  client?: { id: string; name: string } | null;
}

interface ShiftRow {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  title: string | null;
  status: string | null;
  publication_status: string | null;
  location_id: string | null;
  job_site_location_id: string | null;
  meeting_point_location_id: string | null;
  client_id: string | null;
  client?: { id: string; name: string } | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function LocationProfile() {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const { canAccessAdminForCompany, hasModuleAccess, role } = useAuth();
  const { can } = usePermissions();
  const { selectedCompanyId } = useCompany();
  const isPrivileged = canAccessAdminForCompany(selectedCompanyId);
  const canEdit =
    can("locations.edit");

  const [loc, setLoc] = useState<LocationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState<ShiftRow[]>([]);
  const [recent, setRecent] = useState<ShiftRow[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);

  /* ── Header fetch ─────────────────────────────────────── */
  useEffect(() => {
    let cancel = false;
    if (!locationId || !selectedCompanyId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("locations")
        .select(`
          id, company_id, name, address, city, state, status, client_id,
          geofence_radius, deleted_at, default_pay_type, default_clock_method,
          require_car, default_instructions, contact_name, contact_phone, contact_email,
          client:clients!locations_client_id_fkey ( id, name )
        `)
        .eq("id", locationId)
        .eq("company_id", selectedCompanyId)
        .maybeSingle();
      if (cancel) return;
      if (error) {
        console.warn("[LocationProfile] load error", error);
      }
      setLoc((data as any) ?? null);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [locationId, selectedCompanyId]);

  useEffect(() => {
    document.title = loc?.name ? `${loc.name} · Locations` : "Location · Stafly";
  }, [loc?.name]);

  /* ── Shifts at this location (any of 3 FK columns) ────── */
  useEffect(() => {
    let cancel = false;
    if (!locationId || !selectedCompanyId) return;
    (async () => {
      setShiftsLoading(true);
      const orFilter =
        `location_id.eq.${locationId},job_site_location_id.eq.${locationId},meeting_point_location_id.eq.${locationId}`;

      const baseSelect = `
        id, date, start_time, end_time, title, status, publication_status,
        location_id, job_site_location_id, meeting_point_location_id, client_id,
        client:clients!scheduled_shifts_client_id_fkey ( id, name )
      `;

      const [{ data: up }, { data: rec }] = await Promise.all([
        supabase
          .from("scheduled_shifts")
          .select(baseSelect)
          .eq("company_id", selectedCompanyId)
          .is("deleted_at", null)
          .gte("date", todayISO())
          .or(orFilter)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(50),
        supabase
          .from("scheduled_shifts")
          .select(baseSelect)
          .eq("company_id", selectedCompanyId)
          .is("deleted_at", null)
          .lt("date", todayISO())
          .gte("date", daysAgoISO(30))
          .or(orFilter)
          .order("date", { ascending: false })
          .order("start_time", { ascending: false })
          .limit(20),
      ]);
      if (cancel) return;
      setUpcoming((up as any) ?? []);
      setRecent((rec as any) ?? []);
      setShiftsLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [locationId, selectedCompanyId]);

  /* ── Distinct clients seen at this location (combined) ── */
  const clientsSeen = useMemo(() => {
    const all = [...upcoming, ...recent];
    const map = new Map<
      string,
      { id: string; name: string; count: number; lastDate: string }
    >();
    for (const s of all) {
      if (!s.client_id || !s.client) continue;
      const cur = map.get(s.client_id);
      if (cur) {
        cur.count += 1;
        if (s.date > cur.lastDate) cur.lastDate = s.date;
      } else {
        map.set(s.client_id, {
          id: s.client_id,
          name: s.client.name,
          count: 1,
          lastDate: s.date,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [upcoming, recent]);

  /* ── Render ───────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loc) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4 animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/locations")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to locations
        </Button>
        <EmptyState
          icon={AlertCircle}
          title="Location not found"
          description="This location may have been archived or belongs to another company."
        />
      </div>
    );
  }

  const addressLine = [loc.address, loc.city, loc.state].filter(Boolean).join(", ");
  const isArchived = !!loc.deleted_at;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5 animate-fade-in">
      {/* Back */}
      <Link
        to="/app/locations"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Locations
      </Link>

      {/* Hero */}
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-card to-muted/20 border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <MapPin className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{loc.name}</h1>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] capitalize",
                  isArchived && "bg-muted text-muted-foreground",
                  !isArchived && loc.status === "active" && "bg-primary/10 text-primary border-primary/20",
                )}
              >
                {isArchived ? "Archived" : loc.status}
              </Badge>
              {loc.require_car && (
                <Badge variant="outline" className="text-[10px] border-warning/30 text-warning gap-1">
                  <Car className="h-3 w-3" /> Car required
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {addressLine && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {addressLine}
                </span>
              )}
              {loc.client && (
                <Link
                  to={`/app/clients/${loc.client.id}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  <Building2 className="h-3 w-3" /> {loc.client.name}
                </Link>
              )}
              {loc.contact_name && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> {loc.contact_name}
                </span>
              )}
              {loc.contact_phone && (
                <a href={`tel:${loc.contact_phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Phone className="h-3 w-3" /> {loc.contact_phone}
                </a>
              )}
              {loc.contact_email && (
                <a href={`mailto:${loc.contact_email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Mail className="h-3 w-3" /> {loc.contact_email}
                </a>
              )}
              {loc.geofence_radius != null && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Geofence {loc.geofence_radius}m
                </span>
              )}
            </div>
          </div>
          {canEdit && !isArchived && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => navigate(`/app/locations?edit=${loc.id}`)}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          <KpiCard size="sm" accent="primary" icon={<CalendarDays className="h-3.5 w-3.5" />}
            value={upcoming.length} label="Upcoming shifts" />
          <KpiCard size="sm" accent="muted" icon={<Clock className="h-3.5 w-3.5" />}
            value={recent.length} label="Last 30 days" />
          <KpiCard size="sm" accent="primary" icon={<Building2 className="h-3.5 w-3.5" />}
            value={clientsSeen.length} label="Clients seen" />
          <KpiCard size="sm" accent="warning" icon={<Star className="h-3.5 w-3.5" />}
            value={loc.default_pay_type === "daily" ? "Daily" : "Hourly"} label="Default pay" />
        </div>
      </Card>

      {/* Upcoming shifts */}
      <Section
        title="Upcoming shifts at this location"
        icon={<CalendarDays className="h-4 w-4" />}
      >
        {shiftsLoading ? (
          <Loader />
        ) : upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No upcoming shifts" description="No scheduled shifts at this location." />
        ) : (
          <ShiftList shifts={upcoming} onOpen={(id) => navigate(`/app/shifts?tab=upcoming&shift=${id}&manageTeam=1`)} highlightLocationId={loc.id} />
        )}
      </Section>

      {/* Recent shifts */}
      <Section
        title="Recent shifts (last 30 days)"
        icon={<Clock className="h-4 w-4" />}
      >
        {shiftsLoading ? (
          <Loader />
        ) : recent.length === 0 ? (
          <EmptyState icon={Clock} title="No recent shifts" description="No shifts at this location in the last 30 days." />
        ) : (
          <ShiftList shifts={recent} onOpen={(id) => navigate(`/app/shifts?tab=today&shift=${id}&manageTeam=1`)} highlightLocationId={loc.id} />
        )}
      </Section>

      {/* Worker fit */}
      {isPrivileged && selectedCompanyId && (
        <Section title="Venue worker fit" icon={<Star className="h-4 w-4" />}>
          <p className="text-[11px] text-muted-foreground mb-3">
            Preferred workers appear higher in Recommended for this location. Blocked workers cannot be assigned from Recommended until cleared. Internal — not visible to workers.
          </p>
          <WorkerPreferenceList
            mode="location"
            companyId={selectedCompanyId}
            targetId={loc.id}
            canManage={isPrivileged}
          />
        </Section>
      )}

      {/* Clients seen here */}
      <Section title="Clients seen here" icon={<Building2 className="h-4 w-4" />}>
        {clientsSeen.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No clients yet"
            description="No clients have requested work at this location in the last 30 days or upcoming."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {clientsSeen.map((c) => (
              <Link
                key={c.id}
                to={`/app/clients/${c.id}`}
                className="rounded-lg border border-border/40 hover:border-border hover:bg-muted/30 transition-colors p-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Last: {format(new Date(c.lastDate), "MMM d, yyyy", { locale: enUS })}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {c.count} {c.count === 1 ? "shift" : "shifts"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-6 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  );
}

function ShiftList({
  shifts,
  onOpen,
  highlightLocationId,
}: {
  shifts: ShiftRow[];
  onOpen: (id: string) => void;
  highlightLocationId: string;
}) {
  return (
    <div className="space-y-1.5">
      {shifts.map((s) => {
        const role =
          s.location_id === highlightLocationId
            ? "Job site"
            : s.job_site_location_id === highlightLocationId
              ? "Job site"
              : s.meeting_point_location_id === highlightLocationId
                ? "Meeting point"
                : null;
        const dateLabel = format(new Date(s.date), "EEE MMM d", { locale: enUS });
        const time =
          (s.start_time?.slice(0, 5) ?? "—") +
          (s.end_time ? ` – ${s.end_time.slice(0, 5)}` : "");
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            className="w-full text-left rounded-lg border border-border/40 hover:border-border hover:bg-muted/30 transition-colors p-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {s.title ?? "Untitled shift"}
                {s.client?.name ? <span className="text-muted-foreground font-normal"> · {s.client.name}</span> : null}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {dateLabel} · {time}
                {role ? <span className="ml-1.5">· {role}</span> : null}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {s.publication_status && (
                <Badge variant="outline" className="text-[9px] capitalize">
                  {String(s.publication_status).replace(/_/g, " ")}
                </Badge>
              )}
              {s.status && (
                <Badge variant="secondary" className="text-[9px] capitalize">
                  {s.status}
                </Badge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
