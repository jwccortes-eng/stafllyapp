import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Bug, Plus, CheckCircle2, AlertTriangle, Clock, Filter,
  RotateCcw, ChevronDown, ChevronUp, MessageSquare,
} from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  companyId: string | null;
  period: PeriodStatus;
  employees: Map<string, string>;
}

interface UATIssue {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string | null;
  linked_employee_id: string | null;
  linked_record_id: string | null;
  linked_step: string | null;
  reported_by: string | null;
  reported_at: string;
  status: string;
  fix_notes: string | null;
  fixed_at: string | null;
  retested_at: string | null;
  retested_by: string | null;
}

const CATEGORIES = [
  "import_parsing", "employee_match", "payroll_classification", "variance_explanation",
  "publish_behavior", "ux_friction", "duplicate_risk", "incorrect_totals",
  "signoff_confusion", "post_publish_inconsistency", "general",
];

const CATEGORY_LABELS: Record<string, string> = {
  import_parsing: "Import / Parsing",
  employee_match: "Employee Match",
  payroll_classification: "Clasificación Payroll",
  variance_explanation: "Varianza",
  publish_behavior: "Publish",
  ux_friction: "UX / Fricción",
  duplicate_risk: "Duplicados",
  incorrect_totals: "Totales Incorrectos",
  signoff_confusion: "Signoff",
  post_publish_inconsistency: "Post-Publish",
  general: "General",
};

const SEVERITY_CONFIG: Record<string, { color: string; icon: any }> = {
  critical: { color: "text-destructive", icon: AlertTriangle },
  high: { color: "text-warning", icon: AlertTriangle },
  medium: { color: "text-primary", icon: Bug },
  low: { color: "text-muted-foreground", icon: Bug },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "success" | "warning" }> = {
  open: { label: "Abierto", variant: "destructive" },
  fixed: { label: "Corregido", variant: "warning" },
  retested: { label: "Re-testeado", variant: "success" },
  accepted: { label: "Aceptado", variant: "default" },
  wontfix: { label: "No se corrige", variant: "secondary" },
};

export default function UATIssueTracker({ companyId, period, employees }: Props) {
  const { user } = useAuth();
  const [issues, setIssues] = useState<UATIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSeverity, setNewSeverity] = useState("medium");
  const [newCategory, setNewCategory] = useState("general");
  const [newStep, setNewStep] = useState("");
  const [newEmployeeId, setNewEmployeeId] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("reconciliation_uat_issues" as any)
      .select("*")
      .eq("company_id", companyId)
      .eq("period_status_id", period.id)
      .order("reported_at", { ascending: false })
      .limit(200);
    setIssues((data || []) as any[]);
    setLoading(false);
  }, [companyId, period.id]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!companyId || !newTitle.trim()) return;
    await supabase.from("reconciliation_uat_issues" as any).insert({
      company_id: companyId,
      period_status_id: period.id,
      title: newTitle.trim(),
      description: newDesc || null,
      severity: newSeverity,
      category: newCategory,
      linked_step: newStep || null,
      linked_employee_id: newEmployeeId || null,
      reported_by: user?.id || null,
    } as any);
    setShowCreate(false);
    setNewTitle(""); setNewDesc(""); setNewSeverity("medium"); setNewCategory("general"); setNewStep(""); setNewEmployeeId("");
    load();
  };

  const updateStatus = async (id: string, status: string, fixNotes?: string) => {
    const update: any = { status };
    if (status === "fixed") { update.fixed_at = new Date().toISOString(); update.fix_notes = fixNotes || null; }
    if (status === "retested") { update.retested_at = new Date().toISOString(); update.retested_by = user?.id || null; }
    await supabase.from("reconciliation_uat_issues" as any).update(update).eq("id", id);
    load();
  };

  const filtered = issues.filter(i => {
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
    return true;
  });

  const counts = {
    open: issues.filter(i => i.status === "open").length,
    critical: issues.filter(i => i.severity === "critical" && i.status === "open").length,
    high: issues.filter(i => i.severity === "high" && i.status === "open").length,
    fixed: issues.filter(i => i.status === "fixed").length,
    retested: issues.filter(i => i.status === "retested").length,
  };

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Abiertos", value: counts.open, color: "text-destructive" },
          { label: "Críticos", value: counts.critical, color: "text-destructive" },
          { label: "Altos", value: counts.high, color: "text-warning" },
          { label: "Corregidos", value: counts.fixed, color: "text-primary" },
          { label: "Re-testeados", value: counts.retested, color: "text-earning" },
        ].map(s => (
          <div key={s.label} className="text-center p-3 bg-muted/30 rounded-lg">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="h-3 w-3" /> Reportar Issue
        </Button>
        <div className="flex items-center gap-1 ml-auto">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="open">Abiertos</SelectItem>
              <SelectItem value="fixed">Corregidos</SelectItem>
              <SelectItem value="retested">Re-testeados</SelectItem>
              <SelectItem value="accepted">Aceptados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Severidad</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
              <SelectItem value="high">Alto</SelectItem>
              <SelectItem value="medium">Medio</SelectItem>
              <SelectItem value="low">Bajo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Issue list */}
      {filtered.length === 0 ? (
        <EmptyState icon={Bug} title="Sin issues" description="No hay issues registrados para este periodo con los filtros seleccionados." />
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-2">
            {filtered.map(issue => {
              const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.medium;
              const st = STATUS_CONFIG[issue.status] || STATUS_CONFIG.open;
              const SevIcon = sev.icon;
              const expanded = expandedId === issue.id;
              return (
                <Card key={issue.id} className="overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : issue.id)}
                  >
                    <SevIcon className={`h-4 w-4 shrink-0 ${sev.color}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{issue.title}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {CATEGORY_LABELS[issue.category] || issue.category}
                        {issue.linked_step && ` • ${issue.linked_step}`}
                        {issue.linked_employee_id && ` • ${employees.get(issue.linked_employee_id) || "Empleado"}`}
                      </span>
                    </div>
                    <Badge variant={st.variant} className="text-[10px] shrink-0">{st.label}</Badge>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${sev.color}`}>{issue.severity}</Badge>
                    {expanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                  </div>
                  {expanded && (
                    <div className="px-4 pb-4 pt-1 border-t space-y-3">
                      {issue.description && <p className="text-xs text-muted-foreground">{issue.description}</p>}
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        <p>Reportado: {new Date(issue.reported_at).toLocaleString("es")}</p>
                        {issue.fixed_at && <p>Corregido: {new Date(issue.fixed_at).toLocaleString("es")}</p>}
                        {issue.retested_at && <p>Re-testeado: {new Date(issue.retested_at).toLocaleString("es")}</p>}
                        {issue.fix_notes && <p className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {issue.fix_notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {issue.status === "open" && (
                          <FixButton onFix={(notes) => updateStatus(issue.id, "fixed", notes)} />
                        )}
                        {issue.status === "fixed" && (
                          <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => updateStatus(issue.id, "retested")}>
                            <RotateCcw className="h-3 w-3" /> Marcar Re-testeado
                          </Button>
                        )}
                        {(issue.status === "retested" || issue.status === "fixed") && (
                          <Button size="sm" variant="default" className="gap-1 text-xs h-7" onClick={() => updateStatus(issue.id, "accepted")}>
                            <CheckCircle2 className="h-3 w-3" /> Aceptar
                          </Button>
                        )}
                        {issue.status !== "open" && issue.status !== "wontfix" && (
                          <Button size="sm" variant="ghost" className="gap-1 text-xs h-7" onClick={() => updateStatus(issue.id, "open")}>
                            <Clock className="h-3 w-3" /> Reabrir
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reportar Issue UAT</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Descripción breve del problema" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Detalle del issue, pasos para reproducir, etc." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Severidad</Label>
                <Select value={newSeverity} onValueChange={setNewSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Crítico</SelectItem>
                    <SelectItem value="high">Alto</SelectItem>
                    <SelectItem value="medium">Medio</SelectItem>
                    <SelectItem value="low">Bajo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoría</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Paso / Tab relacionado (opcional)</Label>
              <Input value={newStep} onChange={e => setNewStep(e.target.value)} placeholder="Ej: import, matching, publish" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>Reportar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* Inline fix button with notes input */
function FixButton({ onFix }: { onFix: (notes: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-3 w-3" /> Marcar Corregido
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas de corrección..." className="h-7 text-xs" />
      <Button size="sm" className="h-7 text-xs" onClick={() => { onFix(notes); setOpen(false); setNotes(""); }}>
        Guardar
      </Button>
    </div>
  );
}
