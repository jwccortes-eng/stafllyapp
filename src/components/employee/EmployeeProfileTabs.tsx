import { useState, useEffect, useRef, lazy, Suspense, useCallback, useMemo } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { SmartPhoneInput } from "@/components/ui/smart-phone-input";
import { GenderSelect } from "@/components/ui/gender-select";
import { formatDateUS } from "@/lib/date-format";
import { formatPhoneUS } from "@/lib/phone-format";
import { formatGenderLabel } from "@/lib/gender";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { EmployeeAvailabilitySection } from "@/components/EmployeeAvailabilitySection";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { format, parseISO, formatDistanceToNow, isValid } from "date-fns";
import { openEmployeeDocument } from "@/lib/employee-documents";
import {
  fetchUnifiedDocuments,
  approveDocument,
  rejectDocument,
  requestReplacement,
  uploadAdminDocument,
  type UnifiedDocument,
} from "@/lib/document-actions";
import { DocumentReasonDialog } from "@/components/documents/DocumentReasonDialog";
import VersionConflictDialog, { type VersionConflictInfo } from "@/components/data-integrity/VersionConflictDialog";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { toNumOrNull } from "@/lib/numeric-input";
import { toast } from "sonner";

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
  Wallet, Car, ExternalLink, CheckCircle2, AlertCircle,
} from "lucide-react";
import { EmployeePerformanceScore } from "@/components/reviews/EmployeePerformanceScore";
import { EmployeeAccessTab } from "@/components/employee/EmployeeAccessTab";
import { ReputationProfile } from "@/components/reviews/ReputationProfile";
import { ReputationAdminPanel } from "@/components/reviews/ReputationAdminPanel";
import { WorkerProfileTab } from "@/components/employee/WorkerProfileTab";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import EmployeeAdvancesTab from "@/components/advances/EmployeeAdvancesTab";
import { EmployeeAddressSection } from "@/components/employee/EmployeeAddressSection";
import { PortalOnboardingPanel } from "@/components/employee/PortalOnboardingPanel";
import { WorkerPreferenceList } from "@/components/preferences/WorkerPreferenceList";
import { useToast } from "@/hooks/use-toast";
import { resolveIdentityEmployeeIds } from "@/lib/identity/identity-set";

const EmployeeCompensationTab = lazy(() => import("@/components/compensation/EmployeeCompensationTab"));

type EmployeeRecord = Record<string, any>;

const BOOLEAN_FIELDS = new Set(["has_car"]);
const DATE_FIELDS = new Set(["start_date", "end_date", "birthday", "license_expiration", "expiration_date"]);

const PERSONAL_FIELDS = [
  { key: "first_name", label: "Nombre", icon: User },
  { key: "last_name", label: "Apellido", icon: User },
  { key: "phone_number", label: "Teléfono", icon: Phone },
  { key: "email", label: "Email", icon: Mail },
  { key: "country_code", label: "Código país", icon: MapPin },
  { key: "gender", label: "Género", icon: User },
  { key: "birthday", label: "Cumpleaños", icon: Cake },
  // Address moved to EmployeeAddressSection (premium field). Legacy "address"
  // and "county" columns are kept in DB and synced from there.
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
          ) : DATE_FIELDS.has(field.key) ? (
            <SmartDateInput
              value={form[field.key] ?? ""}
              onChange={iso => setForm(prev => ({ ...prev, [field.key]: iso }))}
              inputClassName="h-7 text-[11px] px-2"
              aria-label={field.label}
            />
          ) : field.key === "phone_number" ? (
            <SmartPhoneInput
              value={form[field.key] ?? ""}
              onChange={(digits) => setForm(prev => ({ ...prev, [field.key]: digits }))}
              className="h-7 text-[11px] px-2 text-right"
              showValidation
              aria-label={field.label}
            />
          ) : field.key === "gender" ? (
            <GenderSelect
              value={form[field.key] ?? ""}
              onChange={v => setForm(prev => ({ ...prev, [field.key]: v }))}
              className="h-7 text-[11px]"
            />
          ) : (
            <Input value={form[field.key] ?? ""} onChange={ev => setForm(prev => ({ ...prev, [field.key]: ev.target.value }))} className="h-6 text-[11px] px-2" />
          )
        ) : (
          <span className="text-[12px] font-medium break-words">
            {BOOLEAN_FIELDS.has(field.key) ? (
              employee?.[field.key] === "Yes" || employee?.[field.key] === "true" || employee?.[field.key] === "Sí" ? (
                <Badge variant="outline" className="bg-earning/10 text-earning border-earning/20 text-[9px]">🚗 Sí</Badge>
              ) : <span className="text-muted-foreground/30">No</span>
            ) : DATE_FIELDS.has(field.key) ? (
              employee?.[field.key] ? formatDateUS(employee[field.key] as string) : <span className="text-muted-foreground/30">—</span>
            ) : field.key === "phone_number" ? (
              employee?.[field.key] ? (formatPhoneUS(employee[field.key] as string) || employee[field.key]) : <span className="text-muted-foreground/30">—</span>
            ) : field.key === "gender" ? (
              employee?.[field.key] ? formatGenderLabel(employee[field.key] as string) : <span className="text-muted-foreground/30">—</span>
            ) : (
              employee?.[field.key] || <span className="text-muted-foreground/30">—</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Vehicle Documents Section ── */
function VehicleDocumentsSection({ employeeId }: { employeeId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("employee_onboarding_documents" as any)
        .select("*")
        .eq("employee_id", employeeId)
        .in("document_type", ["driver_license", "vehicle_registration"]);
      setDocs((data as any[]) ?? []);
      setLoading(false);
    })();
  }, [employeeId]);

  if (loading) return null;
  if (docs.length === 0) return null;

  const docLabels: Record<string, string> = {
    driver_license: "Licencia de conducir",
    vehicle_registration: "Registration del vehículo",
  };

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5 flex items-center gap-1">
        <Car className="h-3 w-3" /> Documentos de vehículo
      </h3>
      <Card className="rounded-lg border-border/30">
        <CardContent className="p-3 space-y-2">
          {["driver_license", "vehicle_registration"].map(type => {
            const doc = docs.find((d: any) => d.document_type === type);
            return (
              <div key={type} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground">{docLabels[type]}</span>
                </div>
                {doc ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[9px]",
                      doc.status === "approved" ? "bg-earning/10 text-earning border-earning/20" :
                      doc.status === "pending" ? "bg-warning/10 text-warning border-warning/20" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {doc.status === "approved" ? <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Verificado</> :
                       doc.status === "pending" ? <><AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Pendiente</> :
                       doc.status}
                    </Badge>
                    {doc.file_url && (
                      <button
                        type="button"
                        onClick={() => openEmployeeDocument(doc.file_url)}
                        className="text-primary hover:text-primary/80"
                        title="Open document"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/20">
                    <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Faltante
                  </Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Info Tab — compact ── */
function InfoTab({ employee, companyId, isEditing, form, setForm, isPrivileged, onEmployeeUpdate, onJumpToDocuments }: {
  employee: EmployeeRecord; companyId: string; isEditing: boolean; form: Record<string, string>;
  setForm: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  isPrivileged: boolean;
  onEmployeeUpdate?: (patch: Partial<EmployeeRecord>) => void;
  onJumpToDocuments?: () => void;
}) {
  const SENSITIVE = new Set(["access_pin", "driver_licence", "has_car", "country_code", "english_level"]);
  // Optional/legacy fields hidden by default when empty in read-only mode.
  // Keeps data accessible but reduces visual noise.
  const LEGACY_OPTIONAL = new Set(["direct_manager", "groups", "tags", "qualify", "recommended_by", "driver_licence", "english_level"]);
  const isEmptyVal = (v: any) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  const filteredEmployment = EMPLOYMENT_FIELDS.filter(f => isPrivileged || !SENSITIVE.has(f.key));
  const employmentVisible = useMemo(
    () => filteredEmployment.filter(f => isEditing || !LEGACY_OPTIONAL.has(f.key) || !isEmptyVal(employee?.[f.key])),
    [filteredEmployment, isEditing, employee],
  );
  const employmentHidden = filteredEmployment.filter(f => !employmentVisible.includes(f));


  return (
    <div className="space-y-4">
      {/* Premium compact panel: portal access, onboarding, last activation update. */}
      {isPrivileged && companyId && (
        <PortalOnboardingPanel
          employeeId={employee.id}
          companyId={companyId}
          onJumpToDocuments={onJumpToDocuments}
        />
      )}

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

      {/* Premium address field — replaces the old free-text "Dirección" row.
          Persists as JSONB (address_structured) AND syncs legacy columns. */}
      <EmployeeAddressSection
        employee={employee}
        isEditing={isEditing}
        onEmployeeUpdate={onEmployeeUpdate}
      />

      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Empleo</h3>
        <Card className="rounded-lg border-border/30">
          <CardContent className="p-3">
            {employmentVisible.map(f => (
              <FieldRow key={f.key} field={f} employee={employee} isEditing={isEditing} form={form} setForm={setForm} />
            ))}
            {employmentHidden.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="group mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Ver campos adicionales ({employmentHidden.length})
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1">
                    {employmentHidden.map(f => (
                      <FieldRow key={f.key} field={f} employee={employee} isEditing={isEditing} form={form} setForm={setForm} />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">📅 Disponibilidad</h3>
        <EmployeeAvailabilitySection employeeId={employee.id} readOnly={!isEditing} />
      </div>
      {/* Vehicle Documents Section */}
      <VehicleDocumentsSection employeeId={employee.id} />
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
    if (!formConceptId) return;
    const rateNum = toNumOrNull(formRate);
    if (rateNum === null || rateNum < 0) { toast.error("Tarifa inválida"); return; }
    setSaving(true);
    const { error } = await supabase.from("concept_employee_rates").insert({ employee_id: employee.id, concept_id: formConceptId, rate: rateNum });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Tarifa agregada");
    setAdding(false); setFormConceptId(""); setFormRate(""); fetchRates();
  };
  const handleUpdate = async (id: string) => {
    const rateNum = toNumOrNull(formRate);
    if (rateNum === null || rateNum < 0) { toast.error("Tarifa inválida"); return; }
    setSaving(true);
    const { error } = await supabase.from("concept_employee_rates").update({ rate: rateNum }).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Tarifa actualizada");
    setEditingId(null); setFormRate(""); fetchRates();
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
  // Historial por persona: incluye las fichas fusionadas del mismo tenant.
  useEffect(() => { async function fetch() { const identityIds = await resolveIdentityEmployeeIds(employee.id); const { data } = await supabase.from("shift_assignments").select("id, status, shift_id, scheduled_shifts(title, date, start_time, end_time, status)").in("employee_id", identityIds).eq("company_id", companyId).order("created_at", { ascending: false }).limit(20); setShifts(data ?? []); setLoading(false); } fetch(); }, [employee.id, companyId]);
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
  const [docs, setDocs] = useState<UnifiedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<{
    action: "reject" | "replacement"; doc: UnifiedDocument;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // VWC Fase 3B: conflicto al revisar documentos.
  const [docConflict, setDocConflict] = useState<VersionConflictInfo | null>(null);
  const { toast } = useToast();

  const fetchDocs = useCallback(async () => {
    const [{ data: w9Data }, unified] = await Promise.all([
      supabase.from("contractor_w9")
        .select("id, status, legal_name, tax_classification, tin_last4, submitted_at, reviewed_at")
        .eq("employee_id", employee.id).eq("company_id", companyId).maybeSingle(),
      fetchUnifiedDocuments(employee.id, companyId),
    ]);
    setW9(w9Data);
    setDocs(unified);
    setLoading(false);
  }, [employee.id, companyId]);
  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleApprove = async (doc: UnifiedDocument) => {
    setBusyId(doc.id);
    const { error, conflict: c } = await approveDocument(doc);
    setBusyId(null);
    if (c) {
      setDocConflict({
        patch: { review_status: "approved" },
        serverRow: c.row,
        actualVersion: c.actualVersion,
        expectedVersion: c.expectedVersion,
        updatedAt: c.updatedAt,
      });
      return;
    }
    if (error) { toast({ title: "Error", description: error, variant: "destructive" }); return; }
    toast({ title: "Document approved" });
    fetchDocs();
  };

  const handleReasonConfirm = async (reason: string) => {
    if (!reasonDialog) return;
    const { doc, action } = reasonDialog;
    setBusyId(doc.id);
    const fn = action === "reject" ? rejectDocument : requestReplacement;
    const { error, conflict: c } = await fn(doc, reason);
    setBusyId(null);
    setReasonDialog(null);
    if (c) {
      setDocConflict({
        patch: { review_status: action === "reject" ? "rejected" : "replacement_requested" },
        serverRow: c.row,
        actualVersion: c.actualVersion,
        expectedVersion: c.expectedVersion,
        updatedAt: c.updatedAt,
      });
      return;
    }
    if (error) { toast({ title: "Error", description: error, variant: "destructive" }); return; }
    toast({ title: action === "reject" ? "Document rejected" : "Replacement requested" });
    fetchDocs();
  };

  const handleUploadConfirm = async (input: { file: File; category: string; approveOnUpload: boolean }) => {
    const { error } = await uploadAdminDocument({
      employeeId: employee.id,
      companyId,
      ...input,
    });
    if (error) { toast({ title: "Error", description: error, variant: "destructive" }); return; }
    toast({ title: input.approveOnUpload ? "Document uploaded & approved" : "Document uploaded" });
    setUploadOpen(false);
    fetchDocs();
  };

  const handleDelete = async (doc: UnifiedDocument) => {
    if (doc.source !== "employee_documents") {
      toast({ title: "Cannot delete", description: "Onboarding documents are managed by the worker.", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    const raw: string = doc.file_url ?? "";
    const marker = "/storage/v1/object/public/employee-documents/";
    const idx = raw.indexOf(marker);
    const path = idx !== -1 ? raw.slice(idx + marker.length) : raw;
    let storageOk = true;
    if (path) {
      const { error: rmErr } = await supabase.storage.from("employee-documents").remove([path]);
      if (rmErr) storageOk = false;
    }
    const { error: delErr } = await (supabase.from("employee_documents" as any) as any).delete().eq("id", doc.raw_id);
    if (delErr) {
      toast({ title: "Delete failed", description: delErr.message, variant: "destructive" });
      return;
    }
    // Best-effort audit log for symmetry with approve/reject/replacement/upload
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (userId) {
        await supabase.from("activity_log" as any).insert({
          user_id: userId,
          company_id: doc.company_id,
          action: "document_deleted",
          entity_type: "employee_document",
          entity_id: doc.raw_id,
          details: {
            source_table: doc.source,
            employee_id: doc.employee_id,
            document_name: doc.name,
            category: doc.category,
            storage_cleanup_ok: storageOk,
          },
        } as any);
      }
    } catch { /* never block UX on audit */ }
    toast({
      title: storageOk ? "Document deleted" : "Document row deleted. Storage cleanup pending.",
    });
    fetchDocs();
  };

  if (loading) return <div className="py-6 text-center text-[11px] text-muted-foreground">Loading...</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Documents</h3>
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3 w-3" /> Upload
        </Button>
      </div>

      {docs.length > 0 ? (
        <div className="space-y-2">
          {docs.map((doc) => {
            const badge = stateBadge(doc.state);
            const isBusy = busyId === doc.id;
            const sourceLabel = doc.source === "employee_documents" ? "Admin upload" : "Onboarding";
            return (
              <Card key={doc.id} className="rounded-xl border-border/40">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="h-8 w-8 rounded-lg bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="h-4 w-4 text-primary/70" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium truncate leading-tight">{doc.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {doc.category} · <span className="text-muted-foreground/70">{sourceLabel}</span>
                          {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ""}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          Uploaded {safeFormat(doc.created_at, "dd MMM yyyy")}
                          {doc.reviewed_at ? ` · Reviewed ${safeFormat(doc.reviewed_at, "dd MMM yyyy")}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn("text-[9px] shrink-0 whitespace-nowrap", badge.cls)}>{badge.label}</Badge>
                  </div>

                  {doc.state === "rejected" && doc.reason && (
                    <p className="text-[10px] text-destructive/90 leading-snug pl-10">
                      <span className="font-semibold">Reason:</span> {doc.reason}
                    </p>
                  )}
                  {doc.state === "replacement_requested" && doc.replacement_reason && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug pl-10">
                      <span className="font-semibold">Replacement:</span> {doc.replacement_reason}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pl-10">
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => openEmployeeDocument(doc.file_url)}>
                      <ExternalLink className="h-3 w-3" /> View
                    </Button>
                    {doc.state !== "approved" && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" onClick={() => handleApprove(doc)} disabled={isBusy}>
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </Button>
                    )}
                    {doc.state !== "rejected" && doc.state !== "replacement_requested" && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setReasonDialog({ action: "reject", doc })} disabled={isBusy}>
                        <AlertCircle className="h-3 w-3" /> Reject
                      </Button>
                    )}
                    {doc.state !== "replacement_requested" && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400" onClick={() => setReasonDialog({ action: "replacement", doc })} disabled={isBusy}>
                        <Tag className="h-3 w-3" /> Request replacement
                      </Button>
                    )}
                    {doc.source === "employee_documents" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive ml-auto" onClick={() => handleDelete(doc)} disabled={isBusy}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={FileText} title="No documents" description="Upload an ID, license or signed form" compact />
      )}

      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 pt-2">W-9</h3>
      {!w9 ? <EmptyState icon={FileText} title="No W-9" description="W-9 has not been submitted" compact /> : (
        <Card className="rounded-lg border-border/30"><CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold">{w9.legal_name}</p><Badge className={cn("text-[9px]", w9.status === "approved" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : w9.status === "submitted" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>{w9.status === "approved" ? "Approved" : w9.status === "submitted" ? "Submitted" : w9.status}</Badge></div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]"><div><span className="text-muted-foreground">Classification:</span> {w9.tax_classification}</div><div><span className="text-muted-foreground">TIN:</span> ***{w9.tin_last4 ?? "—"}</div></div>
        </CardContent></Card>
      )}

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onConfirm={handleUploadConfirm} />
      {reasonDialog && (
        <DocumentReasonDialog
          open={!!reasonDialog}
          onOpenChange={(o) => !o && setReasonDialog(null)}
          action={reasonDialog.action}
          documentName={reasonDialog.doc.name}
          initialReason={
            reasonDialog.action === "reject"
              ? (reasonDialog.doc.reason ?? "")
              : (reasonDialog.doc.replacement_reason ?? "")
          }
          onConfirm={handleReasonConfirm}
        />
      )}
      <VersionConflictDialog
        open={!!docConflict}
        conflict={docConflict}
        entityLabel="este documento"
        kind="service"
        onReload={() => { setDocConflict(null); fetchDocs(); }}
        onCancel={() => setDocConflict(null)}
      />
    </div>

  );
}

/** Premium status badge mapping (English). */
function stateBadge(state: UnifiedDocument["state"]): { label: string; cls: string } {
  switch (state) {
    case "approved":
      return { label: "Approved", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
    case "rejected":
      return { label: "Rejected", cls: "bg-destructive/10 text-destructive" };
    case "replacement_requested":
      return { label: "Replacement requested", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
    case "expired":
      return { label: "Expired", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400" };
    default:
      return { label: "Pending review", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  }
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
  employee, companyId, isEditing, form, setForm, isPrivileged, onEmployeeUpdate, companyName, onInvite, invitation,
  activeTab, onTabChange,
}: {
  employee: EmployeeRecord; companyId: string; isEditing: boolean;
  form: Record<string, string>;
  setForm: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  isPrivileged: boolean;
  onEmployeeUpdate?: (updates: Partial<EmployeeRecord>) => void;
  companyName?: string;
  onInvite?: () => void;
  invitation?: import("@/hooks/useEmployeeInvitations").EmployeeInvitation | null;
  activeTab?: string;
  onTabChange?: (value: string) => void;
}) {
  const wpHook = useWorkerProfile({ employeeId: employee?.id });

  if (!employee?.id) return <div className="py-6 text-center text-[11px] text-muted-foreground">Selecciona un empleado</div>;

  const tabsControlProps = activeTab !== undefined
    ? { value: activeTab, onValueChange: onTabChange }
    : { defaultValue: "info" };

  return (
    <Tabs {...tabsControlProps} className="w-full">
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
        {isPrivileged && (
          <TabsTrigger value="fit" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
            <Star className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Fit</span>
          </TabsTrigger>
        )}
        <TabsTrigger value="activity" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1 font-medium flex-1 min-w-0 px-1.5 h-7">
          <Activity className="h-3 w-3 shrink-0" /><span className="hidden sm:inline">Log</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="mt-0"><InfoTab employee={employee} companyId={companyId} isEditing={isEditing} form={form} setForm={setForm} isPrivileged={isPrivileged} onEmployeeUpdate={onEmployeeUpdate} onJumpToDocuments={onTabChange ? () => onTabChange("docs") : undefined} /></TabsContent>
      <TabsContent value="profile" className="mt-0"><WorkerProfileTab employeeId={employee.id} readOnly={!isEditing} /></TabsContent>
      {/* Phase 1A cleanup 2026-06-17: removed dead `reputation` TabsContent.
          The trigger was never in TabsList (inaccessible), and the reputation
          pipeline (useEmployeeReputation, useReputation, review_scores,
          rep_scores) remains untouched. */}
      <TabsContent value="pay" className="mt-0"><PayTab employee={employee} companyId={companyId} /></TabsContent>
      <TabsContent value="compensation" className="mt-0">
        <Suspense fallback={<div className="py-6 text-center text-[11px] text-muted-foreground">Cargando...</div>}>
          <EmployeeCompensationTab employeeId={employee.id} employeeName={`${employee.first_name ?? ""} ${employee.last_name ?? ""}`} companyId={companyId} />
        </Suspense>
      </TabsContent>
      <TabsContent value="advances" className="mt-0"><EmployeeAdvancesTab employeeId={employee.id} companyId={companyId} /></TabsContent>
      <TabsContent value="shifts" className="mt-0"><ShiftsTab employee={employee} companyId={companyId} /></TabsContent>
      <TabsContent value="time" className="mt-0"><TimeTab employee={employee} companyId={companyId} /></TabsContent>
      {isPrivileged && (
        <TabsContent value="fit" className="mt-0">
          <Card className="rounded-lg border-border/30">
            <CardContent className="p-3 space-y-3">
              <div>
                <h3 className="text-xs font-semibold">Client &amp; location fit</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Preferred workers appear higher in Recommended for that client/location. Blocked workers can't be assigned from Recommended until cleared. Internal — not visible to workers.
                </p>
              </div>
              <WorkerPreferenceList mode="worker" companyId={companyId} targetId={employee.id} canManage={isPrivileged} />
            </CardContent>
          </Card>
        </TabsContent>
      )}
      <TabsContent value="access" className="mt-0"><EmployeeAccessTab employee={employee} companyId={companyId} companyName={companyName} isPrivileged={isPrivileged} onEmployeeUpdate={onEmployeeUpdate} onInvite={onInvite} invitation={invitation} /></TabsContent>
      <TabsContent value="docs" className="mt-0"><DocumentsTab employee={employee} companyId={companyId} /></TabsContent>
      <TabsContent value="activity" className="mt-0"><ActivityTab employee={employee} /></TabsContent>
    </Tabs>
  );
}
