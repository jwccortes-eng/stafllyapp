import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { formatPersonName } from "@/lib/format-helpers";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { DollarSign, Search, Save, CheckCircle2 } from "lucide-react";

interface Concept {
  id: string;
  name: string;
  default_rate: number | null;
}

interface EmployeeRate {
  employeeId: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  currentRate: number | null;
  rateRecordId: string | null;
  newRate: string;
  selected: boolean;
}

export function BulkRateAssignment() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState("");
  const [employees, setEmployees] = useState<EmployeeRate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkValue, setBulkValue] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);

  // Load per_employee concepts
  const loadConcepts = useCallback(async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase
      .from("concepts")
      .select("id, name, default_rate")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true)
      .eq("rate_source", "per_employee")
      .order("name");
    setConcepts(data ?? []);
    if (data && data.length > 0 && !selectedConceptId) {
      setSelectedConceptId(data[0].id);
    }
  }, [selectedCompanyId, selectedConceptId]);

  // Load employees + their rates for selected concept
  const loadEmployees = useCallback(async () => {
    if (!selectedCompanyId || !selectedConceptId) return;
    setLoading(true);

    const [{ data: emps }, { data: rates }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, first_name, last_name, is_active")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true)
        .order("first_name"),
      supabase
        .from("concept_employee_rates")
        .select("id, employee_id, rate")
        .eq("concept_id", selectedConceptId),
    ]);

    const rateMap = new Map<string, { id: string; rate: number }>();
    (rates ?? []).forEach(r => rateMap.set(r.employee_id, { id: r.id, rate: Number(r.rate) }));

    setEmployees(
      (emps ?? []).map(e => {
        const existing = rateMap.get(e.id);
        return {
          employeeId: e.id,
          firstName: e.first_name,
          lastName: e.last_name,
          isActive: e.is_active,
          currentRate: existing?.rate ?? null,
          rateRecordId: existing?.id ?? null,
          newRate: existing ? String(existing.rate) : "",
          selected: false,
        };
      })
    );
    setSelectAll(false);
    setLoading(false);
  }, [selectedCompanyId, selectedConceptId]);

  useEffect(() => {
    if (open) loadConcepts();
  }, [open, loadConcepts]);

  useEffect(() => {
    if (open && selectedConceptId) loadEmployees();
  }, [open, selectedConceptId, loadEmployees]);

  const filtered = employees.filter(e => {
    const name = `${e.firstName} ${e.lastName}`.toLowerCase();
    const matchesSearch = !search || name.includes(search.toLowerCase());
    const matchesMissing = !showOnlyMissing || e.currentRate === null || e.currentRate === 0;
    return matchesSearch && matchesMissing;
  });

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    const filteredIds = new Set(filtered.map(e => e.employeeId));
    setEmployees(prev =>
      prev.map(e => filteredIds.has(e.employeeId) ? { ...e, selected: checked } : e)
    );
  };

  const toggleSelect = (employeeId: string) => {
    setEmployees(prev =>
      prev.map(e => e.employeeId === employeeId ? { ...e, selected: !e.selected } : e)
    );
  };

  const updateRate = (employeeId: string, value: string) => {
    setEmployees(prev =>
      prev.map(e => e.employeeId === employeeId ? { ...e, newRate: value } : e)
    );
  };

  const applyBulkValue = () => {
    if (!bulkValue) return;
    setEmployees(prev =>
      prev.map(e => e.selected ? { ...e, newRate: bulkValue } : e)
    );
    toast({ title: `Tarifa $${bulkValue} aplicada a ${employees.filter(e => e.selected).length} empleados` });
  };

  const handleSave = async () => {
    const toSave = employees.filter(e => {
      const newVal = parseFloat(e.newRate);
      if (isNaN(newVal)) return false;
      // Only save if value changed or is new
      return e.currentRate === null || newVal !== e.currentRate;
    });

    if (toSave.length === 0) {
      toast({ title: "Sin cambios", description: "No hay tarifas nuevas o modificadas para guardar." });
      return;
    }

    setSaving(true);
    let saved = 0;
    let errors = 0;

    // Process in batches of 50
    const BATCH = 50;
    for (let i = 0; i < toSave.length; i += BATCH) {
      const batch = toSave.slice(i, i + BATCH);
      
      const toUpdate = batch.filter(e => e.rateRecordId);
      const toInsert = batch.filter(e => !e.rateRecordId);

      const promises: PromiseLike<any>[] = [];

      if (toUpdate.length > 0) {
        // Update each individually (Supabase doesn't support bulk upsert with different values easily)
        for (const emp of toUpdate) {
          promises.push(
            supabase
              .from("concept_employee_rates")
              .update({ rate: parseFloat(emp.newRate) })
              .eq("id", emp.rateRecordId!)
              .then(({ error }) => { if (error) errors++; else saved++; })
          );
        }
      }

      if (toInsert.length > 0) {
        const rows = toInsert.map(emp => ({
          employee_id: emp.employeeId,
          concept_id: selectedConceptId,
          rate: parseFloat(emp.newRate),
        }));
        promises.push(
          supabase
            .from("concept_employee_rates")
            .insert(rows)
            .then(({ error }) => {
              if (error) errors += toInsert.length;
              else saved += toInsert.length;
            })
        );
      }

      await Promise.all(promises);
    }

    setSaving(false);
    if (errors > 0) {
      toast({ title: "Guardado parcial", description: `${saved} actualizados, ${errors} errores`, variant: "destructive" });
    } else {
      toast({ title: "Tarifas guardadas", description: `${saved} empleados actualizados correctamente` });
    }
    loadEmployees();
  };

  const selectedCount = employees.filter(e => e.selected).length;
  const conceptName = concepts.find(c => c.id === selectedConceptId)?.name ?? "";
  const missingCount = employees.filter(e => e.currentRate === null || e.currentRate === 0).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <DollarSign className="h-4 w-4 mr-2" />Tarifas masivas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Asignación masiva de tarifas</DialogTitle>
          <DialogDescription>
            Configura la tarifa por hora o por día de múltiples empleados a la vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* Concept selector */}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Concepto</label>
              <Select value={selectedConceptId} onValueChange={setSelectedConceptId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecciona un concepto" />
                </SelectTrigger>
                <SelectContent>
                  {concepts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.default_rate ? `(default: $${c.default_rate})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empleado..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Bulk actions bar */}
          <div className="flex gap-2 items-center flex-wrap text-sm">
            <Badge variant="secondary">{filtered.length} empleados</Badge>
            {missingCount > 0 && (
              <Button
                variant={showOnlyMissing ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowOnlyMissing(!showOnlyMissing)}
              >
                {missingCount} sin tarifa
              </Button>
            )}
            {selectedCount > 0 && (
              <div className="flex gap-2 items-center ml-auto">
                <span className="text-xs text-muted-foreground">{selectedCount} seleccionados</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Valor $"
                  value={bulkValue}
                  onChange={e => setBulkValue(e.target.value)}
                  className="w-24 h-7 text-xs"
                />
                <Button size="sm" className="h-7 text-xs" onClick={applyBulkValue} disabled={!bulkValue}>
                  Aplicar a seleccionados
                </Button>
              </div>
            )}
          </div>

          {/* Table */}
          <ScrollArea className="flex-1 min-h-0 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selectAll} onCheckedChange={handleSelectAll} />
                  </TableHead>
                  <TableHead className="text-xs">Empleado</TableHead>
                  <TableHead className="text-xs text-right w-28">Actual ($)</TableHead>
                  <TableHead className="text-xs text-right w-32">Nueva tarifa ($)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No se encontraron empleados
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(emp => {
                    const changed = emp.newRate && parseFloat(emp.newRate) !== emp.currentRate;
                    return (
                      <TableRow key={emp.employeeId} className={changed ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={emp.selected}
                            onCheckedChange={() => toggleSelect(emp.employeeId)}
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatPersonName(`${emp.firstName} ${emp.lastName}`)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {emp.currentRate !== null ? (
                            `$${emp.currentRate.toFixed(2)}`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={emp.newRate}
                            onChange={e => updateRate(emp.employeeId, e.target.value)}
                            className="h-7 text-xs text-right font-mono w-28 ml-auto"
                            placeholder="0.00"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Save */}
          <div className="flex justify-between items-center pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Los cambios se guardan en la tarifa individual de cada empleado para el concepto <strong>{conceptName}</strong>.
            </p>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? (
                <>Guardando...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />Guardar cambios</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
