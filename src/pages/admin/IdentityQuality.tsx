/**
 * P0 — WORKER IDENTITY QUALITY / PASSPORT PHASE 1
 * Pantalla "Calidad de identidad". SOLO LECTURA.
 *
 * Muestra fragmentación y posibles duplicados para revisión humana. No hay
 * botón de fusionar en esta fase: la única acción es [Revisar].
 */
import { useMemo, useState } from "react";
import { OperationalWorkspace, type WorkspaceMetric } from "@/components/stafly-ui/OperationalWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, Users, IdCard, History, CheckCircle2 } from "lucide-react";
import {
  useIdentityQuality,
  IDENTITY_DECISION_LABELS,
  type IdentityReviewDecision,
  type IdentityReviewRow,
} from "@/hooks/useIdentityQuality";
import { IdentityGroupReviewDialog } from "@/components/identity/IdentityGroupReviewDialog";
import {
  IDENTITY_VERDICT_LABELS,
  maskEmail,
  maskExternalId,
  maskPhone,
  type IdentityGroup,
} from "@/lib/identity/person-truth";
import {
  ASSIGNMENT_RISK_LABELS,
  ASSIGNMENT_RISK_TONE,
} from "@/lib/identity/assignment-risk";
import { EntityCard } from "@/components/entities/EntityCard";
import { buildWorkerEntityView, type WorkerEntityInput } from "@/lib/entities/entity-presenters";

const RISK_VARIANT: Record<IdentityGroup["risk"], "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function GroupCard({
  group,
  review,
  onReview,
}: {
  group: IdentityGroup;
  review?: IdentityReviewRow;
  onReview: (g: IdentityGroup) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{group.displayName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{group.reason}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant={RISK_VARIANT[group.risk]}>
            {IDENTITY_VERDICT_LABELS[group.verdict]}
          </Badge>
          {review && (
            <Badge variant="outline">
              {IDENTITY_DECISION_LABELS[review.decision as IdentityReviewDecision] ??
                review.decision}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => onReview(group)}>
            {review ? "Ver revisión" : "Revisar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {group.signals.map((s) => (
            <Badge key={s.key} variant="outline" className="font-normal">
              {s.label}
            </Badge>
          ))}
        </div>

        {group.fragmentation.length > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {group.fragmentation.map((f) => (
              <li key={f.key}>• {f.label}</li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {group.records.map((r) => {
            const isPrimary = group.primary?.candidateId === r.id;
            const view = buildWorkerEntityView(
              r as unknown as WorkerEntityInput,
              { identityRisk: !isPrimary, assignedToday: isPrimary },
              [r.first_name, r.last_name].filter(Boolean).join(" ") || "Sin nombre",
            );
            return (
              <EntityCard
                key={r.id}
                kind="worker"
                name={view.name}
                reference={view.reference}
                status={isPrimary ? "assigned" : view.status}
                statusLabel={isPrimary ? "Candidato principal" : view.statusLabel}
                primaryDetail={`${maskPhone(r.phone_number)} · ${maskEmail(r.email)}`}
                badges={[
                  ...(isPrimary
                    ? [{ key: "primary", label: "Candidato principal", tone: "info" as const }]
                    : []),
                  { key: "asg", label: `Servicios: ${r.assignments_count ?? 0}`, tone: "info" as const },
                  { key: "doc", label: `Documentos: ${r.documents_count ?? 0}`, tone: "info" as const },
                ]}
                note={maskExternalId(r.connecteam_employee_id)}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}


export default function IdentityQuality() {
  const { model, loading, hasCompany, recordDecision } = useIdentityQuality();
  const [activeGroup, setActiveGroup] = useState<IdentityGroup | null>(null);
  const [tab, setTab] = useState("duplicates");

  const duplicateGroups = useMemo(
    () =>
      model?.openGroups.filter(
        (g) => g.verdict === "EXACT_MATCH" || g.verdict === "PROBABLE_DUPLICATE",
      ) ?? [],
    [model],
  );
  const reviewGroups = useMemo(
    () =>
      model?.openGroups.filter(
        (g) => g.verdict === "POSSIBLE_DUPLICATE" || g.verdict === "AMBIGUOUS",
      ) ?? [],
    [model],
  );

  const renderGroup = (g: IdentityGroup) => (
    <GroupCard
      key={g.key}
      group={g}
      review={model?.reviewByGroup[g.key]}
      onReview={setActiveGroup}
    />
  );

  /* P0 — Operational First Layout: métricas como chips, aviso administrativo
     colapsable y pestañas siempre visibles. Sin cambios de lógica. */
  const metricChips: WorkspaceMetric[] = model
    ? [
        { label: "registros", value: model.totals.total },
        { label: "asignables", value: model.totals.assignable, tone: "primary" as const },
        { label: "con portal", value: model.totals.withPortal },
        { label: "históricos", value: model.totals.historical },
        { label: "dup. probables", value: model.totals.probableGroups, tone: model.totals.probableGroups > 0 ? ("warning" as const) : undefined },
        { label: "dup. posibles", value: model.totals.possibleGroups },
        { label: "revisados", value: model.totals.reviewedGroups, tone: "success" as const },
        { label: "asignaciones sospechosas", value: model.totals.suspiciousAssignments, tone: model.totals.suspiciousAssignments > 0 ? ("critical" as const) : undefined },
      ]
    : [];

  return (
    <OperationalWorkspace
      title="Calidad de identidad"
      metrics={metricChips}
      adminTitle="Resumen administrativo"
      adminHint="Alcance y garantías de esta pantalla"
      admin={
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Esta pantalla no fusiona registros ni mueve documentos, horas, pagos o
            accesos. La consolidación se planifica en seco, con evidencia y bloqueos
            explícitos.
          </AlertDescription>
        </Alert>
      }
      tabs={
        model ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex w-full flex-wrap justify-start h-auto">
              <TabsTrigger value="duplicates">
                <Users className="mr-1.5 h-4 w-4" />
                Posibles duplicados ({duplicateGroups.length})
              </TabsTrigger>
              <TabsTrigger value="review">Requieren criterio ({reviewGroups.length})</TabsTrigger>
              <TabsTrigger value="portal">
                Portal inconsistente ({model.portalInconsistent.length})
              </TabsTrigger>
              <TabsTrigger value="reviewed">
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Revisados ({model.reviewedGroups.length})
              </TabsTrigger>
              <TabsTrigger value="identifier">
                <IdCard className="mr-1.5 h-4 w-4" />
                Sin identificador ({model.withoutStrongIdentifier.length})
              </TabsTrigger>
              <TabsTrigger value="assignments">
                <History className="mr-1.5 h-4 w-4" />
                Asignaciones ({model.totals.suspiciousAssignments + model.totals.highRiskAssignments})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : undefined
      }
    >
      {!hasCompany && (
        <Alert>
          <AlertDescription>
            Selecciona una empresa para revisar la calidad de identidad de su equipo.
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {model && (
        <>
          <Tabs value={tab} onValueChange={setTab}>


            <TabsContent value="duplicates" className="mt-4 space-y-3">
              {duplicateGroups.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay grupos pendientes con evidencia fuerte de duplicado.
                </p>
              )}
              {duplicateGroups.map(renderGroup)}
            </TabsContent>

            <TabsContent value="review" className="mt-4 space-y-3">
              {reviewGroups.map(renderGroup)}
            </TabsContent>

            <TabsContent value="portal" className="mt-4 space-y-3">
              {model.portalInconsistent.map(renderGroup)}
            </TabsContent>

            <TabsContent value="reviewed" className="mt-4 space-y-3">
              {model.reviewedGroups.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay decisiones registradas.
                </p>
              )}
              {model.reviewedGroups.map(renderGroup)}
            </TabsContent>


            <TabsContent value="identifier" className="mt-4 space-y-2">
              {model.withoutStrongIdentifier.slice(0, 200).map((r) => (
                <div key={r.id} className="rounded-lg border p-3 text-sm">
                  <span className="font-medium">
                    {[r.first_name, r.last_name].filter(Boolean).join(" ") || "Sin nombre"}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    Sin teléfono, email ni ID externo. No se puede confirmar identidad.
                  </span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="assignments" className="mt-4 space-y-2">
              {model.assignmentAudit
                .filter((a) => a.verdict !== "CONFIRMED_OK")
                .slice(0, 300)
                .map((a) => (
                  <div key={a.employeeId} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.displayName}</span>
                      <Badge
                        variant={
                          ASSIGNMENT_RISK_TONE[a.verdict] === "critical"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {ASSIGNMENT_RISK_LABELS[a.verdict]}
                      </Badge>
                      <span className="text-muted-foreground">
                        {a.assignmentsCount} servicios
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{a.reason}</p>
                  </div>
                ))}
            </TabsContent>
          </Tabs>

          <IdentityGroupReviewDialog
            group={activeGroup}
            evidence={model.evidence}
            open={!!activeGroup}
            onOpenChange={(o) => !o && setActiveGroup(null)}
            onDecision={recordDecision}
          />
        </>
      )}
    </OperationalWorkspace>

  );
}
