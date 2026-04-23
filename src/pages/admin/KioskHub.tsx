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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Monitor, Plus, Pencil, Trash2, Copy, Check, ExternalLink,
  Clock, Activity, MapPin, Loader2, Smartphone,
} from "lucide-react";

interface KioskDevice {
  id: string;
  company_id: string;
  name: string;
  location_id: string | null;
  device_identifier: string;
  is_active: boolean;
  created_at: string;
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
  const [copied, setCopied] = useState<string | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState<string>("");
  const [formDeviceId, setFormDeviceId] = useState("");
  const [saving, setSaving] = useState(false);

  // Today's kiosk activity
  const [todayEvents, setTodayEvents] = useState<KioskClockRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

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

  useEffect(() => {
    fetchDevices();
    fetchLocations();
    fetchTodayEvents();
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
    setDialogOpen(true);
  };
  const openEdit = (d: KioskDevice) => {
    setEditing(d);
    setFormName(d.name);
    setFormLocation(d.location_id ?? "");
    setFormDeviceId(d.device_identifier);
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

  const handleDelete = async (d: KioskDevice) => {
    if (!confirm(`Delete kiosk "${d.name}"?`)) return;
    await kioskFetch(`kiosk_devices?id=eq.${d.id}`, { method: "DELETE" });
    toast({ title: "Kiosk removed" });
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
        </TabsList>

        {/* ─── ACTIVITY ─── */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Live kiosk activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingEvents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : todayEvents.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  No kiosk activity today yet.
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
                          className={`text-[10px] font-medium ${
                            e.type === "clock_in"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : "border-rose-300 bg-rose-50 text-rose-800"
                          }`}
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
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyKioskUrl(d)}>
                              {copied === d.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(d)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone = "default",
}: {
  icon: any; label: string; value: number | string; tone?: "default" | "success" | "muted";
}) {
  const toneClass =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400"
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
