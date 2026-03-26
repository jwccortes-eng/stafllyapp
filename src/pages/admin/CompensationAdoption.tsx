import { useState } from "react";
import { format, addDays, nextMonday } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCompensationAdoption, type ConfidenceLevel, type AdoptionDecision, type BatchOption } from "@/hooks/useCompensationAdoption";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Pencil, ShieldCheck, AlertTriangle,
  Eye, Zap, Loader2, ArrowRight, Users, CircleDot, CalendarIcon,
  FileText, Database,
} from "lucide-react";

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; color: string; icon: any }> = {
  high: { label: "Alta", color: "bg-[hsl(var(--earning-bg))] text-[hsl(var(--earning))] border-[hsl(var(--earning)/0.3)]", icon: ShieldCheck },
  medium: { label: "Media", color: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)]", icon: AlertTriangle },
  review: { label: "Revisar", color: "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)]", icon: Eye },
};

const DATE_PRESETS = [
  { label: "Hoy", getValue: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Mañana", getValue: () => format(addDays(new Date(), 1), "yyyy-MM-dd") },
  { label: "Próximo lunes", getValue: () => format(nextMonday(new Date()), "yyyy-MM-dd") },
];

export default function CompensationAdoption() {
  const {
    proposals, stats, loading, generated,
    availableBatches, selectedBatch, selectedBatchId, setSelectedBatchId,
    effectiveDate, setEffectiveDate,
    generateProposals, updateDecision, applyConfirmed,
  } = useCompensationAdoption();

  const [filter, setFilter] = useState<"all" | ConfidenceLevel>("all");
  const [applying, setApplying] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = filter === "all"
    ? proposals
    : proposals.filter((p) => p.confidence === filter);

  const handleApply = async () => {
    if (stats.accepted === 0) {
      toast.warning("No hay propuestas confirmadas para aplicar");
      return;
    }
    setApplying(true);
    try {
      const { applied, errors } = await applyConfirmed();
      if (errors > 0) {
        toast.warning(`${applied} aplicados, ${errors} errores`);
      } else {
        toast.success(`${applied} perfiles de compensación actualizados`);
      }
    } catch {
      toast.error("Error al aplicar cambios");
    } finally {
      setApplying(false);
    }
  };

  const handleAcceptAll = (confidence: ConfidenceLevel) => {
    proposals.forEach((p) => {
      if (p.confidence === confidence && !p.decision) {
        updateDecision(p.employeeId, "accept");
      }
    });
    toast.success(`Todas las propuestas ${CONFIDENCE_CONFIG[confidence].label.toLowerCase()} aceptadas`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adopción de Compensación"
        subtitle="Revisión y confirmación manual de compensaciones derivadas del payroll cerrado"
        icon={Zap}
        variant="4"
        eyebrow="Compensación"
      />

      {/* ── Step 1: Batch selector ── */}
      <Card className="border-[hsl(var(--primary)/0.2)]">
        <CardContent className="py-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4 text-primary" />
            Paso 1 — Seleccionar Batch Fuente
          </div>

          {availableBatches.length === 0 && !loading ? (
            <p className="text-sm text-destructive">No hay batches aprobados/reconciliados disponibles.</p>
          ) : (
            <div className="grid gap-2">
              {availableBatches.map((b) => (
                <BatchCard
                  key={b.id}
                  batch={b}
                  selected={selectedBatchId === b.id}
                  onSelect={() => setSelectedBatchId(b.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: Effective date ── */}
      {selectedBatchId && (
        <Card className="border-[hsl(var(--primary)/0.2)]">
          <CardContent className="py-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarIcon className="h-4 w-4 text-primary" />
              Paso 2 — Fecha Efectiva de Adopción
            </div>
            <p className="text-xs text-muted-foreground">
              Los perfiles anteriores se cerrarán con esta fecha. Los nuevos perfiles tendrán vigencia desde esta fecha.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {DATE_PRESETS.map((preset) => {
                const val = preset.getValue();
                return (
                  <Button
                    key={preset.label}
                    variant={effectiveDate === val ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEffectiveDate(val)}
                  >
                    {preset.label}
                    {effectiveDate === val && <CheckCircle2 className="h-3 w-3 ml-1" />}
                  </Button>
                );
              })}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {DATE_PRESETS.some((p) => p.getValue() === effectiveDate)
                      ? "Fecha manual"
                      : effectiveDate}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(effectiveDate + "T12:00:00")}
                    onSelect={(d) => d && setEffectiveDate(format(d, "yyyy-MM-dd"))}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-sm font-mono text-muted-foreground ml-2">
                Vigencia: {effectiveDate}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Generate ── */}
      {selectedBatchId && !generated ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Zap className="h-10 w-10 text-primary" />
            <p className="text-muted-foreground text-center max-w-md">
              Genera propuestas de compensación a partir del batch seleccionado.
              Nada se aplica automáticamente — cada cambio requiere tu confirmación.
            </p>
            <Button onClick={generateProposals} disabled={loading} size="lg">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Generar Propuestas
            </Button>
          </CardContent>
        </Card>
      ) : generated ? (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatsCard label="Total" value={stats.total} icon={Users} color="primary" />
            <StatsCard label="Alta Confianza" value={stats.high} icon={ShieldCheck} color="earning" />
            <StatsCard label="Media" value={stats.medium} icon={AlertTriangle} color="warning" />
            <StatsCard label="Revisar" value={stats.review} icon={Eye} color="destructive" />
            <StatsCard label="Confirmados" value={stats.accepted} icon={CheckCircle2} color="earning" />
          </div>

          {/* Filters + actions bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({stats.total})</SelectItem>
                <SelectItem value="high">Alta confianza ({stats.high})</SelectItem>
                <SelectItem value="medium">Media ({stats.medium})</SelectItem>
                <SelectItem value="review">Revisar ({stats.review})</SelectItem>
              </SelectContent>
            </Select>

            {stats.high > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleAcceptAll("high")}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aceptar Todas Alta Confianza
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Vigencia: <span className="font-mono font-medium">{effectiveDate}</span>
              </span>
              <Button
                onClick={handleApply}
                disabled={applying || stats.accepted === 0}
                className="gap-2"
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Aplicar {stats.accepted} Confirmados
              </Button>
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Rate Actual</TableHead>
                    <TableHead>Rate Sugerido</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Confianza</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No hay propuestas en esta categoría
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((p) => {
                    const conf = CONFIDENCE_CONFIG[p.confidence];
                    const ConfIcon = conf.icon;
                    const isEditing = editingId === p.employeeId;

                    return (
                      <TableRow
                        key={p.employeeId}
                        className={
                          p.decision === "accept" ? "bg-[hsl(var(--earning)/0.04)]"
                          : p.decision === "skip" ? "opacity-50"
                          : p.decision === "edit" ? "bg-[hsl(var(--warning)/0.04)]"
                          : ""
                        }
                      >
                        <TableCell className="font-medium">{p.employeeName}</TableCell>
                        <TableCell>
                          {p.currentHourlyRate
                            ? <span className="font-mono">${p.currentHourlyRate}/hr</span>
                            : <span className="text-muted-foreground text-xs">—</span>}
                          {p.currentDailyRate ? (
                            <span className="block text-xs text-muted-foreground font-mono">
                              ${p.currentDailyRate}/día
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs">$</span>
                              <Input
                                type="number"
                                className="w-20 h-7 text-xs"
                                defaultValue={p.editedRate ?? p.suggestedHourlyRate ?? ""}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val > 0) {
                                    updateDecision(p.employeeId, "edit", val);
                                  }
                                  setEditingId(null);
                                }}
                                autoFocus
                              />
                            </div>
                          ) : (
                            <>
                              {p.suggestedHourlyRate ? (
                                <span className="font-mono font-semibold">
                                  ${p.decision === "edit" && p.editedRate ? p.editedRate : p.suggestedHourlyRate}/hr
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                              {p.suggestedDailyRate ? (
                                <span className="block text-xs text-muted-foreground font-mono">
                                  ${p.suggestedDailyRate}/día
                                </span>
                              ) : null}
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {p.suggestedPaymentMode === "hybrid" ? "Mixto" : p.suggestedPaymentMode === "daily" ? "Diario" : "Hora"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs gap-1 ${conf.color}`}>
                            <ConfIcon className="h-3 w-3" />
                            {conf.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground max-w-[200px] truncate block">
                            {p.reason}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant={p.decision === "accept" ? "default" : "ghost"}
                              size="xs"
                              onClick={() => updateDecision(p.employeeId, p.decision === "accept" ? null : "accept")}
                              title="Aceptar"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant={p.decision === "edit" ? "secondary" : "ghost"}
                              size="xs"
                              onClick={() => {
                                if (p.decision === "edit") {
                                  updateDecision(p.employeeId, null);
                                } else {
                                  setEditingId(p.employeeId);
                                }
                              }}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant={p.decision === "skip" ? "destructive" : "ghost"}
                              size="xs"
                              onClick={() => updateDecision(p.employeeId, p.decision === "skip" ? null : "skip")}
                              title="Omitir"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

/* ── Batch selection card ── */
function BatchCard({ batch, selected, onSelect }: { batch: BatchOption; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-colors",
        selected
          ? "border-primary bg-[hsl(var(--primary)/0.06)] ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:bg-muted/40"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {batch.truth_source_file_name ?? "Sin archivo"}
            </p>
            <p className="text-xs text-muted-foreground">
              {batch.payroll_period_start ?? "?"} → {batch.payroll_period_end ?? "?"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px] capitalize">{batch.status}</Badge>
          {batch.reconciliation_mode && (
            <Badge variant="secondary" className="text-[10px]">{batch.reconciliation_mode}</Badge>
          )}
          {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
        </div>
      </div>
    </button>
  );
}

/* ── Stats card ── */
function StatsCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="py-4 px-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center bg-[hsl(var(--${color})/0.1)]`}>
          <Icon className={`h-4.5 w-4.5 text-[hsl(var(--${color}))]`} />
        </div>
        <div>
          <p className="text-2xl font-bold font-heading leading-none">{value}</p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
