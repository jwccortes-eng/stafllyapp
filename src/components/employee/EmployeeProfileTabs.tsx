import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { EmployeeAvailabilitySection } from "@/components/EmployeeAvailabilitySection";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { format, parseISO, formatDistanceToNow, isValid } from "date-fns";

/** Safe date formatter — returns fallback on invalid/missing values */
function safeFormat(dateStr: string | null | undefined, fmt: string, fallback = "—"): string {
  if (!dateStr) return fallback;
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, fmt, { locale: es }) : fallback;
  } catch { return fallback; }
}
function safeDistanceToNow(dateStr: string | null | undefined, fallback = "—"): string {
  if (!dateStr) return fallback;
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? formatDistanceToNow(d, { addSuffix: true, locale: es }) : fallback;
  } catch { return fallback; }
}
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  User, DollarSign, Clock, CalendarDays, FileText, Activity,
  Briefcase, Phone, Mail, MapPin, Users, Tag, Star, Shield,
  Plus, Pencil, Trash2, MoreHorizontal, KeyRound, Upload, Download, Cake, Home,
  Wallet,
} from "lucide-react";
import { EmployeePerformanceScore } from "@/components/reviews/EmployeePerformanceScore";
import { EmployeeAccessTab } from "@/components/employee/EmployeeAccessTab";
import { ReputationProfile } from "@/components/reviews/ReputationProfile";
import { ReputationAdminPanel } from "@/components/reviews/ReputationAdminPanel";
import { WorkerProfileTab } from "@/components/employee/WorkerProfileTab";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import EmployeeAdvancesTab from "@/components/advances/EmployeeAdvancesTab";
import { useToast } from "@/hooks/use-toast";

const EmployeeCompensationTab = lazy(() => import("@/components/compensation/EmployeeCompensationTab"));

type EmployeeRecord = Record<string, any>;

const BOOLEAN_FIELDS = new Set(["has_car"]);

const PERSONAL_FIELDS = [
  { key: "first_name", label: "Nombre", icon: User },
  { key: "last_name", label: "Apellido", icon: User },
  { key: "phone_number", label: "Teléfono", icon: Phone },
  { key: "email", label: "Email", icon: Mail },
  { key: "country_code", label: "Código país", icon: MapPin },
  { key: "gender", label: "Género", icon: User },
  { key: "birthday", label: "Cumpleaños", icon: Cake },
  { key: "address", label: "Dirección", icon: Home },
  { key: "county", label: "Condado", icon: MapPin },
];

const EMPLOYMENT_FIELDS = [
  { key: "employee_role", label: "Rol", icon: Briefcase },
  { key: "start_date", label: "Fecha inicio", icon: CalendarDays },
  { key: "end_date", label: "Fecha fin", icon: CalendarDays },
  { key: "direct_manager", label: "Manager", icon: Shield },
  { key: "groups", label: "Grupos", icon: Users },
  { key: "tags", label: "Tags", icon: Tag },
  { key: "qualify", label: "Calificación", icon: Star },
  { key: "english_level", label: "Inglés", icon: Star },
  { key: "recommended_by", label: "Recomendado", icon: User },
  { key: "has_car", label: "¿Carro?", icon: MapPin },
  { key: "driver_licence", label: "Licencia", icon: FileText },
];

/* ── Field Row — more compact ── */
function FieldRow({ field, employee, isEditing, form, setForm }: {
  field: { key: string; label: string; icon: any };
  employee: EmployeeRecord;
  isEditing: boolean;
  form: Record<string, string>;
  setForm: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const Icon = field.icon;
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-border/20 last:border-0">
      <Icon className="h-3 w-3 text-muted-foreground/40 shrink-0" />
      <span className="text-[11px] text-muted-foreground shrink-0 w-24">{field.label}</span>
      <div className="flex-1 text-right">
        {isEditing ? (
          BOOLEAN_FIELDS.has(field.key) ? (
            <div className="flex items-center justify-end gap-2">
              <Switch checked={form[field.key] === "Yes" || form[field.key] === "true" || form[field.key] === "Sí"} onCheckedChange={c => setForm(prev => ({ ...prev, [field.key]: c ? "Yes" : "No" }))} />
              <span className="text-[11px]">{form[field.key] === "Yes" || form[field.key] === "true" || form[field.key] === "Sí" ? "Sí" : "No"}</span>
            </div>
          ) : (
            <Input value={form[field.key] ?? ""} onChange={ev => setForm(prev => ({ ...prev, [field.key]: ev.target.value }))} className="h-6 text-[11px] px-2" />
          )
        ) : (
          <span className="text-[12px] font-medium break-words">
            {BOOLEAN_FIELDS.has(field.key) ? (
              employee?.[field.key] === "Yes" || employee?.[field.key] === "true" || employee?.[field.key] === "Sí" ? (
                <Badge variant="outline" className="bg-earning/10 text-earning border-earning/20 text-[9px]">🚗 Sí</Badge>
              ) : <span className="text-muted-foreground/30">No</span>
            ) : (
              employee?.[field.key] || <span className="text-muted-foreground/30">—</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Info Tab — compact ── */
function InfoTab({ employee, isEditing, form, setForm, isPrivileged }: {
  employee: EmployeeRecord; isEditing: boolean; form: Record<string, string>;
  setForm: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  isPrivileged: boolean;
}) {
  const SENSITIVE = new Set(["access_pin", "driver_licence", "has_car", "country_code", "english_level"]);
  const filteredEmployment = EMPLOYMENT_FIELDS.filter(f => isPrivileged || !SENSITIVE.has(f.key));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Personal</h3>
        <Card className="rounded-lg border-border/30">
          <CardContent className="p-3">
            {PERSONAL_FIELDS.filter(f => isPrivileged || !SENSITIVE.has(f.key)).map(f => (
              <FieldRow key={f.key} field={f} employee={employee} isEditing={isEditing} form={form} setForm={setForm} />
            ))}
          </CardContent>
        </Card>
      </div>
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Empleo</h3>
        <Card className="rounded-lg border-border/30">
          <CardContent className="p-3">
            {filteredEmployment.map(f => (
              <FieldRow key={f.key} field={f} employee={employee} isEditing={isEditing} form={form} setForm={setForm} />
            ))}
          </CardContent>
        </Card>
      </div>
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">📅 Disponibilidad</h3>
        <EmployeeAvailabilitySection employeeId={employee.id} readOnly={!isEditing} />
      </div>
    </div>
  );
}

/* ── Pay Tab ── */
function PayTab({ employee, companyId }: { employee: EmployeeRecord; companyId: string }) {
  const [rates, setRates] = useState<any[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formConceptId, setFormConceptId] = useState("");
  const [formRate, setFormRate] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRates = async () => {
    const { data } = await supabase.from("concept_employee_rates").select("id, rate, effective_from, effective_to, concept_id, concepts(name, category, unit_label)").eq("employee_id", employee.id);
    setRates(data ?? []);
    setLoading(false);
  };
  const fetchConcepts = async () => {
    const { data } = await supabase.from("concepts").select("id, name, category, unit_label, default_rate").eq("company_id", companyId).eq("is_active", true).order("name");
    setConcepts(data ?? []);
  };
  useEffect(() => { fetchRates(); fetchConcepts(); }, [employee.id, companyId]);

  const handleAdd = async () => {
    if (!formConceptId || !formRate) return;
    setSaving(true);
    await supabase.from("concept_employee_rates").insert({ employee_id: employee.id, concept_id: formConceptId, rate: parseFloat(formRate) });
    setSaving(false); setAdding(false); setFormConceptId(""); setFormRate(""); fetchRates();
  };
  const handleUpdate = async (id: string) => {
    if (!formRate) return;
    setSaving(true);
    await supabase.from("concept_employee_rates").update({ rate: parseFloat(formRate) }).eq("id", id);
    setSaving(false); setEditingId(null); setFormRate(""); fetchRates();
  };
  const handleDelete = async (id: string) => { await supabase.from("concept_employee_rates").delete().eq("id", id); fetchRates(); };
  const startEdit = (r: any) => { setEditingId(r.id); setFormRate(r.rate.toString()); };

  if (loading) return <div className="py-6 text-center text-[11px] text-muted-foreground">Cargando...</div>;
  const assignedConceptIds = new Set(rates.map(r => r.concept_id));
  const availableConcepts = concepts.filter(c => !assignedConceptIds.has(c.id));

  return (
    <div className="space-y-2">
      {rates.length === 0 && !adding && <EmptyState icon={DollarSign} title="Sin tasas" description="Agrega una tasa de pago" compact />}
      {rates.map(r => (
        <Card key={r.id} className="rounded-lg border-border/30">
          <CardContent className="p-3">
            {editingId === r.id ? (
              <div className="flex items-center gap-2">
                <div className="flex-1"><p className="text-xs font-semibold mb-1">{(r.concepts as any)?.name}</p><Input type="number" step="0.01" value={formRate} onChange={e => setFormRate(e.target.value)} className="h-7 text-xs" autoFocus /></div>
                <div className="flex flex-col gap-1"><Button size="sm" className="h-6 text-[10px]" disabled={saving} onClick={() => handleUpdate(r.id)}>{saving ? "..." : "OK"}</Button><Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setEditingId(null); setFormRate(""); }}>×</Button></div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-semibold">{(r.concepts as any)?.name ?? "Concepto"}</p><p className="text-[9px] text-muted-foreground">{safeFormat(r.effective_from, "dd MMM yyyy", "Sin inicio")} → {safeFormat(r.effective_to, "dd MMM yyyy", "Vigente")}</p></div>
                <div className="flex items-center gap-2">
                  <div className="text-right"><p className="text-sm font-bold text-primary tabular-nums">${r.rate.toFixed(2)}</p><p className="text-[9px] text-muted-foreground">{(r.concepts as any)?.unit_label ?? "por hora"}</p></div>
                  <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => startEdit(r)}><Pencil className="h-3 w-3 mr-2" />Editar</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-3 w-3 mr-2" />Eliminar</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {adding ? (
        <Card className="rounded-lg border-primary/30 border-dashed"><CardContent className="p-3 space-y-2">
          <div><label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Concepto</label><select className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs" value={formConceptId} onChange={e => { setFormConceptId(e.target.value); const c = concepts.find(cc => cc.id === e.target.value); if (c?.default_rate) setFormRate(c.default_rate.toString()); }}><option value="">Seleccionar...</option>{availableConcepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Tarifa ($)</label><Input type="number" step="0.01" value={formRate} onChange={e => setFormRate(e.target.value)} className="h-8" placeholder="15.00" /></div>
          <div className="flex gap-2"><Button size="sm" disabled={saving || !formConceptId || !formRate} onClick={handleAdd} className="flex-1 h-7 text-xs">{saving ? "..." : "Agregar"}</Button><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdding(false); setFormConceptId(""); setFormRate(""); }}>×</Button></div>
        </CardContent></Card>
      ) : (
        <Button variant="outline" size="sm" className="w-full border-dashed h-7 text-[10px]" onClick={() => setAdding(true)} disabled={availableConcepts.length === 0}><Plus className="h-3 w-3 mr-1" />{availableConcepts.length === 0 ? "Todos asignados" : "Agregar tasa"}</Button>
      )}
    </div>
  );
}

/* ── Shifts Tab ── */
function ShiftsTab({ employee, companyId }: { employee: EmployeeRecord; companyId: string }) {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { async function fetch() { const { data } = await supabase.from("shift_assignments").select("id, status, shift_id, scheduled_shifts(title, date, start_time, end_time, status)").eq("employee_id", employee.id).eq("company_id", companyId).order("created_at", { ascending: false }).limit(20); setShifts(data ?? []); setLoading(false); } fetch(); }, [employee.id, companyId]);
  if (loading) return <div className="py-6 text-center text-[11px] text-muted-foreground">Cargando...</div>;
  if (shifts.length === 0) return <EmptyState icon={CalendarDays} title="Sin turnos" description="No tiene turnos recientes" compact />;
  const statusColors: Record<string, string> = { confirmed: "bg-earning/10 text-earning", pending: "bg-warning/10 text-warning", rejected: "bg-destructive/10 text-destructive" };
  return (
    <div className="space-y-1.5">
      {shifts.map(s => { const shift = s.scheduled_shifts as any; if (!shift) return null; return (
        <Card key={s.id} className="rounded-lg border-border/30"><CardContent className="p-3 flex items-center justify-between">
          <div><p className="text-xs font-semibold">{shift.title}</p><p className="text-[9px] text-muted-foreground">{safeFormat(shift.date, "EEE dd MMM")} · {shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}</p></div>
          <Badge className={cn("text-[9px]", statusColors[s.status] ?? "bg-muted text-muted-foreground")}>{s.status === "confirmed" ? "OK" : s.status === "pending" ? "Pend" : s.status}</Badge>
        </CardContent></Card>
      ); })}
    </div>
  );
}

/* ── Time Tab ── */
function TimeTab({ employee, companyId }: { employee: EmployeeRecord; companyId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { async function fetch() { const { data } = await supabase.from("time_entries" as any).select("id, clock_in, clock_out, status, break_minutes").eq("employee_id", employee.id).eq("company_id", companyId).order("clock_in", { ascending: false }).limit(20); setEntries((data as any[]) ?? []); setLoading(false); } fetch(); }, [employee.id, companyId]);
  if (loading) return <div className="py-6 text-center text-[11px] text-muted-foreground">Cargando...</div>;
  if (entries.length === 0) return <EmptyState icon={Clock} title="Sin fichajes" description="No tiene registros" compact />;
  return (
    <div className="space-y-1.5">
      {entries.map((e: any) => { const duration = e.clock_out ? ((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 3600000 - (e.break_minutes ?? 0) / 60).toFixed(1) : null; return (
         <Card key={e.id} className="rounded-lg border-border/30"><CardContent className="p-3 flex items-center justify-between">
          <div><p className="text-xs font-semibold">{safeFormat(e.clock_in, "EEE dd MMM")}</p><p className="text-[9px] text-muted-foreground">{safeFormat(e.clock_in, "HH:mm")}{e.clock_out ? ` → ${safeFormat(e.clock_out, "HH:mm")}` : " → En curso"}</p></div>
          <div className="text-right">{duration ? <p className="text-xs font-bold text-primary tabular-nums">{duration}h</p> : <Badge className="bg-warning/10 text-warning text-[9px] animate-pulse">Activo</Badge>}<p className="text-[9px] text-muted-foreground capitalize">{e.status}</p></div>
        </CardContent></Card>
      ); })}
    </div>
  );
}

/* ── Documents Tab ── */
function DocumentsTab({ employee, companyId }: { employee: EmployeeRecord; companyId: string }) {
  const [w9, setW9] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchDocs = async () => {
    const [{ data: w9Data }, { data: docsData }] = await Promise.all([
      supabase.from("contractor_w9").select("id, status, legal_name, tax_classification, tin_last4, submitted_at, reviewed_at").eq("employee_id", employee.id).eq("company_id", companyId).maybeSingle(),
      supabase.from("employee_documents" as any).select("*").eq("employee_id", employee.id).eq("company_id", companyId).order("created_at", { ascending: false }),
    ]);
    setW9(w9Data); setDocs((docsData as any[]) ?? []); setLoading(false);
  };
  useEffect(() => { fetchDocs(); }, [employee.id, companyId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const path = `${companyId}/${employee.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("employee-documents").upload(path, file);
      if (uploadError) { toast({ title: "Error", description: uploadError.message, variant: "destructive" }); continue; }
      const { data: urlData } = supabase.storage.from("employee-documents").getPublicUrl(path);
      await (supabase.from("employee_documents" as any) as any).insert({ employee_id: employee.id, company_id: companyId, name: file.name, file_url: urlData.publicUrl, file_type: file.type, file_size: file.size, category: "other" });
    }
    setUploading(false); if (fileRef.current) fileRef.current.value = ""; fetchDocs(); toast({ title: "Documentos subidos" });
  };
  const handleDelete = async (doc: any) => {
    const path = `${companyId}/${employee.id}/${doc.file_url.split("/").pop()}`;
    await supabase.storage.from("employee-documents").remove([path]);
    await (supabase.from("employee_documents" as any) as any).delete().eq("id", doc.id);
    fetchDocs();
  };

  if (loading) return <div className="py-6 text-center text-[11px] text-muted-foreground">Cargando...</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Documentos</h3>
        <div><input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" /><Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => fileRef.current?.click()} disabled={uploading}><Upload className="h-2.5 w-2.5" />{uploading ? "..." : "Subir"}</Button></div>
      </div>
      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((doc: any) => (
            <Card key={doc.id} className="rounded-lg border-border/30"><CardContent className="p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0"><FileText className="h-3.5 w-3.5 text-primary/50 shrink-0" /><div className="min-w-0"><p className="text-[11px] font-medium truncate">{doc.name}</p><p className="text-[9px] text-muted-foreground">{doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""}{doc.created_at && ` · ${safeFormat(doc.created_at, "dd MMM yyyy")}`}</p></div></div>
              <div className="flex items-center gap-0.5"><Button size="icon" variant="ghost" className="h-6 w-6" asChild><a href={doc.file_url} target="_blank" rel="noopener noreferrer"><Download className="h-2.5 w-2.5" /></a></Button><Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(doc)}><Trash2 className="h-2.5 w-2.5" /></Button></div>
            </CardContent></Card>
          ))}
        </div>
      )}
      {docs.length === 0 && !w9 && <EmptyState icon={FileText} title="Sin documentos" description="Sube identificaciones u otros" compact />}
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">W-9</h3>
      {!w9 ? <EmptyState icon={FileText} title="Sin W-9" description="No se ha enviado W-9" compact /> : (
        <Card className="rounded-lg border-border/30"><CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold">{w9.legal_name}</p><Badge className={cn("text-[9px]", w9.status === "approved" ? "bg-earning/10 text-earning" : w9.status === "submitted" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>{w9.status === "approved" ? "Aprobado" : w9.status === "submitted" ? "Enviado" : w9.status}</Badge></div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]"><div><span className="text-muted-foreground">Clasificación:</span> {w9.tax_classification}</div><div><span className="text-muted-foreground">TIN:</span> ***{w9.tin_last4 ?? "—"}</div></div>
        </CardContent></Card>
      )}
    </div>
  );
}

/* ── Activity Tab ── */
function ActivityTab({ employee }: { employee: EmployeeRecord }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { async function fetch() { const { data } = await supabase.from("activity_log").select("id, action, entity_type, created_at, details").eq("entity_id", employee.id).eq("entity_type", "employee").order("created_at", { ascending: false }).limit(20); setItems(data ?? []); setLoading(false); } fetch(); }, [employee.id]);
  if (loading) return <div className="py-6 text-center text-[11px] text-muted-foreground">Cargando...</div>;
  if (items.length === 0) return <EmptyState icon={Activity} title="Sin actividad" description="No hay registros" compact />;
  return (
    <div className="space-y-0.5">
      {items.map(item => (
        <div key={item.id} className="flex items-start gap-2.5 py-2 border-b border-border/20 last:border-0">
          <div className="h-5 w-5 rounded bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5"><Activity className="h-2.5 w-2.5 text-primary/60" /></div>
          <div className="min-w-0 flex-1"><p className="text-[11px] text-foreground capitalize">{item.action}</p><p className="text-[9px] text-muted-foreground/50">{safeDistanceToNow(item.created_at)}</p></div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT — More compact tabs
   ═══════════════════════════════════════════ */
export function EmployeeProfileTabs({
  employee, companyId, isEditing, form, setForm, isPrivileged, onEmployeeUpdate, companyName, onInvite,
}: {
  employee: EmployeeRecord; companyId: string; isEditing: boolean;
  form: Record<string, string>;
  setForm: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  isPrivileged: boolean;
  onEmployeeUpdate?: (updates: Partial<EmployeeRecord>) => void;
  companyName?: string;
  onInvite?: () => void;
}) {
  const wpHook = useWorkerProfile({ employeeId: employee?.id });

  if (!employee?.id) return <div className="py-6 text-center text-[11px] text-muted-foreground">Selecciona un empleado</div>;

  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList className="w-full flex h-8 mb-3 bg-muted/30 rounded-lg p-0.5 overflow-x-auto">
        <TabsTrigger value="info" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
          <User className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Resumen</span>
        </TabsTrigger>
        <TabsTrigger value="profile" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
          <Briefcase className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Perfil</span>
        </TabsTrigger>
        <TabsTrigger value="compensation" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
          <Wallet className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Comp</span>
        </TabsTrigger>
        <TabsTrigger value="access" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
          <KeyRound className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Acceso</span>
        </TabsTrigger>
        <TabsTrigger value="docs" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
          <FileText className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Docs</span>
        </TabsTrigger>
        <TabsTrigger value="shifts" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
          <CalendarDays className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Turnos</span>
        </TabsTrigger>
        <TabsTrigger value="activity" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
          <Activity className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Log</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="mt-0"><InfoTab employee={employee} isEditing={isEditing} form={form} setForm={setForm} isPrivileged={isPrivileged} /></TabsContent>
      <TabsContent value="profile" className="mt-0"><WorkerProfileTab employeeId={employee.id} readOnly={!isEditing} /></TabsContent>
      <TabsContent value="reputation" className="mt-0">
        <div className="space-y-3">
          <ReputationProfile employeeId={employee.id} companyId={companyId} />
          <Card className="rounded-lg border-border/30"><CardContent className="p-3"><h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">Reseñas</h3><EmployeePerformanceScore employeeId={employee.id} /></CardContent></Card>
          {wpHook.profile && isPrivileged && <ReputationAdminPanel workerProfileId={wpHook.profile.id} employeeId={employee.id} employeeName={`${employee.first_name ?? ""} ${employee.last_name ?? ""}`} />}
        </div>
      </TabsContent>
      <TabsContent value="pay" className="mt-0"><PayTab employee={employee} companyId={companyId} /></TabsContent>
      <TabsContent value="compensation" className="mt-0">
        <Suspense fallback={<div className="py-6 text-center text-[11px] text-muted-foreground">Cargando...</div>}>
          <EmployeeCompensationTab employeeId={employee.id} employeeName={`${employee.first_name ?? ""} ${employee.last_name ?? ""}`} companyId={companyId} />
        </Suspense>
      </TabsContent>
      <TabsContent value="advances" className="mt-0"><EmployeeAdvancesTab employeeId={employee.id} companyId={companyId} /></TabsContent>
      <TabsContent value="shifts" className="mt-0"><ShiftsTab employee={employee} companyId={companyId} /></TabsContent>
      <TabsContent value="time" className="mt-0"><TimeTab employee={employee} companyId={companyId} /></TabsContent>
      <TabsContent value="access" className="mt-0"><EmployeeAccessTab employee={employee} companyId={companyId} companyName={companyName} isPrivileged={isPrivileged} onEmployeeUpdate={onEmployeeUpdate} onInvite={onInvite} /></TabsContent>
      <TabsContent value="docs" className="mt-0"><DocumentsTab employee={employee} companyId={companyId} /></TabsContent>
      <TabsContent value="activity" className="mt-0"><ActivityTab employee={employee} /></TabsContent>
    </Tabs>
  );
}
