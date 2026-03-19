import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserX, AlertTriangle, CheckCircle2, Search, ChevronDown, ChevronRight, Users } from "lucide-react";
import { normalizeText, type EmployeeRecord } from "@/lib/reconciliation-engine";

interface UnmatchedGroup {
  nameRaw: string;
  nameNormalized: string;
  rowCount: number;
  sampleDates: string[];
  sampleLocations: string[];
  suggestedMatches: SuggestedMatch[];
  isAmbiguous: boolean;
  candidates?: any[];
}

interface SuggestedMatch {
  id: string;
  fullName: string;
  isActive: boolean;
  similarity: number;
}

interface Props {
  normalizedRows: any[];
  employees: EmployeeRecord[];
  companyId?: string | null;
  companyName?: string;
  onAssignAlias: (nameRaw: string, employeeId: string) => Promise<void>;
  onReNormalize: () => void;
}

function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const aParts = a.split(/\s+/);
  const bParts = b.split(/\s+/);
  const commonParts = aParts.filter(p => bParts.some(bp => bp === p || (p.length > 2 && bp.startsWith(p)) || (bp.length > 2 && p.startsWith(bp))));
  if (commonParts.length === 0) return 0;
  return commonParts.length / Math.max(aParts.length, bParts.length);
}

function normalizeSearchText(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function UnmatchedResolutionPanel({ normalizedRows, employees, companyId, companyName, onAssignAlias, onReNormalize }: Props) {
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [assigningName, setAssigningName] = useState<string | null>(null);
  const [searchEmp, setSearchEmp] = useState("");
  const [resolvedNames, setResolvedNames] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"unmatched" | "ambiguous">("unmatched");

  const unmatchedRows = normalizedRows.filter(r => !r._is_system && !r.matched_employee_id && !r.has_conflict);
  const ambiguousRows = normalizedRows.filter(r => !r._is_system && r.has_conflict);

  const unmatchedGroups = useMemo(() => {
    const map = new Map<string, UnmatchedGroup>();
    for (const row of unmatchedRows) {
      const key = normalizeText(row.employee_name_raw);
      if (!key) continue;
      if (!map.has(key)) {
        const norm = key;
        const suggestions: SuggestedMatch[] = employees
          .map(e => {
            const empNorm = normalizeText(`${e.first_name} ${e.last_name}`);
            const sim = computeSimilarity(norm, empNorm);
            return { id: e.id, fullName: `${e.first_name} ${e.last_name}`, isActive: e.is_active !== false, similarity: sim };
          })
          .filter(s => s.similarity > 0.2)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);

        map.set(key, {
          nameRaw: row.employee_name_raw,
          nameNormalized: norm,
          rowCount: 0,
          sampleDates: [],
          sampleLocations: [],
          suggestedMatches: suggestions,
          isAmbiguous: false,
        });
      }
      const g = map.get(key)!;
      g.rowCount++;
      if (row.work_date && g.sampleDates.length < 3 && !g.sampleDates.includes(row.work_date)) g.sampleDates.push(row.work_date);
      if (row.location_name && g.sampleLocations.length < 2 && !g.sampleLocations.includes(row.location_name)) g.sampleLocations.push(row.location_name);
    }
    return Array.from(map.values()).sort((a, b) => b.rowCount - a.rowCount);
  }, [unmatchedRows, employees]);

  const ambiguousGroups = useMemo(() => {
    const map = new Map<string, UnmatchedGroup>();
    for (const row of ambiguousRows) {
      const key = normalizeText(row.employee_name_raw);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          nameRaw: row.employee_name_raw,
          nameNormalized: key,
          rowCount: 0,
          sampleDates: [],
          sampleLocations: [],
          suggestedMatches: [],
          isAmbiguous: true,
          candidates: row.conflict_details?.candidates || [],
        });
      }
      const g = map.get(key)!;
      g.rowCount++;
      if (row.work_date && g.sampleDates.length < 3 && !g.sampleDates.includes(row.work_date)) g.sampleDates.push(row.work_date);
    }
    return Array.from(map.values()).sort((a, b) => b.rowCount - a.rowCount);
  }, [ambiguousRows]);

  const activeGroups = tab === "unmatched" ? unmatchedGroups : ambiguousGroups;
  const pendingUnmatched = unmatchedGroups.filter(g => !resolvedNames.has(g.nameNormalized)).length;
  const pendingAmbiguous = ambiguousGroups.filter(g => !resolvedNames.has(g.nameNormalized)).length;

  const handleBulkAssign = async (nameRaw: string, nameNorm: string, employeeId: string) => {
    await onAssignAlias(nameRaw, employeeId);
    setResolvedNames(prev => new Set([...prev, nameNorm]));
    setAssigningName(null);
    setSearchEmp("");
  };

  const empList = useMemo(() => {
    const norm = normalizeText(searchEmp);
    const all = employees
      .map(e => ({ ...e, fullName: `${e.first_name} ${e.last_name}`, norm: normalizeText(`${e.first_name} ${e.last_name}`) }));
    if (!norm) return all.slice(0, 30);
    // Match each search token independently for better partial matching
    const tokens = norm.split(/\s+/).filter(Boolean);
    return all
      .filter(e => tokens.every(t => e.norm.includes(t)))
      .slice(0, 30);
  }, [employees, searchEmp]);

  const empCounts = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.is_active !== false).length,
    inactive: employees.filter(e => e.is_active === false).length,
  }), [employees]);

  if (unmatchedRows.length === 0 && ambiguousRows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserX className="h-5 w-5" /> Cola de Resolución de Empleados
        </CardTitle>
        <CardDescription>
          Resuelve nombres no emparejados y ambiguos. Las asignaciones se guardan como alias para futuros imports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-2">
          <Badge
            variant={tab === "unmatched" ? "destructive" : "outline"}
            className="cursor-pointer gap-1"
            onClick={() => setTab("unmatched")}
          >
            <UserX className="h-3 w-3" /> Sin match ({pendingUnmatched} nombres · {unmatchedRows.length} filas)
          </Badge>
          {ambiguousRows.length > 0 && (
            <Badge
              variant={tab === "ambiguous" ? "default" : "outline"}
              className="cursor-pointer gap-1"
              onClick={() => setTab("ambiguous")}
            >
              <AlertTriangle className="h-3 w-3" /> Ambiguos ({pendingAmbiguous} nombres · {ambiguousRows.length} filas)
            </Badge>
          )}
        </div>

        {resolvedNames.size > 0 && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {resolvedNames.size} nombre(s) resuelto(s) como alias.{" "}
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onReNormalize}>
                Re-normalizar para aplicar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Summary table */}
        <div className="border rounded-md max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Nombre Importado</TableHead>
                <TableHead className="text-center">Filas</TableHead>
                <TableHead>Fechas</TableHead>
                <TableHead>{tab === "ambiguous" ? "Candidatos" : "Sugerencias"}</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeGroups.map(group => {
                const isResolved = resolvedNames.has(group.nameNormalized);
                const isExpanded = expandedName === group.nameNormalized;
                const isAssigning = assigningName === group.nameNormalized;
                const matchList = group.isAmbiguous ? (group.candidates || []) : group.suggestedMatches;

                return (
                  <TableRow
                    key={group.nameNormalized}
                    className={isResolved ? "opacity-40" : ""}
                  >
                    <TableCell className="pr-0">
                      <button onClick={() => setExpandedName(isExpanded ? null : group.nameNormalized)} className="text-muted-foreground hover:text-foreground">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{group.nameRaw}</div>
                      {isExpanded && group.sampleLocations.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">📍 {group.sampleLocations.join(", ")}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs">{group.rowCount}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {group.sampleDates.join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      {isExpanded ? (
                        <div className="space-y-1">
                          {matchList.length === 0 && (
                            <span className="text-xs text-muted-foreground">Sin sugerencias</span>
                          )}
                          {matchList.map((m: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-1.5 text-xs">
                              <Badge variant={m.isActive !== false && m.is_active !== false ? "default" : "secondary"} className="text-[10px] px-1">
                                {m.isActive !== false && m.is_active !== false ? "Act" : "Inact"}
                              </Badge>
                              <span className="truncate max-w-28">{m.fullName || m.name}</span>
                              <span className="text-muted-foreground">
                                {m.similarity ? `${Math.round(m.similarity * 100)}%` : m.confidence ? `${Math.round(m.confidence * 100)}%` : ""}
                              </span>
                              {!isResolved && (
                                <Button
                                  variant="ghost" size="sm" className="h-5 text-[10px] px-1.5"
                                  onClick={() => handleBulkAssign(group.nameRaw, group.nameNormalized, m.id)}
                                >
                                  ✓ Asignar
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {matchList.length > 0 ? `${matchList.length} candidato(s)` : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isResolved ? (
                        <Badge className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300">✓ Resuelto</Badge>
                      ) : group.isAmbiguous ? (
                        <Badge variant="secondary" className="text-xs">⚠ Ambiguo</Badge>
                      ) : group.suggestedMatches.length > 0 ? (
                        <Badge variant="secondary" className="text-xs">Sugerido</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">Sin match</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isResolved && (
                        <div>
                          {isAssigning ? (
                            <div className="min-w-56 space-y-1">
                              <div className="text-[10px] text-muted-foreground mb-1">
                                Roster: {empCounts.total} ({empCounts.active} act / {empCounts.inactive} inact)
                              </div>
                              <div className="flex items-center gap-1">
                                <Search className="h-3 w-3 text-muted-foreground" />
                                <input
                                  className="w-full text-xs border rounded px-2 py-1 bg-background"
                                  placeholder="Buscar empleado..."
                                  value={searchEmp}
                                  onChange={e => setSearchEmp(e.target.value)}
                                  autoFocus
                                />
                              </div>
                              {empCounts.total === 0 && (
                                <div className="text-xs text-destructive font-medium px-1">⚠ No hay empleados cargados para esta empresa</div>
                              )}
                              <div className="max-h-48 overflow-auto space-y-0.5 border rounded p-1">
                                {empList.map(e => (
                                  <button
                                    key={e.id}
                                    className="flex items-center gap-1.5 w-full text-left text-xs px-2 py-1 rounded hover:bg-accent"
                                    onClick={() => handleBulkAssign(group.nameRaw, group.nameNormalized, e.id)}
                                  >
                                    <Badge variant={e.is_active !== false ? "default" : "outline"} className="text-[10px] px-1 shrink-0">
                                      {e.is_active !== false ? "A" : "I"}
                                    </Badge>
                                    <span className="truncate">{e.fullName}</span>
                                  </button>
                                ))}
                                {empList.length === 0 && empCounts.total > 0 && <span className="text-xs text-muted-foreground px-2">Sin resultados para "{searchEmp}"</span>}
                              </div>
                              <button className="text-xs text-muted-foreground underline" onClick={() => { setAssigningName(null); setSearchEmp(""); }}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setAssigningName(group.nameNormalized); setSearchEmp(""); }}>
                              <Users className="h-3 w-3 mr-1" /> Asignar ({group.rowCount})
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {activeGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    {tab === "unmatched" ? "✓ Todos los nombres han sido resueltos" : "✓ No hay filas ambiguas"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
