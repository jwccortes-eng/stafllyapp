import { useState } from "react";
import { usePayrollMappings, TARGET_TYPES, MATCH_FIELDS, PayrollMapping } from "@/hooks/usePayrollMappings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Sparkles, RefreshCw, Search, ArrowUpDown, MapPin, Briefcase } from "lucide-react";
import { toast } from "sonner";

export default function PayrollMappings() {
  const { mappings, loading, seedDefaults, addMapping, updateMapping, deleteMapping } = usePayrollMappings();
  const [newPattern, setNewPattern] = useState("");
  const [newTarget, setNewTarget] = useState("hourly");
  const [newMatchField, setNewMatchField] = useState("any");
  const [filter, setFilter] = useState("");

  const filtered = mappings.filter(m =>
    !filter || m.pattern.toLowerCase().includes(filter.toLowerCase()) || m.target_type.toLowerCase().includes(filter.toLowerCase()) || (m.match_field || "").toLowerCase().includes(filter.toLowerCase())
  );

  const handleAdd = async () => {
    if (!newPattern.trim()) { toast.error("Ingresa un patrón"); return; }
    await addMapping(newPattern.trim(), newTarget, newMatchField);
    setNewPattern("");
  };

  const targetLabel = (t: string) => TARGET_TYPES.find(tt => tt.value === t)?.label || t;
  const matchFieldLabel = (f: string) => MATCH_FIELDS.find(mf => mf.value === f)?.label || f;

  const targetColor = (t: string): string => {
    switch (t) {
      case "hourly": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "full_day": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
      case "half_day": return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
      case "ride": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case "bonus": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const matchFieldIcon = (f: string) => {
    if (f === "shift_title") return <Briefcase className="h-3 w-3 mr-1" />;
    if (f === "location_name" || f === "client_name") return <MapPin className="h-3 w-3 mr-1" />;
    return null;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Mapping de Conceptos de Payroll"
        subtitle="Configura cómo se clasifican los conceptos importados de nómina. Ahora incluye matching por turno, ubicación y cliente."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{mappings.length}</p>
          <p className="text-xs text-muted-foreground">Mappings totales</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{mappings.filter(m => m.is_active).length}</p>
          <p className="text-xs text-muted-foreground">Activos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{new Set(mappings.map(m => m.target_type)).size}</p>
          <p className="text-xs text-muted-foreground">Tipos destino</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{mappings.filter(m => m.match_field && m.match_field !== "any").length}</p>
          <p className="text-xs text-muted-foreground">Por turno/ubicación</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{mappings.filter(m => !m.is_active).length}</p>
          <p className="text-xs text-muted-foreground">Desactivados</p>
        </CardContent></Card>
      </div>

      {/* Seed + Add */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Agregar mapping</CardTitle>
          <CardDescription>Patrón buscado en pay_type, notes, concept_name, shift_title, location o cliente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder='Ej: "weekend job", "transport", "paga doble"'
              value={newPattern}
              onChange={e => setNewPattern(e.target.value)}
              className="flex-1"
            />
            <Select value={newMatchField} onValueChange={setNewMatchField}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATCH_FIELDS.map(mf => <SelectItem key={mf.value} value={mf.value}>{mf.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newTarget} onValueChange={setNewTarget}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TARGET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Agregar</Button>
          </div>

          {mappings.length === 0 && !loading && (
            <div className="border rounded-lg p-6 text-center space-y-3">
              <Sparkles className="h-8 w-8 mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">No hay mappings configurados. Carga los valores por defecto para empezar (incluye reglas por turno/ubicación).</p>
              <Button variant="outline" onClick={seedDefaults}><RefreshCw className="h-4 w-4 mr-1" /> Cargar mappings por defecto</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {mappings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4" /> Mappings configurados
              </CardTitle>
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Filtrar..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-8" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patrón</TableHead>
                      <TableHead>Buscar en</TableHead>
                      <TableHead>Tipo destino</TableHead>
                      <TableHead className="text-center">Prioridad</TableHead>
                      <TableHead className="text-center">Activo</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(m => (
                      <TableRow key={m.id} className={!m.is_active ? "opacity-50" : ""}>
                        <TableCell className="font-mono text-sm">{m.pattern}</TableCell>
                        <TableCell>
                          <Select value={m.match_field || "any"} onValueChange={v => updateMapping(m.id, { match_field: v } as any)}>
                            <SelectTrigger className="h-8 w-[160px]">
                              <span className="flex items-center text-xs">
                                {matchFieldIcon(m.match_field || "any")}
                                {matchFieldLabel(m.match_field || "any")}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {MATCH_FIELDS.map(mf => <SelectItem key={mf.value} value={mf.value}>{mf.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={m.target_type} onValueChange={v => updateMapping(m.id, { target_type: v })}>
                            <SelectTrigger className="h-8 w-[140px]">
                              <Badge className={targetColor(m.target_type)}>{targetLabel(m.target_type)}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {TARGET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            value={m.priority}
                            onChange={e => updateMapping(m.id, { priority: Number(e.target.value) })}
                            className="w-20 h-8 text-center mx-auto"
                            min={1} max={999}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={m.is_active} onCheckedChange={v => updateMapping(m.id, { is_active: v })} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{m.notes}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => deleteMapping(m.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
