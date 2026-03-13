import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Sparkles, Users, Zap, CheckCircle2, Loader2, UserPlus, Brain, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmployeeSuggestion {
  employee_id: string;
  employee_name: string;
  score: number;
  reason: string;
}

interface ShiftSuggestion {
  shift_id: string;
  shift_title: string;
  employees: EmployeeSuggestion[];
}

interface AIResult {
  suggestions: ShiftSuggestion[];
  summary: string;
}

export default function AIWorkforce() {
  const { role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [assigning, setAssigning] = useState<Set<string>>(new Set());
  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  const allowedRoles = ["developer", "owner", "admin"];
  const hasAccess = allowedRoles.includes(role ?? "");

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  const handleAnalyze = async (mode: "suggest" | "optimize") => {
    if (!selectedCompanyId) {
      toast({ title: "Selecciona una empresa", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-workforce", {
        body: { company_id: selectedCompanyId, mode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "No se pudo obtener sugerencias",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (shiftId: string, employeeId: string) => {
    const key = `${shiftId}-${employeeId}`;
    if (assigning.has(key) || assigned.has(key)) return;
    setAssigning((prev) => new Set(prev).add(key));
    try {
      const { error } = await supabase.from("shift_assignments").insert({
        shift_id: shiftId,
        employee_id: employeeId,
        company_id: selectedCompanyId!,
        status: "confirmed",
      } as any);
      if (error) throw error;
      setAssigned((prev) => new Set(prev).add(key));
      toast({ title: "Empleado asignado ✓" });
    } catch (err: any) {
      toast({ title: "Error al asignar", description: err.message, variant: "destructive" });
    } finally {
      setAssigning((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800";
    if (score >= 60) return "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800";
    return "text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/30 dark:border-rose-800";
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="AI Workforce Optimization"
        subtitle="Sugerencias inteligentes de asignación de personal basadas en habilidades, disponibilidad y rendimiento."
        icon={Sparkles}
      />

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-primary/20 hover:border-primary/40 transition-colors cursor-pointer group"
          onClick={() => !loading && handleAnalyze("suggest")}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Sugerir Empleados</CardTitle>
                <CardDescription className="text-xs">Para turnos abiertos próximos</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Analiza habilidades, experiencia y rendimiento para recomendar los mejores candidatos para cada turno.
            </p>
          </CardContent>
        </Card>

        <Card className="border-chart-4/20 hover:border-chart-4/40 transition-colors cursor-pointer group"
          onClick={() => !loading && handleAnalyze("optimize")}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-chart-4/10 flex items-center justify-center group-hover:bg-chart-4/20 transition-colors">
                <TrendingUp className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <CardTitle className="text-base">Optimizar Asignación</CardTitle>
                <CardDescription className="text-xs">Maximizar eficiencia global</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Redistribuye personal considerando carga de trabajo, distancia y disponibilidad para optimizar la operación.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Loading */}
      {loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/5 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <Loader2 className="absolute -top-1 -right-1 h-6 w-6 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Analizando datos de workforce...</p>
              <p className="text-sm text-muted-foreground mt-1">Evaluando habilidades, rendimiento y disponibilidad</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <Card className="bg-muted/30">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Resumen del análisis</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Suggestions per shift */}
          {result.suggestions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10 gap-2">
                <Users className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-muted-foreground">No hay turnos abiertos que requieran asignación.</p>
              </CardContent>
            </Card>
          ) : (
            result.suggestions.map((shift) => (
              <Card key={shift.shift_id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {shift.shift_title}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {shift.employees.length} sugerencias
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {shift.employees.map((emp) => {
                    const key = `${shift.shift_id}-${emp.employee_id}`;
                    const isAssigning = assigning.has(key);
                    const isAssigned = assigned.has(key);

                    return (
                      <div
                        key={emp.employee_id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                          isAssigned
                            ? "bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                            : "bg-background hover:bg-muted/30"
                        )}
                      >
                        {/* Score badge */}
                        <div className={cn("shrink-0 h-10 w-10 rounded-lg border flex items-center justify-center text-sm font-bold tabular-nums", scoreColor(emp.score))}>
                          {emp.score}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{emp.employee_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{emp.reason}</p>
                        </div>

                        {/* Action */}
                        {isAssigned ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Asignado
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 gap-1.5 text-xs"
                            disabled={isAssigning}
                            onClick={() => handleAssign(shift.shift_id, emp.employee_id)}
                          >
                            {isAssigning ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <UserPlus className="h-3 w-3" />
                            )}
                            Asignar
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
