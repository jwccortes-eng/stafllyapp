import { useState, useEffect, useRef } from "react";
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
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  User, DollarSign, Clock, CalendarDays, FileText, Activity,
  Briefcase, Phone, Mail, MapPin, Users, Tag, Star, Shield,
  Plus, Pencil, Trash2, MoreHorizontal, KeyRound, Upload, Download, Cake, Home, TrendingUp,
  Banknote,
} from "lucide-react";
import { EmployeePerformanceScore } from "@/components/reviews/EmployeePerformanceScore";
import { EmployeeAccessTab } from "@/components/employee/EmployeeAccessTab";
import { ReputationProfile } from "@/components/reviews/ReputationProfile";
import { ReputationAdminPanel } from "@/components/reviews/ReputationAdminPanel";
import { WorkerProfileTab } from "@/components/employee/WorkerProfileTab";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import EmployeeAdvancesTab from "@/components/advances/EmployeeAdvancesTab";
import { useToast } from "@/hooks/use-toast";

type EmployeeRecord = Record<string, any>;

const BOOLEAN_FIELDS = new Set(["has_car"]);

/* ── Field groups for Info tab ── */
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
  { key: "direct_manager", label: "Manager directo", icon: Shield },
  { key: "groups", label: "Grupos", icon: Users },
  { key: "tags", label: "Tags", icon: Tag },
  { key: "qualify", label: "Calificación", icon: Star },
  { key: "english_level", label: "Nivel inglés", icon: Star },
  { key: "recommended_by", label: "Recomendado por", icon: User },
  { key: "has_car", label: "¿Tiene carro?", icon: MapPin },
  { key: "driver_licence", label: "Licencia", icon: FileText },
];

/* ── Field Row ── */
function FieldRow({ field, employee, isEditing, form, setForm }: {
  field: { key: string; label: string; icon: any };
  employee: EmployeeRecord;
  isEditing: boolean;
  form: Record<string, string>;
  setForm: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const Icon = field.icon;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <span className="text-xs text-muted-foreground shrink-0 w-28">{field.label}</span>
      <div className="flex-1 text-right">
        {isEditing ? (
          BOOLEAN_FIELDS.has(field.key) ? (
            <div className="flex items-center justify-end gap-2">
              <Switch
                checked={form[field.key] === "Yes" || form[field.key] === "true" || form[field.key] === "Sí"}
                onCheckedChange={c => setForm(prev => ({ ...prev, [field.key]: c ? "Yes" : "No" }))}
              />
              <span className="text-xs">{form[field.key] === "Yes" || form[field.key] === "true" || form[field.key] === "Sí" ? "Sí" : "No"}</span>
            </div>
          ) : (
            <Input
              value={form[field.key] ?? ""}
              onChange={ev => setForm(prev => ({ ...prev, [field.key]: ev.target.value }))}
              className="h-7 text-xs"
            />
          )
        ) : (
          <span className="text-sm font-medium break-words">
            {BOOLEAN_FIELDS.has(field.key) ? (
              employee?.[field.key] === "Yes" || employee?.[field.key] === "true" || employee?.[field.key] === "Sí" ? (
                <Badge variant="outline" className="bg-earning/10 text-earning border-earning/20 text-[10px]">🚗 Sí</Badge>
              ) : <span className="text-muted-foreground/40">No</span>
            ) : (
              employee?.[field.key] || <span className="text-muted-foreground/40">—</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Info Tab ── */
function InfoTab({ employee, isEditing, form, setForm, isPrivileged }: {
  employee: EmployeeRecord; isEditing: boolean; form: Record<string, string>;
  setForm: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  isPrivileged: boolean;
}) {
  const SENSITIVE = new Set(["access_pin", "driver_licence", "has_car", "country_code", "english_level"]);
  const filteredEmployment = EMPLOYMENT_FIELDS.filter(f => isPrivileged || !SENSITIVE.has(f.key));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Información personal</h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {PERSONAL_FIELDS.filter(f => isPrivileged || !SENSITIVE.has(f.key)).map(f => (
              <FieldRow key={f.key} field={f} employee={employee} isEditing={isEditing} form={form} setForm={setForm} />
            ))}
          </CardContent>
        </Card>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Empleo</h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {filteredEmployment.map(f => (
              <FieldRow key={f.key} field={f} employee={employee} isEditing={isEditing} form={form} setForm={setForm} />
            ))}
          </CardContent>
        </Card>
      </div>
      {/* Availability */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">📅 Disponibilidad</h3>
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
    const { data } = await supabase
      .from("concept_employee_rates")
      .select("id, rate, effective_from, effective_to, concept_id, concepts(name, category, unit_label)")
      .eq("employee_id", employee.id);
    setRates(data ?? []);
    setLoading(false);
  };

  const fetchConcepts = async () => {
    const { data } = await supabase
      .from("concepts")
      .select("id, name, category, unit_label, default_rate")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name");
    setConcepts(data ?? []);
  };

  useEffect(() => { fetchRates(); fetchConcepts(); }, [employee.id, companyId]);

  const handleAdd = async () => {
    if (!formConceptId || !formRate) return;
    setSaving(true);
    await supabase.from("concept_employee_rates").insert({
      employee_id: employee.id,
      concept_id: formConceptId,
      rate: parseFloat(formRate),
    });
    setSaving(false);
    setAdding(false);
    setFormConceptId("");
    setFormRate("");
    fetchRates();
  };

  const handleUpdate = async (id: string) => {
    if (!formRate) return;
    setSaving(true);
    await supabase.from("concept_employee_rates").update({ rate: parseFloat(formRate) }).eq("id", id);
    setSaving(false);
    setEditingId(null);
    setFormRate("");
    fetchRates();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("concept_employee_rates").delete().eq("id", id);
    fetchRates();
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setFormRate(r.rate.toString());
  };

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;

  // Concepts not yet assigned
  const assignedConceptIds = new Set(rates.map(r => r.concept_id));
  const availableConcepts = concepts.filter(c => !assignedConceptIds.has(c.id));

  return (
    <div className="space-y-3">
      {rates.length === 0 && !adding && (
        <EmptyState icon={DollarSign} title="Sin tasas configuradas" description="Agrega una tasa de pago para este empleado" compact />
      )}

      {rates.map(r => (
        <Card key={r.id} className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {editingId === r.id ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-xs font-semibold mb-1">{(r.concepts as any)?.name}</p>
                  <Input
                    type="number"
                    step="0.01"
                    value={formRate}
                    onChange={e => setFormRate(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="Tarifa"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => handleUpdate(r.id)}>
                    {saving ? "..." : "Guardar"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingId(null); setFormRate(""); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{(r.concepts as any)?.name ?? "Concepto"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.effective_from ? format(parseISO(r.effective_from), "dd MMM yyyy", { locale: es }) : "Sin inicio"}
                    {" → "}
                    {r.effective_to ? format(parseISO(r.effective_to), "dd MMM yyyy", { locale: es }) : "Vigente"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary tabular-nums">${r.rate.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">{(r.concepts as any)?.unit_label ?? "por hora"}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startEdit(r)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" />Editar tarifa
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {adding ? (
        <Card className="rounded-xl border-primary/30 border-dashed">
          <CardContent className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Concepto</label>
              <select
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
                value={formConceptId}
                onChange={e => {
                  setFormConceptId(e.target.value);
                  const c = concepts.find(cc => cc.id === e.target.value);
                  if (c?.default_rate) setFormRate(c.default_rate.toString());
                }}
              >
                <option value="">Seleccionar concepto...</option>
                {availableConcepts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.category === "extra" ? "Pago" : "Deducción"})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tarifa ($)</label>
              <Input
                type="number"
                step="0.01"
                value={formRate}
                onChange={e => setFormRate(e.target.value)}
                className="h-9"
                placeholder="Ej: 15.00"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={saving || !formConceptId || !formRate} onClick={handleAdd} className="flex-1">
                {saving ? "Guardando..." : "Agregar tasa"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setFormConceptId(""); setFormRate(""); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setAdding(true)} disabled={availableConcepts.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          {availableConcepts.length === 0 ? "Todos los conceptos asignados" : "Agregar tasa de pago"}
        </Button>
      )}
    </div>
  );
}

/* ── Shifts Tab ── */
function ShiftsTab({ employee, companyId }: { employee: EmployeeRecord; companyId: string }) {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("shift_assignments")
        .select("id, status, shift_id, scheduled_shifts(title, date, start_time, end_time, status)")
        .eq("employee_id", employee.id)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      setShifts(data ?? []);
      setLoading(false);
    }
    fetch();
  }, [employee.id, companyId]);

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;
  if (shifts.length === 0) return <EmptyState icon={CalendarDays} title="Sin turnos asignados" description="Este empleado no tiene turnos recientes" compact />;

  const statusColors: Record<string, string> = {
    confirmed: "bg-earning/10 text-earning",
    pending: "bg-warning/10 text-warning",
    rejected: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-2">
      {shifts.map(s => {
        const shift = s.scheduled_shifts as any;
        if (!shift) return null;
        return (
          <Card key={s.id} className="rounded-xl border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{shift.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {shift.date ? format(parseISO(shift.date), "EEE dd MMM", { locale: es }) : "—"}
                    {" · "}
                    {shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}
                  </p>
                </div>
                <Badge className={cn("text-[10px]", statusColors[s.status] ?? "bg-muted text-muted-foreground")}>
                  {s.status === "confirmed" ? "Confirmado" : s.status === "pending" ? "Pendiente" : s.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ── Time Tab ── */
function TimeTab({ employee, companyId }: { employee: EmployeeRecord; companyId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("time_entries" as any)
        .select("id, clock_in, clock_out, status, break_minutes")
        .eq("employee_id", employee.id)
        .eq("company_id", companyId)
        .order("clock_in", { ascending: false })
        .limit(20);
      setEntries((data as any[]) ?? []);
      setLoading(false);
    }
    fetch();
  }, [employee.id, companyId]);

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;
  if (entries.length === 0) return <EmptyState icon={Clock} title="Sin fichajes" description="Este empleado no tiene registros de fichaje" compact />;

  return (
    <div className="space-y-2">
      {entries.map((e: any) => {
        const duration = e.clock_out
          ? ((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 3600000 - (e.break_minutes ?? 0) / 60).toFixed(1)
          : null;
        return (
          <Card key={e.id} className="rounded-xl border-border/40">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {format(parseISO(e.clock_in), "EEE dd MMM", { locale: es })}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {format(parseISO(e.clock_in), "HH:mm")}
                  {e.clock_out ? ` → ${format(parseISO(e.clock_out), "HH:mm")}` : " → En curso"}
                </p>
              </div>
              <div className="text-right">
                {duration ? (
                  <p className="text-sm font-bold text-primary tabular-nums">{duration}h</p>
                ) : (
                  <Badge className="bg-warning/10 text-warning text-[10px] animate-pulse">Activo</Badge>
                )}
                <p className="text-[10px] text-muted-foreground capitalize">{e.status}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
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
      supabase
        .from("contractor_w9")
        .select("id, status, legal_name, tax_classification, tin_last4, submitted_at, reviewed_at")
        .eq("employee_id", employee.id)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("employee_documents" as any)
        .select("*")
        .eq("employee_id", employee.id)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);
    setW9(w9Data);
    setDocs((docsData as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [employee.id, companyId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const path = `${companyId}/${employee.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("employee-documents").upload(path, file);
      if (uploadError) {
        toast({ title: "Error al subir", description: uploadError.message, variant: "destructive" });
        continue;
      }
      const { data: urlData } = supabase.storage.from("employee-documents").getPublicUrl(path);
      await (supabase.from("employee_documents" as any) as any).insert({
        employee_id: employee.id,
        company_id: companyId,
        name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        category: "other",
      });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    fetchDocs();
    toast({ title: "Documentos subidos" });
  };

  const handleDelete = async (doc: any) => {
    const path = `${companyId}/${employee.id}/${doc.file_url.split("/").pop()}`;
    await supabase.storage.from("employee-documents").remove([path]);
    await (supabase.from("employee_documents" as any) as any).delete().eq("id", doc.id);
    fetchDocs();
  };

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-5">
      {/* Upload section */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Documentos</h3>
        <div>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-3 w-3" />{uploading ? "Subiendo..." : "Subir"}
          </Button>
        </div>
      </div>

      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc: any) => (
            <Card key={doc.id} className="rounded-xl border-border/40">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-primary/60 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{doc.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""}
                      {doc.created_at && ` · ${format(parseISO(doc.created_at), "dd MMM yyyy", { locale: es })}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><Download className="h-3 w-3" /></a>
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(doc)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {docs.length === 0 && !w9 && (
        <EmptyState icon={FileText} title="Sin documentos" description="Sube identificaciones, licencias u otros documentos" compact />
      )}

      {/* W-9 section */}
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Formulario W-9</h3>
      {!w9 ? (
        <EmptyState icon={FileText} title="Sin W-9" description="No se ha enviado formulario W-9" compact />
      ) : (
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{w9.legal_name}</p>
              <Badge className={cn("text-[10px]",
                w9.status === "approved" ? "bg-earning/10 text-earning" :
                w9.status === "submitted" ? "bg-warning/10 text-warning" :
                "bg-muted text-muted-foreground"
              )}>
                {w9.status === "approved" ? "Aprobado" : w9.status === "submitted" ? "Enviado" : w9.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Clasificación:</span> {w9.tax_classification}</div>
              <div><span className="text-muted-foreground">TIN:</span> ***{w9.tin_last4 ?? "—"}</div>
              {w9.submitted_at && <div><span className="text-muted-foreground">Enviado:</span> {format(parseISO(w9.submitted_at), "dd MMM yyyy", { locale: es })}</div>}
              {w9.reviewed_at && <div><span className="text-muted-foreground">Revisado:</span> {format(parseISO(w9.reviewed_at), "dd MMM yyyy", { locale: es })}</div>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Activity Tab ── */
function ActivityTab({ employee }: { employee: EmployeeRecord }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("activity_log")
        .select("id, action, entity_type, created_at, details")
        .eq("entity_id", employee.id)
        .eq("entity_type", "employee")
        .order("created_at", { ascending: false })
        .limit(20);
      setItems(data ?? []);
      setLoading(false);
    }
    fetch();
  }, [employee.id]);

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;
  if (items.length === 0) return <EmptyState icon={Activity} title="Sin actividad" description="No hay registros de actividad para este empleado" compact />;

  return (
    <div className="space-y-1">
      {items.map(item => (
        <div key={item.id} className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
          <div className="h-6 w-6 rounded-md bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5">
            <Activity className="h-3 w-3 text-primary/70" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground capitalize">{item.action}</p>
            <p className="text-[10px] text-muted-foreground/50">
              {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true, locale: es })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export function EmployeeProfileTabs({
  employee,
  companyId,
  isEditing,
  form,
  setForm,
  isPrivileged,
  onEmployeeUpdate,
}: {
  employee: EmployeeRecord;
  companyId: string;
  isEditing: boolean;
  form: Record<string, string>;
  setForm: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  isPrivileged: boolean;
  onEmployeeUpdate?: (updates: Partial<EmployeeRecord>) => void;
}) {
  const wpHook = useWorkerProfile({ employeeId: employee?.id });

  if (!employee?.id) {
    return <div className="py-8 text-center text-xs text-muted-foreground">Selecciona un empleado</div>;
  }
  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList className="w-full grid grid-cols-10 h-9 mb-4 bg-muted/40 rounded-xl">
        <TabsTrigger value="info" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <User className="h-3 w-3" />
          <span className="hidden sm:inline">Info</span>
        </TabsTrigger>
        <TabsTrigger value="profile" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <Briefcase className="h-3 w-3" />
          <span className="hidden sm:inline">Perfil</span>
        </TabsTrigger>
        <TabsTrigger value="reputation" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <TrendingUp className="h-3 w-3" />
          <span className="hidden sm:inline">Score</span>
        </TabsTrigger>
        <TabsTrigger value="pay" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <DollarSign className="h-3 w-3" />
          <span className="hidden sm:inline">Pago</span>
        </TabsTrigger>
        <TabsTrigger value="advances" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <Banknote className="h-3 w-3" />
          <span className="hidden sm:inline">Anticipos</span>
        </TabsTrigger>
        <TabsTrigger value="shifts" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <CalendarDays className="h-3 w-3" />
          <span className="hidden sm:inline">Turnos</span>
        </TabsTrigger>
        <TabsTrigger value="time" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <Clock className="h-3 w-3" />
          <span className="hidden sm:inline">Reloj</span>
        </TabsTrigger>
        <TabsTrigger value="access" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <KeyRound className="h-3 w-3" />
          <span className="hidden sm:inline">Acceso</span>
        </TabsTrigger>
        <TabsTrigger value="docs" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <FileText className="h-3 w-3" />
          <span className="hidden sm:inline">Docs</span>
        </TabsTrigger>
        <TabsTrigger value="activity" className="text-[10px] data-[state=active]:bg-card rounded-lg gap-1">
          <Activity className="h-3 w-3" />
          <span className="hidden sm:inline">Log</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="mt-0">
        <InfoTab employee={employee} isEditing={isEditing} form={form} setForm={setForm} isPrivileged={isPrivileged} />
      </TabsContent>
      <TabsContent value="profile" className="mt-0">
        <WorkerProfileTab employeeId={employee.id} readOnly={!isEditing} />
      </TabsContent>
      <TabsContent value="reputation" className="mt-0">
        <div className="space-y-4">
          <ReputationProfile employeeId={employee.id} companyId={companyId} />
          <Card className="rounded-xl border-border/40">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Desglose de reseñas</h3>
              <EmployeePerformanceScore employeeId={employee.id} />
            </CardContent>
          </Card>
          {wpHook.profile && isPrivileged && (
            <ReputationAdminPanel
              workerProfileId={wpHook.profile.id}
              employeeId={employee.id}
              employeeName={`${employee.first_name ?? ""} ${employee.last_name ?? ""}`}
            />
          )}
        </div>
      </TabsContent>
      <TabsContent value="pay" className="mt-0">
        <PayTab employee={employee} companyId={companyId} />
      </TabsContent>
      <TabsContent value="shifts" className="mt-0">
        <ShiftsTab employee={employee} companyId={companyId} />
      </TabsContent>
      <TabsContent value="time" className="mt-0">
        <TimeTab employee={employee} companyId={companyId} />
      </TabsContent>
      <TabsContent value="access" className="mt-0">
        <EmployeeAccessTab employee={employee} companyId={companyId} isPrivileged={isPrivileged} onEmployeeUpdate={onEmployeeUpdate} />
      </TabsContent>
      <TabsContent value="docs" className="mt-0">
        <DocumentsTab employee={employee} companyId={companyId} />
      </TabsContent>
      <TabsContent value="activity" className="mt-0">
        <ActivityTab employee={employee} />
      </TabsContent>
    </Tabs>
  );
}
