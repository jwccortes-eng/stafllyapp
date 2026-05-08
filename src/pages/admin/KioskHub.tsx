/**
 * Kiosk Hub Gold (`/app/kiosk`) — People OS layer.
 *
 * Purpose:
 *   Single premium control surface for shared-tablet clock-in.
 *   Replaces the bare "Kiosk Devices" CRUD page with a real operational hub:
 *     - Today's kiosk activity (clock events from kiosk method)
 *     - Active devices with quick launch / copy URL
 *     - Direct CTA to open the public /kiosk screen
 *
 * Reuses:
 *   - Existing `KioskDevices` device CRUD logic (inlined, same RLS-safe REST calls)
 *   - Existing `/kiosk` public flow (no changes to clock-in logic)
 *
 * Zero schema changes. Zero edge-function changes.
 */
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { safeRandomUUID } from "@/lib/safe-storage";
import { supabase } from "@/integrations/supabase/client";
import { APP_BASE_URL } from "@/lib/app-url";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Monitor, Plus, Pencil, Trash2, Copy, Check, ExternalLink,
  Clock, Activity, MapPin, Smartphone, ShieldAlert, ShieldCheck,
} from "lucide-react";

interface KioskDevice {
  id: string;
  company_id: string;
  name: string;
  location_id: string | null;
  device_identifier: string;
  is_active: boolean;
  is_trusted: boolean;
  created_at: string;
}

interface UntrustedAlertRow {
  device_id: string | null;
  company_id: string | null;
  action: string | null;
  employee_id: string | null;
  reason: string | null;
  count: number;
  last_seen: string;
}
interface Location { id: string; name: string; }

interface KioskClockRow {
  id: string;
  type: string;
  created_at: string;
  kiosk_device_id: string | null;
  employee_id: string;
  employees: { first_name: string; last_name: string; avatar_url: string | null } | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function kioskFetch(path: string, opts?: RequestInit) {
  const session = (await supabase.auth.getSession()).data.session;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts?.method === "POST" ? "return=representation" : "return=minimal",
      ...(opts?.headers ?? {}),
    },
  });
}

export default function KioskHub() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();

  // Devices
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KioskDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KioskDevice | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState<string>("");
  const [formDeviceId, setFormDeviceId] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsTrusted, setFormIsTrusted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Today's kiosk activity
  const [todayEvents, setTodayEvents] = useState<KioskClockRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Untrusted device alerts (A2 monitor mode)
  const [alerts, setAlerts] = useState<UntrustedAlertRow[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const fetchDevices = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const res = await kioskFetch(`kiosk_devices?company_id=eq.${selectedCompanyId}&order=created_at.desc`);
    setDevices(res.ok ? await res.json() : []);
    setLoading(false);
  };

  const fetchLocations = async () => {
    if (!selectedCompanyId) return;
    const res = await kioskFetch(`locations?company_id=eq.${selectedCompanyId}&is_active=eq.true&order=name&select=id,name`);
    setLocations(res.ok ? await res.json() : []);
  };

  const fetchTodayEvents = async () => {
    if (!selectedCompanyId) return;
    setLoadingEvents(true);
    const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const sb = supabase as any;
    const { data, error } = await sb
      .from("clock_events")
      .select("id, type, created_at, kiosk_device_id, employee_id, employees:employee_id(first_name,last_name,avatar_url)")
      .eq("company_id", selectedCompanyId)
      .eq("clock_method", "kiosk")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    setTodayEvents(error ? [] : (data ?? []));
    setLoadingEvents(false);
  };

  const fetchAlerts = async () => {
    if (!selectedCompanyId) return;
    setLoadingAlerts(true);
    const sb = supabase as any;
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
    const { data, error } = await sb
      .from("security_alerts")
      .select("details, created_at")
      .eq("check_name", "front_desk_untrusted_device")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) {
      setAlerts([]);
      setLoadingAlerts(false);
      return;
    }
    const grouped = new Map<string, UntrustedAlertRow>();
    for (const row of data as Array<{ details: any; created_at: string }>) {
      const d = row.details ?? {};
      if (d.company_id && d.company_id !== selectedCompanyId) continue;
      const key = `${d.device_id ?? "none"}|${d.action ?? "?"}|${d.reason ?? "?"}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        if (row.created_at > existing.last_seen) existing.last_seen = row.created_at;
      } else {
        grouped.set(key, {
          device_id: d.device_id ?? null,
          company_id: d.company_id ?? null,
          action: d.action ?? null,
          employee_id: d.employee_id ?? null,
          reason: d.reason ?? null,
          count: 1,
          last_seen: row.created_at,
        });
      }
    }
    setAlerts(Array.from(grouped.values()).sort((a, b) => b.last_seen.localeCompare(a.last_seen)));
    setLoadingAlerts(false);
  };

  useEffect(() => {
    fetchDevices();
    fetchLocations();
    fetchTodayEvents();
    fetchAlerts();
  }, [selectedCompanyId]);

  const stats = useMemo(() => {
    const total = todayEvents.length;
    const unique = new Set(todayEvents.map((e) => e.employee_id)).size;
    const ins = todayEvents.filter((e) => e.type === "clock_in").length;
    const outs = todayEvents.filter((e) => e.type === "clock_out").length;
    return { total, unique, ins, outs, activeDevices: devices.filter((d) => d.is_active).length };
  }, [todayEvents, devices]);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormLocation("");
    setFormDeviceId(safeRandomUUID().slice(0, 8).toUpperCase());
    setFormIsActive(true);
    setFormIsTrusted(false);
    setDialogOpen(true);
  };
  const openEdit = (d: KioskDevice) => {
    setEditing(d);
    setFormName(d.name);
    setFormLocation(d.location_id ?? "");
    setFormDeviceId(d.device_identifier);
    setFormIsActive(d.is_active);
    setFormIsTrusted(!!d.is_trusted);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !selectedCompanyId) return;
    setSaving(true);
    const payload = {
      company_id: selectedCompanyId,
      name: formName.trim(),
      location_id: formLocation && formLocation !== "none" ? formLocation : null,
      device_identifier: formDeviceId || safeRandomUUID().slice(0, 8).toUpperCase(),
      is_active: formIsActive,
      is_trusted: formIsTrusted,
    };
    if (editing) {
      await kioskFetch(`kiosk_devices?id=eq.${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      toast({ title: "Kiosk updated" });
    } else {
      await kioskFetch("kiosk_devices", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Kiosk created" });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchDevices();
  };

  const handleQuickTrust = async (d: KioskDevice, trusted: boolean) => {
    await kioskFetch(`kiosk_devices?id=eq.${d.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_trusted: trusted }),
    });
    toast({ title: trusted ? "Device trusted" : "Trust revoked" });
    fetchDevices();
  };


  const handleDelete = async (d: KioskDevice) => {
    await kioskFetch(`kiosk_devices?id=eq.${d.id}`, { method: "DELETE" });
    toast({ title: "Kiosk removed" });
    setDeleteTarget(null);
    fetchDevices();
  };

  const copyKioskUrl = (d: KioskDevice) => {
    navigator.clipboard.writeText(`${APP_BASE_URL}/kiosk?device=${d.device_identifier}`);
    setCopied(d.id);
    toast({ title: "Kiosk URL copied" });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ─── HERO ─── */}
      <Card className="overflow-hidden border-border/50">
        <div className="bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent">
          <CardContent className="p-5">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="rounded-2xl bg-primary/10 p-3 ring-1 ring-primary/20">
                <Monitor className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold font-heading tracking-tight">Kiosk Hub</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Shared-tablet clock-in for your locations. Every event is traceable per worker.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild>
                  <a href={`${APP_BASE_URL}/kiosk`} target="_blank" rel="noopener">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Kiosk
                  </a>
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> New device
                </Button>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={Activity} label="Events today" value={stats.total} />
        <Kpi icon={Smartphone} label="Workers today" value={stats.unique} />
        <Kpi icon={Clock} label="Clock-ins" value={stats.ins} tone="success" />
        <Kpi icon={Clock} label="Clock-outs" value={stats.outs} tone="muted" />
        <Kpi icon={Monitor} label="Active devices" value={stats.activeDevices} />
      </div>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Today's activity</TabsTrigger>
          <TabsTrigger value="devices">Devices ({devices.length})</TabsTrigger>
          <TabsTrigger value="security">
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
            Security {alerts.length > 0 && <Badge variant="destructive" className="ml-1.5 text-[10px] h-4 px-1">{alerts.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ─── ACTIVITY ─── */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Live kiosk activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingEvents ? (
                <ul className="divide-y divide-border/40">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <Skeleton className="h-5 w-10 rounded-md" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="ml-auto h-3 w-12" />
                      <Skeleton className="h-5 w-20 rounded-md" />
                    </li>
                  ))}
                </ul>
              ) : todayEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
                  <div className="rounded-full bg-muted/40 p-3">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No kiosk activity today</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Open the public kiosk on your tablet so workers can start clocking in.
                  </p>
                  <Button variant="outline" size="sm" asChild className="mt-1">
                    <a href={`${APP_BASE_URL}/kiosk`} target="_blank" rel="noopener">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Kiosk
                    </a>
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {todayEvents.map((e) => {
                    const device = devices.find((d) => d.id === e.kiosk_device_id);
                    const time = new Date(e.created_at).toLocaleTimeString("en-US", {
                      hour: "2-digit", minute: "2-digit",
                    });
                    const fullName = e.employees
                      ? `${e.employees.first_name ?? ""} ${e.employees.last_name ?? ""}`.trim() || "—"
                      : "—";
                    return (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-medium",
                            e.type === "clock_in"
                              ? "border-earning/30 bg-earning/10 text-earning"
                              : "border-deduction/30 bg-deduction/10 text-deduction",
                          )}
                        >
                          {e.type === "clock_in" ? "IN" : "OUT"}
                        </Badge>
                        <Link
                          to={`/app/employees/${e.employee_id}`}
                          className="font-medium text-sm hover:underline truncate"
                        >
                          {fullName}
                        </Link>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{time}</span>
                        {device && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Monitor className="h-2.5 w-2.5 mr-1" /> {device.name}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── DEVICES ─── */}
        <TabsContent value="devices" className="mt-4">
          {devices.length === 0 && !loading ? (
            <EmptyState
              icon={Monitor}
              title="No kiosk devices yet"
              description="Register a shared tablet so workers can clock in from one screen."
              actionLabel="Create kiosk"
              onAction={openCreate}
            />
          ) : (
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trust</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((d) => {
                    const loc = locations.find((l) => l.id === d.location_id);
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {loc ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {loc.name}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{d.device_identifier}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px]">
                            {d.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={!!d.is_trusted}
                              onCheckedChange={(v) => handleQuickTrust(d, v)}
                              aria-label={`Trust ${d.name}`}
                            />
                            {d.is_trusted ? (
                              <Badge variant="outline" className="text-[10px] border-earning/30 bg-earning/10 text-earning">
                                <ShieldCheck className="h-2.5 w-2.5 mr-1" /> Trusted
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-muted-foreground/20 text-muted-foreground">
                                Untrusted
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => copyKioskUrl(d)}
                                  aria-label={`Copy kiosk URL for ${d.name}`}
                                >
                                  {copied === d.id ? <Check className="h-3.5 w-3.5 text-earning" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{copied === d.id ? "Copied!" : "Copy kiosk URL"}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEdit(d)}
                                  aria-label={`Edit kiosk ${d.name}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit kiosk</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => setDeleteTarget(d)}
                                  aria-label={`Delete kiosk ${d.name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete kiosk</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ─── SECURITY (A2 monitor mode) ─── */}
        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-warning" />
                    Untrusted device alerts
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Monitor mode — last 30 days. No traffic is blocked yet. Trust known devices in the Devices tab.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchAlerts} disabled={loadingAlerts}>
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAlerts ? (
                <ul className="divide-y divide-border/40">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="px-4 py-3"><Skeleton className="h-4 w-3/4" /></li>
                  ))}
                </ul>
              ) : alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
                  <div className="rounded-full bg-earning/10 p-3">
                    <ShieldCheck className="h-5 w-5 text-earning" />
                  </div>
                  <p className="text-sm font-medium">No untrusted device activity</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    All recent kiosk requests came from trusted devices in this company.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((a, i) => {
                      const known = a.device_id ? devices.find((d) => d.device_identifier === a.device_id || d.id === a.device_id) : null;
                      return (
                        <TableRow key={i}>
                          <TableCell>
                            {a.device_id ? (
                              <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{a.device_id}</code>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">missing</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{a.action ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.reason ?? "—"}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {a.employee_id ? a.employee_id.slice(0, 8) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{a.count}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(a.last_seen).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </TableCell>
                          <TableCell className="text-right">
                            {known ? (
                              known.is_trusted ? (
                                <Badge variant="outline" className="text-[10px] border-earning/30 bg-earning/10 text-earning">
                                  <ShieldCheck className="h-2.5 w-2.5 mr-1" /> Trusted
                                </Badge>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => handleQuickTrust(known, true)}>
                                  Trust
                                </Button>
                              )
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Not registered</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── DEVICE DIALOG ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit kiosk" : "New kiosk"}</DialogTitle>
            <DialogDescription>Configure a shared clock-in device.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Main entrance tablet" />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={formLocation} onValueChange={setFormLocation}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No location</SelectItem>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Device ID</Label>
              <Input value={formDeviceId} onChange={(e) => setFormDeviceId(e.target.value)} className="font-mono" />
              <p className="text-[10px] text-muted-foreground">Auto-generated if left blank.</p>
            </div>
            <Button onClick={handleSave} disabled={!formName.trim() || saving} className="w-full">
              {saving ? "Saving..." : editing ? "Save changes" : "Create kiosk"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── DELETE CONFIRM ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete kiosk?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>.
              Workers using this device URL will no longer be able to clock in from it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete kiosk
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone = "default",
}: {
  icon: any; label: string; value: number | string; tone?: "default" | "success" | "muted";
}) {
  const toneClass =
    tone === "success" ? "text-earning"
    : tone === "muted" ? "text-muted-foreground"
    : "text-foreground";
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className={`mt-1 text-2xl font-bold tabular-nums leading-none ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
