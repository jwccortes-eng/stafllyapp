/**
 * Smart Service Intake — FASE 5: Diccionario de la empresa.
 *
 * Memoria operativa del tenant: qué términos aprendió Stafly a partir de
 * correcciones humanas confirmadas, con qué evidencia y desde qué fuente.
 *
 * Garantías de superficie:
 *  - sólo lee y edita reglas del diccionario de ESTA empresa;
 *  - no crea servicios, no publica, no asigna, no toca payroll;
 *  - toda edición pasa por el Versioned Write Contract (conflicto explícito).
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Loader2, Search, Undo2 } from "lucide-react";
import { OperationalScreenHeader } from "@/components/stafly-ui/OperationalScreenHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/hooks/useCompany";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import {
  findDictionaryConflicts,
  normalizeDictionaryKey,
  RULE_TYPE_LABEL,
  type DictionaryRule,
} from "@/lib/intake/dictionary";
import { loadTenantDictionary, updateDictionaryRule } from "@/lib/intake/dictionary-store";
import VersionConflictDialog, {
  type VersionConflictInfo,
} from "@/components/data-integrity/VersionConflictDialog";

const FIELD_LABELS: Record<string, string> = {
  resolved_value: "Interpretación",
  active: "Activa",
  notes: "Nota",
  rule_type: "Tipo de término",
};

export default function CompanyDictionary() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "inactive" | "conflicts">("active");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<VersionConflictInfo | null>(null);

  const queryKey = useMemo(
    () => ["intake-dictionary", selectedCompanyId] as const,
    [selectedCompanyId],
  );
  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    enabled: !!selectedCompanyId,
    queryFn: () => loadTenantDictionary(selectedCompanyId!, { includeInactive: true }),
  });

  const conflicts = useMemo(() => findDictionaryConflicts(rules), [rules]);
  const conflictIds = useMemo(
    () => new Set(conflicts.flatMap((c) => c.rules.map((r) => r.id))),
    [conflicts],
  );

  const visible = useMemo(() => {
    const needle = normalizeDictionaryKey(search);
    return rules.filter((r) => {
      if (tab === "active" && !r.active) return false;
      if (tab === "inactive" && r.active) return false;
      if (tab === "conflicts" && !conflictIds.has(r.id)) return false;
      if (!needle) return true;
      return (
        r.inputNormalized.includes(needle) ||
        normalizeDictionaryKey(r.resolvedValue).includes(needle)
      );
    });
  }, [rules, tab, search, conflictIds]);

  const applyPatch = useCallback(
    async (rule: DictionaryRule, patch: Record<string, any>) => {
      if (!selectedCompanyId) return;
      setSavingId(rule.id);
      try {
        const result = await updateDictionaryRule({
          companyId: selectedCompanyId,
          rule,
          patch,
          surface: "company-dictionary",
        });

        if (result.status === "applied") {
          notifySuccess({
            title: "Diccionario actualizado",
            fact: `“${rule.inputValue}” quedó guardado con los cambios.`,
            consequence: "Se aplicará en las próximas lecturas de texto, imagen, PDF y voz.",
          });
          await queryClient.invalidateQueries({ queryKey });
        } else if (result.status === "conflict") {
          setConflict({
            patch,
            serverRow: result.row,
            actualVersion: result.actualVersion,
            expectedVersion: result.expectedVersion,
            updatedAt: result.updatedAt,
          });
        } else if (result.status !== "noop") {
          notifyWarning({
            title: "No guardamos el cambio",
            fact: result.message,
            consequence: "La regla quedó como estaba.",
          });
        }
      } catch (error) {
        notifyError({
          title: "No pudimos actualizar el diccionario",
          fact: "La regla no cambió.",
          consequence: "Puedes reintentar sin riesgo.",
          cause: error,
        });
      } finally {
        setSavingId(null);
      }
    },
    [selectedCompanyId, queryClient, queryKey],
  );

  const reloadAfterConflict = useCallback(async () => {
    setConflict(null);
    setEditing({});
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  if (!selectedCompanyId) {
    return (
      <div className="p-4">
        <OperationalScreenHeader
          title="Diccionario de la empresa"
          context="Selecciona una empresa para ver su memoria operativa."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <OperationalScreenHeader
        title="Diccionario de la empresa"
        context={
          isLoading
            ? "Cargando lo aprendido…"
            : `${rules.filter((r) => r.active).length} términos aprendidos${
                conflicts.length > 0 ? ` · ${conflicts.length} en conflicto` : ""
              }`
        }
      />

      <p className="max-w-2xl text-[13px] text-muted-foreground">
        Aquí vive lo que Stafly aprendió de las correcciones de tu equipo: abreviaciones,
        nombres de lugares mal escritos y formas propias de nombrar los servicios. Sólo se
        aprende cuando una persona lo confirma, y nunca se comparte con otra empresa.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="active">Activos</TabsTrigger>
            <TabsTrigger value="inactive">Desactivados</TabsTrigger>
            <TabsTrigger value="conflicts">
              Conflictos{conflicts.length > 0 ? ` (${conflicts.length})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar término"
            className="h-10 rounded-xl pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando diccionario…
        </div>
      ) : visible.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <BookMarked className="mx-auto mb-3 h-6 w-6 opacity-60" />
            {tab === "conflicts"
              ? "No hay términos en conflicto."
              : "Todavía no hay términos aprendidos. Aparecerán cuando alguien confirme una corrección en la bandeja de servicios."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((rule) => {
            const draft = editing[rule.id] ?? rule.resolvedValue;
            const dirty = draft.trim() !== rule.resolvedValue.trim();
            const inConflict = conflictIds.has(rule.id);
            return (
              <Card key={rule.id} className="rounded-2xl">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{rule.inputValue}</span>
                      <span className="text-muted-foreground">→</span>
                      <Input
                        value={draft}
                        onChange={(e) =>
                          setEditing((prev) => ({ ...prev, [rule.id]: e.target.value }))
                        }
                        className="h-8 w-56 rounded-lg"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="secondary">{RULE_TYPE_LABEL[rule.ruleType]}</Badge>
                      <span>Confianza {Math.round(rule.confidence * 100)}%</span>
                      <span>· Usada {rule.usageCount} veces</span>
                      {rule.learnedFromSource ? (
                        <span>· Aprendida de {rule.learnedFromSource}</span>
                      ) : null}
                      {inConflict ? <Badge variant="destructive">Conflicto</Badge> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {dirty ? (
                      <>
                        <Button
                          size="sm"
                          className="rounded-xl"
                          disabled={savingId === rule.id}
                          onClick={() => applyPatch(rule, { resolved_value: draft.trim() })}
                        >
                          {savingId === rule.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Guardar"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 rounded-xl"
                          onClick={() =>
                            setEditing((prev) => {
                              const next = { ...prev };
                              delete next[rule.id];
                              return next;
                            })
                          }
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {rule.active ? "Activa" : "Desactivada"}
                      </span>
                      <Switch
                        checked={rule.active}
                        disabled={savingId === rule.id}
                        onCheckedChange={(checked) => applyPatch(rule, { active: checked })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <VersionConflictDialog
        open={!!conflict}
        conflict={conflict}
        entityLabel="este término"
        kind="config"
        fieldLabels={FIELD_LABELS}
        busy={!!savingId}
        onReload={reloadAfterConflict}
        onCancel={() => setConflict(null)}
      />
    </div>
  );
}
