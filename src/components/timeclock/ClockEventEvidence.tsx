/**
 * ClockEventEvidence — read-only admin evidence panel for a single
 * shift × employee. Surfaces existing GPS / clock / alert data so
 * admins can audit attendance.
 *
 * READ ONLY. Never writes to time_entries, clock_events, clock_alerts,
 * shift_assignments, payroll, pay_periods, reconciliation, or anything else.
 * No new columns, no schema changes, no RLS changes. Uses only fields
 * already populated by Fase A (PortalClock) and existing tables.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { distanceMeters } from "@/lib/geo-helpers";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Smartphone,
  XCircle,
  HelpCircle,
  Image as ImageIcon,
  ShieldCheck,
} from "lucide-react";
import LocationMiniMap from "@/components/locations/LocationMiniMap";

interface Props {
  shiftId: string;
  employeeId: string;
  companyId: string; // existing tenant scope (RLS untouched, still enforced)
  employeeName?: string;
}

interface TimeEntryRow {
  id: string;
  clock_in: string | null;
  clock_out: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_within_geofence: boolean | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  clock_out_within_geofence: boolean | null;
  status: string | null;
  entry_source: string | null;
  notes: string | null;
}

interface ClockEventRow {
  id: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  created_at: string;
  clock_method: string | null;
  photo_url: string | null;
  device: string | null;
  address: string | null;
}

interface ClockAlertRow {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface LocationRow {
  id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number | null;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d · HH:mm:ss");
  } catch {
    return "—";
  }
}

function geofenceLabel(v: boolean | null): {
  label: string;
  tone: "ok" | "warn" | "muted";
  Icon: typeof CheckCircle2;
} {
  if (v === true) return { label: "Inside geofence", tone: "ok", Icon: CheckCircle2 };
  if (v === false) return { label: "Outside geofence", tone: "warn", Icon: XCircle };
  return { label: "Unknown", tone: "muted", Icon: HelpCircle };
}

const TONE_CLS: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  bad: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

const SEVERITY_CLS: Record<string, string> = {
  critical: TONE_CLS.bad,
  high: TONE_CLS.bad,
  medium: TONE_CLS.warn,
  low: TONE_CLS.info,
};

export function ClockEventEvidence({
  shiftId,
  employeeId,
  companyId,
  employeeName,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [events, setEvents] = useState<ClockEventRow[]>([]);
  const [alerts, setAlerts] = useState<ClockAlertRow[]>([]);
  const [location, setLocation] = useState<LocationRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1) Shift → location_id
      const { data: shift } = await supabase
        .from("scheduled_shifts")
        .select("location_id")
        .eq("id", shiftId)
        .maybeSingle();

      // 2) Parallel reads scoped by company_id (RLS still applies)
      const [teRes, ceRes, caRes, locRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select(
            "id, clock_in, clock_out, clock_in_lat, clock_in_lng, clock_in_within_geofence, clock_out_lat, clock_out_lng, clock_out_within_geofence, status, entry_source, notes",
          )
          .eq("shift_id", shiftId)
          .eq("employee_id", employeeId)
          .eq("company_id", companyId)
          .order("clock_in", { ascending: true }),
        supabase
          .from("clock_events")
          .select(
            "id, type, latitude, longitude, accuracy, created_at, clock_method, photo_url, device, address",
          )
          .eq("shift_id", shiftId)
          .eq("employee_id", employeeId)
          .eq("company_id", companyId)
          .order("created_at", { ascending: true }),
        supabase
          .from("clock_alerts")
          .select("id, type, severity, description, resolved_at, created_at")
          .eq("shift_id", shiftId)
          .eq("employee_id", employeeId)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        shift?.location_id
          ? supabase
              .from("locations")
              .select("id, name, latitude, longitude, geofence_radius")
              .eq("id", shift.location_id)
              .eq("company_id", companyId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      if (cancelled) return;
      setEntries((teRes.data ?? []) as TimeEntryRow[]);
      setEvents((ceRes.data ?? []) as ClockEventRow[]);
      setAlerts((caRes.data ?? []) as ClockAlertRow[]);
      setLocation((locRes?.data ?? null) as LocationRow | null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [shiftId, employeeId, companyId]);

  const primary = entries[0] ?? null;

  const inDistance = useMemo(() => {
    if (!location?.latitude || !location?.longitude) return null;
    if (!primary?.clock_in_lat || !primary?.clock_in_lng) return null;
    return distanceMeters(
      location.latitude,
      location.longitude,
      primary.clock_in_lat,
      primary.clock_in_lng,
    );
  }, [location, primary]);

  const outDistance = useMemo(() => {
    if (!location?.latitude || !location?.longitude) return null;
    if (!primary?.clock_out_lat || !primary?.clock_out_lng) return null;
    return distanceMeters(
      location.latitude,
      location.longitude,
      primary.clock_out_lat,
      primary.clock_out_lng,
    );
  }, [location, primary]);

  const inEvent = events.find((e) => e.type === "clock_in" || e.type === "arrival");
  const outEvent = events.find((e) => e.type === "clock_out" || e.type === "departure");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!primary && events.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-6 text-center">
        <Clock className="h-6 w-6 mx-auto text-muted-foreground/60 mb-2" />
        <p className="text-sm font-medium">No clock evidence yet</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {employeeName ? `${employeeName} has` : "This worker has"} no clock-in or
          clock-out recorded for this shift.
        </p>
      </div>
    );
  }

  const inGeo = geofenceLabel(primary?.clock_in_within_geofence ?? null);
  const outGeo = geofenceLabel(primary?.clock_out_within_geofence ?? null);

  return (
    <div className="space-y-4">
      {/* Top banner: read-only disclaimer */}
      <div className="flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-sky-800 dark:text-sky-200">
          Read-only evidence. This panel does not modify clock entries, attendance
          validation, payroll or alerts.
        </p>
      </div>

      {/* Expected job site */}
      <Section title="Expected job site" icon={MapPin}>
        {location?.latitude && location?.longitude ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Field label="Location">{location.name ?? "—"}</Field>
              <Field label="Geofence radius">
                {location.geofence_radius != null
                  ? `${location.geofence_radius} m`
                  : "Not set"}
              </Field>
              <Field label="Latitude" mono>
                {location.latitude.toFixed(6)}
              </Field>
              <Field label="Longitude" mono>
                {location.longitude.toFixed(6)}
              </Field>
            </div>
            <div className="h-40 w-full rounded-xl overflow-hidden border border-border/60">
              <LocationMiniMap
                lat={location.latitude}
                lng={location.longitude}
                radius={location.geofence_radius ?? null}
                className="h-full w-full"
              />
            </div>
          </div>
        ) : (
          <EmptyHint>
            No job site coordinates configured. Geofence checks were skipped.
          </EmptyHint>
        )}
      </Section>

      {/* Clock-in evidence */}
      <Section title="Clock-in" icon={Navigation}>
        <ClockSide
          time={primary?.clock_in ?? inEvent?.created_at ?? null}
          lat={primary?.clock_in_lat ?? inEvent?.latitude ?? null}
          lng={primary?.clock_in_lng ?? inEvent?.longitude ?? null}
          geo={inGeo}
          distance={inDistance}
          accuracy={inEvent?.accuracy ?? null}
          method={inEvent?.clock_method ?? primary?.entry_source ?? null}
          device={inEvent?.device ?? null}
          address={inEvent?.address ?? null}
          photoUrl={inEvent?.photo_url ?? null}
          hasLocation={!!location?.latitude && !!location?.longitude}
        />
      </Section>

      {/* Clock-out evidence */}
      <Section title="Clock-out" icon={Navigation}>
        <ClockSide
          time={primary?.clock_out ?? outEvent?.created_at ?? null}
          lat={primary?.clock_out_lat ?? outEvent?.latitude ?? null}
          lng={primary?.clock_out_lng ?? outEvent?.longitude ?? null}
          geo={outGeo}
          distance={outDistance}
          accuracy={outEvent?.accuracy ?? null}
          method={outEvent?.clock_method ?? primary?.entry_source ?? null}
          device={outEvent?.device ?? null}
          address={outEvent?.address ?? null}
          photoUrl={outEvent?.photo_url ?? null}
          hasLocation={!!location?.latitude && !!location?.longitude}
        />
      </Section>

      {/* Alerts */}
      <Section title="Alerts" icon={AlertTriangle}>
        {alerts.length === 0 ? (
          <EmptyHint>No alerts recorded for this clock activity.</EmptyHint>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-2",
                  SEVERITY_CLS[a.severity] ?? TONE_CLS.muted,
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold uppercase tracking-wide">
                      {a.type.replaceAll("_", " ")}
                    </span>
                    <span className="text-[10px] uppercase font-medium opacity-70">
                      · {a.severity}
                    </span>
                    {a.resolved_at && (
                      <span className="text-[10px] font-medium opacity-70">
                        · resolved {fmtTime(a.resolved_at)}
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="text-[11px] mt-0.5 opacity-90">{a.description}</p>
                  )}
                  <p className="text-[10px] opacity-60 mt-0.5">{fmtTime(a.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Notes / status */}
      {(primary?.notes || primary?.status || primary?.entry_source) && (
        <Section title="Time entry" icon={Clock}>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <Field label="Status">{primary?.status ?? "—"}</Field>
            <Field label="Source">{primary?.entry_source ?? "—"}</Field>
          </div>
          {primary?.notes && (
            <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[11px] whitespace-pre-wrap">
              {primary.notes}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

/* ─────────── helpers ─────────── */

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2.5">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border/40 px-2.5 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      <p className={cn("text-[12px] truncate", mono && "font-mono tabular-nums")}>
        {children}
      </p>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-muted-foreground italic">{children}</p>
  );
}

function ClockSide({
  time,
  lat,
  lng,
  geo,
  distance,
  accuracy,
  method,
  device,
  address,
  photoUrl,
  hasLocation,
}: {
  time: string | null;
  lat: number | null;
  lng: number | null;
  geo: ReturnType<typeof geofenceLabel>;
  distance: number | null;
  accuracy: number | null;
  method: string | null;
  device: string | null;
  address: string | null;
  photoUrl: string | null;
  hasLocation: boolean;
}) {
  const hasGps = lat != null && lng != null;
  const Icon = geo.Icon;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Field label="Time">{fmtTime(time)}</Field>
        <div
          className={cn(
            "rounded-lg border px-2.5 py-1.5 flex items-center gap-1.5",
            TONE_CLS[geo.tone === "ok" ? "ok" : geo.tone === "warn" ? "warn" : "muted"],
          )}
        >
          <Icon className="h-3 w-3" />
          <span className="text-[11px] font-semibold">{geo.label}</span>
        </div>
        <Field label="Latitude" mono>
          {lat != null ? lat.toFixed(6) : "—"}
        </Field>
        <Field label="Longitude" mono>
          {lng != null ? lng.toFixed(6) : "—"}
        </Field>
        <Field label="GPS accuracy">
          {accuracy != null ? `±${Math.round(accuracy)} m` : "—"}
        </Field>
        <Field label="Distance to job site">
          {hasLocation
            ? distance != null
              ? `${Math.round(distance)} m`
              : "—"
            : "No job site set"}
        </Field>
        <Field label="Method">
          <span className="inline-flex items-center gap-1">
            {method && <Smartphone className="h-3 w-3 opacity-60" />}
            {method ?? "—"}
          </span>
        </Field>
        <Field label="Device">{device ?? "—"}</Field>
      </div>

      {!hasGps && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2">
          <HelpCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-800 dark:text-amber-200">
            GPS unavailable — treat as a technical signal, not as fraud.
          </p>
        </div>
      )}

      {hasGps && (
        <div className="h-40 w-full rounded-xl overflow-hidden border border-border/60">
          <LocationMiniMap lat={lat!} lng={lng!} className="h-full w-full" />
        </div>
      )}

      {address && (
        <p className="text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3 inline mr-1" /> {address}
        </p>
      )}

      {photoUrl && (
        <a
          href={photoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
        >
          <ImageIcon className="h-3 w-3" /> View clock photo
        </a>
      )}
    </div>
  );
}

export default ClockEventEvidence;
