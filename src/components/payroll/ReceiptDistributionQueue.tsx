/**
 * ReceiptDistributionQueue — cola operativa de distribución de recibos.
 *
 * Proyección sobre sistemas canónicos (nómina aprobada, recibo, persona,
 * cuenta, invitación). NO crea motor de nómina, identidad, cuentas,
 * invitaciones, recibos ni mensajería. La publicación real siempre pasa por
 * `bulk_publish_pay_statements` → `publish_pay_statement` (ruta canónica).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  IdCard,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaflyStatusBadge } from "@/components/stafly-ui";
import { EmployeeInviteDialog } from "@/components/employee/EmployeeInviteDialog";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useEmployeeInvitations } from "@/hooks/useEmployeeInvitations";
import {
  bulkMoney,
  bulkPublish,
  fetchBulkPreview,
  type BulkPublishResult,
} from "@/lib/payroll/bulk-publish";
import {
  DISTRIBUTION_COPY,
  DISTRIBUTION_FILTERS,
  buildDistributionSignal,
  deriveDistributionRow,
  distributionRoutes,
  matchesDistributionFilter,
  summarizeDistribution,
  type DistributionFilterKey,
  type DistributionRow,
} from "@/lib/payroll/receipt-distribution";
import {
  assertUniqueReceiptCandidates,
  resolveReceiptCandidacy,
} from "@/lib/payroll/receipt-candidates";
import type { PersonRecord } from "@/lib/identity/canonical-person";

interface Props {
  periodId: string;
  periodLabel?: string | null;
}

interface EmployeeLite {
  id: string;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  user_id: string | null;
  is_active: boolean | null;
  phone_number: string | null;
  email: string | null;
  employer_identification: string | null;
  merged_into_employee_id: string | null;
  avatar_url: string | null;
}

type FilterKey = DistributionFilterKey["key"];

export default function ReceiptDistributionQueue({ periodId, periodLabel }: Props) {
  const { selectedCompanyId } = useCompany();
  const { invitations } = useEmployeeInvitations(selectedCompanyId ?? null);

  const [rows, setRows] = useState<DistributionRow[]>([]);
  const [employees, setEmployees] = useState<Record<string, EmployeeLite>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [result, setResult] = useState<BulkPublishResult | null>(null);
  const [inviteFor, setInviteFor] = useState<EmployeeLite | null>(null);

  const load = useCallback(async () => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    try {
      const preview = await fetchBulkPreview(periodId);
      const ids = preview.map((p) => p.employee_id);
      let emps: Record<string, EmployeeLite> = {};
      if (ids.length) {
        const { data } = await supabase
          .from("employees")
          .select(
            "id, company_id, first_name, last_name, user_id, is_active, phone_number, email, employer_identification, merged_into_employee_id, avatar_url",
          )
          .in("id", ids);
        for (const e of (data ?? []) as EmployeeLite[]) emps[e.id] = e;
      }
      setEmployees(emps);
      // P0.4 — candidatura canónica: una persona + empresa + periodo = un recibo.
      const candidacy = resolveReceiptCandidacy(
        preview,
        emps as unknown as Record<string, PersonRecord | undefined>,
      );
      setRows(
        preview.map((p) =>
          deriveDistributionRow(p, {
            employee: emps[p.employee_id],
            invitation: invitations[p.employee_id],
            candidacy: candidacy[p.employee_id] ?? null,
          }),
        ),
      );
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido.");
      notifyError({
        title: "No se pudo cargar la distribución de recibos",
        fact: e?.message ?? "Error desconocido.",
        consequence: "No se publicó ni cambió ningún recibo.",
        cause: e,
      });
    } finally {
      setLoading(false);
    }
  }, [periodId, invitations]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const summary = useMemo(() => summarizeDistribution(rows), [rows]);
  const signal = useMemo(
    () => buildDistributionSignal(periodId, summary),
    [periodId, summary],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.workerName} ${r.employerIdentification ?? ""}`.toLowerCase().includes(q))
        return false;
      return matchesDistributionFilter(r, filter);
    });
  }, [rows, search, filter]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.employeeId) && r.eligible),
    [rows, selected],
  );
  const selectedTotal = selectedRows.reduce((s, r) => s + r.amount, 0);
  const selectedNoAccess = selectedRows.filter((r) => !r.portalAccess).length;
  /** Aserción de unicidad: nunca dos recibos de la misma persona en el periodo. */
  const duplicateConflicts = useMemo(
    () => assertUniqueReceiptCandidates(selectedRows),
    [selectedRows],
  );

  const toggle = (row: DistributionRow) => {
    if (!row.eligible) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.employeeId)) next.delete(row.employeeId);
      else next.add(row.employeeId);
      return next;
    });
  };

  const selectEligible = () =>
    // `eligible` ya exige candidato canónico: excluye auxiliares, identidad,
    // publicados y bloqueados.
    setSelected(new Set(visible.filter((r) => r.eligible).map((r) => r.employeeId)));

  const openPreview = () => {
    if (duplicateConflicts.length > 0) {
      notifyWarning({
        title: "Hay más de un recibo para la misma persona",
        fact: `${duplicateConflicts.length} caso(s) con dos candidatos en este periodo.`,
        consequence: "No se abrió la publicación: revisa la identidad antes de continuar.",
      });
      return;
    }
    if (selectedRows.length === 0) {
      notifyWarning({
        title: "No hay recibos seleccionados",
        fact: "Selecciona al menos un trabajador elegible.",
        consequence: "No se publicó nada.",
      });
      return;
    }
    setConfirmChecked(false);
    setPreviewOpen(true);
  };

  const runPublish = async () => {
    if (!confirmChecked) return;
    setWorking(true);
    try {
      const res = await bulkPublish(
        periodId,
        selectedRows.map((r) => r.employeeId),
      );
      setResult(res);
      setPreviewOpen(false);
      if (res.failed_count > 0 || res.blocked_count > 0) {
        notifyWarning({
          title: `${res.published_count} publicados, ${res.failed_count + res.blocked_count} sin publicar`,
          fact: `Total congelado ${bulkMoney(res.published_total)}. Revisa el detalle por trabajador.`,
          consequence: "Los recibos correctos quedaron publicados; el resto no cambió.",
        });
      } else {
        notifySuccess({
          title: `${res.published_count} recibo(s) publicado(s)`,
          fact: `Total congelado: ${bulkMoney(res.published_total)}. Omitidos: ${res.skipped_count}.`,
          consequence: "Los trabajadores con cuenta activa ya los ven en Mis pagos.",
        });
      }
      await load();
    } catch (e: any) {
      notifyError({
        title: "No se publicaron los recibos",
        fact: e?.message ?? "Error desconocido.",
        consequence: "Ningún recibo cambió de estado.",
        cause: e,
      });
    } finally {
      setWorking(false);
    }
  };

  const kpis: { key: FilterKey; label: string; value: string }[] = [
    { key: "all", label: "Aprobados", value: String(summary.approved) },
    { key: "ready", label: "Listos para publicar", value: String(summary.ready) },
    { key: "blocked", label: "Bloqueados", value: String(summary.blocked) },
    { key: "no_account", label: "Sin acceso", value: String(summary.noAccount) },
    { key: "published", label: "Publicados", value: String(summary.published) },
    { key: "published_no_access", label: "Publicados sin acceso", value: String(summary.publishedNoAccess) },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Distribución de recibos
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {summary.published} / {summary.approved} publicados · {summary.visible} visibles ·{" "}
          {summary.publishedNoAccess} sin acceso · {summary.blocked} bloqueados
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando distribución…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este periodo todavía no tiene nómina aprobada para distribuir.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              {kpis.map((k) => (
                <button
                  key={k.label}
                  type="button"
                  onClick={() => setFilter(k.key)}
                  className={`rounded-md border p-2 text-left transition-colors ${
                    filter === k.key ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className="font-mono text-sm font-semibold">{k.value}</p>
                </button>
              ))}
            </div>

            {signal && (
              <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
                {signal.messages.join(" · ")}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o Employer ID"
                className="h-9 w-full sm:w-64"
              />
              <div className="flex flex-wrap gap-1">
                {DISTRIBUTION_FILTERS.map((f) => (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={filter === f.key ? "default" : "outline"}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="secondary" onClick={selectEligible}>
                Seleccionar elegibles
              </Button>
            </div>

            {/* Escritorio: tabla operativa */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Trabajador</TableHead>
                    <TableHead className="text-right">Total aprobado</TableHead>
                    <TableHead>Estado del recibo</TableHead>
                    <TableHead>Cuenta/acceso</TableHead>
                    <TableHead>Bloqueo</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.employeeId}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(r.employeeId)}
                          disabled={!r.eligible}
                          onCheckedChange={() => toggle(r)}
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          to={distributionRoutes.worker(r.employeeId)}
                          className="text-sm font-medium hover:underline"
                        >
                          {r.workerName}
                        </Link>
                        {r.employerIdentification && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ID {r.employerIdentification}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {bulkMoney(r.amount)}
                      </TableCell>
                      <TableCell>
                        <StaflyStatusBadge tone={DISTRIBUTION_COPY[r.status].tone} dot>
                          {DISTRIBUTION_COPY[r.status].label}
                        </StaflyStatusBadge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.portalLabel}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                        {r.blocker ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowAction
                          row={r}
                          periodId={periodId}
                          onInvite={() => setInviteFor(employees[r.employeeId] ?? null)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {visible.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">Sin resultados para este filtro.</p>
              )}
            </div>

            {/* Móvil: cards compactas, sin tabla ni gráficos */}
            <div className="space-y-2 md:hidden">
              {visible.map((r) => (
                <div key={r.employeeId} className="rounded-xl border p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(r.employeeId)}
                      disabled={!r.eligible}
                      onCheckedChange={() => toggle(r)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.workerName}</p>
                      <p className="font-mono text-sm">{bulkMoney(r.amount)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StaflyStatusBadge tone={DISTRIBUTION_COPY[r.status].tone} dot>
                          {DISTRIBUTION_COPY[r.status].label}
                        </StaflyStatusBadge>
                        <StaflyStatusBadge tone={r.portalAccess ? "success" : "warning"}>
                          {r.portalLabel}
                        </StaflyStatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.blocker ?? DISTRIBUTION_COPY[r.status].help}
                      </p>
                      <div className="mt-2">
                        <RowAction
                          row={r}
                          periodId={periodId}
                          onInvite={() => setInviteFor(employees[r.employeeId] ?? null)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin resultados para este filtro.</p>
              )}
            </div>

            <div className="sticky bottom-0 -mx-6 mt-2 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-6 py-3 backdrop-blur">
              <div className="text-sm">
                <span className="font-semibold">{selectedRows.length}</span> seleccionado(s) ·{" "}
                <span className="font-mono font-semibold">{bulkMoney(selectedTotal)}</span>
              </div>
              <Button size="sm" onClick={openPreview} disabled={working || selectedRows.length === 0}>
                {working ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Preparar publicación
              </Button>
            </div>

            {result && (
              <div className="rounded-md border p-3 text-sm">
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Resultado de la publicación
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li>
                    Publicados: {result.published_count} ·{" "}
                    <span className="font-mono">{bulkMoney(result.published_total)}</span>
                  </li>
                  <li>Omitidos (ya publicados): {result.skipped_count}</li>
                  <li>Bloqueados: {result.blocked_count}</li>
                  <li>Fallidos: {result.failed_count}</li>
                </ul>
                {[...result.blocked, ...result.failed].length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-destructive">
                    {[...result.blocked, ...result.failed].map((b) => (
                      <li key={b.employee_id}>
                        {rows.find((r) => r.employeeId === b.employee_id)?.workerName ??
                          b.employee_id}
                        : {b.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Previsualización + confirmación explícita */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Vas a publicar {selectedRows.length} recibo(s)
              {periodLabel ? ` del período ${periodLabel}` : ""}
            </DialogTitle>
            <DialogDescription>
              {summary.published} ya están publicados. {summary.blocked} están bloqueados.{" "}
              {summary.noAccount} trabajadores no tienen acceso a Stafly. Los trabajadores elegibles
              verán el total congelado publicado. Esta acción no envía notificaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total a congelar</p>
              <p className="font-mono text-2xl font-semibold">{bulkMoney(selectedTotal)}</p>
            </div>
            <ul className="space-y-1 text-muted-foreground">
              <li>Elegibles seleccionados: {selectedRows.length}</li>
              <li>Ya publicados (se omitirán): {summary.published}</li>
              <li>Excluidos — ajustes pendientes: {summary.blocked}</li>
              <li>Revisión de identidad: {summary.identity}</li>
              <li>Sin acceso a Stafly: {summary.noAccount}</li>
            </ul>
            {selectedNoAccess > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {selectedNoAccess} trabajador(es) sin acceso a Stafly: la publicación sí está
                permitida y el recibo se vuelve visible en cuanto activen su cuenta. No se crean
                cuentas ni se envían invitaciones aquí.
              </p>
            )}
            <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-xs">
              {selectedRows.map((r) => (
                <div key={r.employeeId} className="flex justify-between gap-2 py-0.5">
                  <span className="truncate">{r.workerName}</span>
                  <span className="font-mono">{bulkMoney(r.amount)}</span>
                </div>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirmChecked}
                onCheckedChange={(v) => setConfirmChecked(v === true)}
              />
              <span>Confirmo que revisé los totales y los trabajadores incluidos.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={working}>
              Cancelar
            </Button>
            <Button onClick={runPublish} disabled={!confirmChecked || working}>
              {working ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Publicar {selectedRows.length} recibos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {inviteFor && (
        <EmployeeInviteDialog
          open={!!inviteFor}
          onOpenChange={(o) => !o && setInviteFor(null)}
          employee={inviteFor as unknown as Record<string, any>}
        />
      )}
    </Card>
  );
}

function RowAction({
  row,
  periodId,
  onInvite,
}: {
  row: DistributionRow;
  periodId: string;
  onInvite: () => void;
}) {
  if (row.status === "BLOCKED_PENDING_ADJUSTMENT" || row.status === "BLOCKED_PAYROLL_REVIEW") {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link to={distributionRoutes.adjustments(row.employeeId, periodId)}>Revisar ajustes</Link>
      </Button>
    );
  }
  if (row.status === "IDENTITY_REVIEW") {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link to={distributionRoutes.identity(row.employeeId)}>
          <IdCard className="mr-1 h-3.5 w-3.5" /> Revisar identidad
        </Link>
      </Button>
    );
  }
  if (row.status === "NEEDS_ACCOUNT" || row.status === "PUBLISHED_NO_ACCESS") {
    return (
      <Button size="sm" variant="outline" onClick={onInvite}>
        <UserPlus className="mr-1 h-3.5 w-3.5" />
        {row.hasPendingInvitation ? "Invitación pendiente" : "Invitar a activar acceso"}
      </Button>
    );
  }
  if (row.published) {
    return (
      <Button size="sm" variant="ghost" asChild>
        <Link to={distributionRoutes.receipt(row.employeeId, periodId)}>Ver recibo</Link>
      </Button>
    );
  }
  return (
    <Button size="sm" variant="ghost" asChild>
      <Link to={distributionRoutes.receipt(row.employeeId, periodId)}>Ver detalle</Link>
    </Button>
  );
}
