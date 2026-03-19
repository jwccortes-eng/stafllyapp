import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitCompareArrows, CheckCircle2, AlertTriangle, Link2, XCircle, User, Loader2, Eye } from "lucide-react";
import { matchScheduleToClock, type NormalizedScheduleRow, type NormalizedClockRow } from "@/lib/reconciliation-engine";
import MatchDetailDrawer from "./MatchDetailDrawer";

interface Props {
  companyId: string | null;
  onRefresh: () => void;
}

interface MatchRow {
  id: string;
  match_type: string;
  match_status: string;
  confidence_score: number;
  hours_variance: number | null;
  pay_variance: number | null;
  conflict_flags: any;
  employee_id: string | null;
  schedule_row_id: string | null;
  clock_row_id: string | null;
  payroll_row_id: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export default function ReconciliationReviewPanel({ companyId, onRefresh }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [runningMatch, setRunningMatch] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    let q = supabase
      .from("reconciliation_matches" as any)
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (filter !== "all") q = q.eq("match_status", filter);

    q.then(({ data }) => {
      setMatches((data || []) as any);
      setLoading(false);
    });
  }, [companyId, filter]);

  const runMatching = async () => {
    if (!companyId) return;
    setRunningMatch(true);
    try {
      console.log("[Matching] Fetching normalized rows for company:", companyId);
      // Fetch normalized rows
      const [schedRes, clockRes] = await Promise.all([
        supabase.from("normalized_schedule_rows" as any).select("*").eq("company_id", companyId),
        supabase.from("normalized_clock_rows" as any).select("*").eq("company_id", companyId),
      ]);

      if (schedRes.error) console.error("[Matching] Schedule fetch error:", schedRes.error);
      if (clockRes.error) console.error("[Matching] Clock fetch error:", clockRes.error);

      const schedules = (schedRes.data || []) as any as NormalizedScheduleRow[];
      const clocks = (clockRes.data || []) as any as NormalizedClockRow[];

      console.log("[Matching] Found", schedules.length, "schedules and", clocks.length, "clocks");

      if (schedules.length === 0 && clocks.length === 0) {
        toast({ title: "Sin datos", description: "Importa turnos y fichajes primero desde la pestaña Importar.", variant: "destructive" });
        return;
      }

      const results = matchScheduleToClock(schedules, clocks);
      console.log("[Matching] Generated", results.length, "match results");

      // Save matches
      const inserts = results.map(r => ({
        company_id: companyId,
        match_type: r.match_type,
        schedule_row_id: r.schedule_id,
        clock_row_id: r.clock_id,
        payroll_row_id: r.payroll_id,
        employee_id: r.employee_id,
        confidence_score: r.confidence,
        match_status: r.match_status,
        hours_variance: r.hours_variance,
        pay_variance: r.pay_variance,
        conflict_flags: r.conflict_flags,
      }));

      for (let i = 0; i < inserts.length; i += 100) {
        const { error } = await supabase.from("reconciliation_matches" as any).insert(inserts.slice(i, i + 100) as any);
        if (error) {
          console.error("[Matching] Match insert error:", error);
          throw error;
        }
      }

      // Create exceptions for unmatched
      const unmatched = results.filter(r => r.match_status === "unmatched");
      if (unmatched.length > 0) {
        const exceptions = unmatched.map(r => ({
          company_id: companyId,
          exception_type: r.conflict_flags.includes("clock_without_schedule") ? "unmatched_clock" : "unmatched_schedule",
          severity: "medium",
          source_type: r.schedule_id ? "schedule" : "clock",
          source_row_id: r.schedule_id || r.clock_id,
          employee_id: r.employee_id,
          description: `Unmatched ${r.schedule_id ? "schedule" : "clock"} record`,
          source_data: { flags: r.conflict_flags },
          status: "open",
        }));
        const { error: excErr } = await supabase.from("reconciliation_exceptions" as any).insert(exceptions as any);
        if (excErr) console.error("[Matching] Exception insert error:", excErr);
      }

      toast({ title: "Matching completado", description: `${results.length} emparejamientos generados, ${unmatched.length} sin match.` });
      onRefresh();

      // Reload matches
      const { data: newMatches } = await supabase
        .from("reconciliation_matches" as any)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      setMatches((newMatches || []) as any);
    } catch (err: any) {
      console.error("[Matching] Error:", err);
      toast({ title: "Error en matching", description: err.message, variant: "destructive" });
    } finally {
      setRunningMatch(false);
    }
  };

  const resolveMatch = async (id: string, status: string, note?: string) => {
    const { error } = await supabase
      .from("reconciliation_matches" as any)
      .update({ match_status: status, resolved_by: user?.id, resolved_at: new Date().toISOString(), resolution_note: note || null } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMatches(prev => prev.map(m => m.id === id ? { ...m, match_status: status, resolution_note: note || null } : m));
      toast({ title: `Match ${status === "approved" ? "aprobado" : status === "rejected" ? "rechazado" : "resuelto como " + status}` });
    }
  };

  const openDetail = (m: MatchRow) => {
    setSelectedMatch(m);
    setDrawerOpen(true);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "exact": return "default";
      case "probable": return "secondary";
      case "ambiguous": return "outline";
      case "approved": return "default";
      case "rejected": return "destructive";
      default: return "destructive";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="exact">Exactos</SelectItem>
            <SelectItem value="probable">Probables</SelectItem>
            <SelectItem value="ambiguous">Ambiguos</SelectItem>
            <SelectItem value="unmatched">Sin match</SelectItem>
            <SelectItem value="approved">Aprobados</SelectItem>
            <SelectItem value="valid_unscheduled">Trabajo sin agenda</SelectItem>
            <SelectItem value="linked">Vinculados</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={runMatching} disabled={runningMatch}>
          {runningMatch ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <GitCompareArrows className="h-4 w-4 mr-1" />}
          Ejecutar Matching
        </Button>
        <Badge variant="secondary">{matches.length} resultados</Badge>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : matches.length === 0 ? (
        <EmptyState icon={GitCompareArrows} title="Sin emparejamientos" description="Importa datos y ejecuta el matching para ver resultados." />
      ) : (
        <Card>
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Confianza</TableHead>
                  <TableHead>Var. Horas</TableHead>
                  <TableHead>Var. Pago</TableHead>
                  <TableHead>Conflictos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map(m => (
                  <TableRow key={m.id} className={`cursor-pointer hover:bg-accent/50 ${m.match_status === "unmatched" ? "bg-destructive/5" : m.match_status === "ambiguous" ? "bg-amber-500/5" : ""}`} onClick={() => openDetail(m)}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{m.match_type.replace("_", " → ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColor(m.match_status) as any} className="text-xs">
                        {m.match_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{m.confidence_score}%</TableCell>
                    <TableCell className={m.hours_variance && Math.abs(m.hours_variance) > 0.5 ? "text-destructive font-medium" : ""}>
                      {m.hours_variance != null ? `${m.hours_variance > 0 ? "+" : ""}${m.hours_variance.toFixed(1)}h` : "—"}
                    </TableCell>
                    <TableCell className={m.pay_variance && Math.abs(m.pay_variance) > 10 ? "text-destructive font-medium" : ""}>
                      {m.pay_variance != null ? `$${m.pay_variance.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {Array.isArray(m.conflict_flags) && m.conflict_flags.length > 0
                        ? m.conflict_flags.map((f: string) => (
                            <Badge key={f} variant="outline" className="text-xs mr-1">{f}</Badge>
                          ))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(m)} title="Inspeccionar">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {m.match_status !== "approved" && m.match_status !== "rejected" && !["linked","created_shift","valid_unscheduled","ignored_duplicate"].includes(m.match_status) && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => resolveMatch(m.id, "approved")}>
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => resolveMatch(m.id, "rejected")}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      <MatchDetailDrawer
        match={selectedMatch}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onResolve={resolveMatch}
        companyId={companyId}
      />
    </div>
  );
}
