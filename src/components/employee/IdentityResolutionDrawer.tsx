/**
 * IdentityResolutionDrawer — Phase 2B.
 *
 * Manual, same-company resolution surface for placeholder / pending-identity
 * workers. Presents context (portal access, user_id presence, assignments +
 * time_entries counts, payroll risk warning) and safe actions:
 *   • Add note
 *   • Mark verified
 *   • Mark rejected / invalid
 *   • Keep unresolved (refresh note)
 *   • Link → existing same-company employee (no history moved)
 *   • Merge  → existing same-company employee via merge_employees RPC
 *
 * All writes go through useIdentityResolution. Cross-tenant is prevented
 * both here and by the DB trigger + RPC. No portal access, payroll, or
 * time_entries writes happen from this component.
 */
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useIdentityResolution } from "@/hooks/useIdentityResolution";
import { IdentityBadges } from "@/components/employee/IdentityBadges";
import { ShieldAlert, KeyRound, Link2, GitMerge, CheckCircle2, XCircle, Clock, Search } from "lucide-react";

interface EmployeeLike {
  id: string;
  company_id: string;
  first_name?: string | null;
  last_name?: string | null;
  user_id?: string | null;
  is_active?: boolean | null;
  worker_type?: string | null;
  identity_status?: string | null;
  requires_identity_resolution?: boolean | null;
  payroll_approval_blocked?: boolean | null;
  original_placeholder_name?: string | null;
  identity_source?: string | null;
  identity_notes?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: EmployeeLike | null;
  companyName?: string | null;
  /** Same-company roster used for Link/Merge search. Parent already scopes. */
  companyEmployees: EmployeeLike[];
  onResolved?: () => void;
}

type ConfirmKind = "verify" | "reject" | "link" | "merge" | null;

export default function IdentityResolutionDrawer({
  open,
  onOpenChange,
  employee,
  companyName,
  companyEmployees,
  onResolved,
}: Props) {
  const {
    pending,
    markVerified,
    markRejected,
    keepUnresolved,
    addNote,
    linkToEmployee,
    mergeIntoEmployee,
  } = useIdentityResolution();

  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<EmployeeLike | null>(null);
  const [mode, setMode] = useState<"link" | "merge">("link");
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [confirmMasterName, setConfirmMasterName] = useState("");

  const [portalAccess, setPortalAccess] = useState<boolean | null>(null);
  const [assignmentCount, setAssignmentCount] = useState<number | null>(null);
  const [timeEntryCount, setTimeEntryCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setNote(""); setSearch(""); setTarget(null); setConfirm(null); setConfirmMasterName("");
      setPortalAccess(null); setAssignmentCount(null); setTimeEntryCount(null);
    }
  }, [open]);

  useEffect(() => {
    let cancel = false;
    if (!open || !employee) return;
    (async () => {
      try {
        const [{ data: emp }, { count: aCount }, { count: teCount }] = await Promise.all([
          supabase.from("employees").select("portal_access_enabled" as any).eq("id", employee.id).maybeSingle() as any,
          supabase.from("shift_assignments").select("id", { count: "exact", head: true }).eq("employee_id", employee.id),
          supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("employee_id", employee.id),
        ]);
        if (cancel) return;
        setPortalAccess(emp?.portal_access_enabled ?? null);
        setAssignmentCount(aCount ?? 0);
        setTimeEntryCount(teCount ?? 0);
      } catch { /* non-fatal — drawer still works */ }
    })();
    return () => { cancel = true; };
  }, [open, employee?.id]);

  const displayName = employee ? `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "(sin nombre)" : "";
  const hasPortalHistory = portalAccess === true || !!employee?.user_id || (timeEntryCount ?? 0) > 0;

  const targets = useMemo(() => {
    if (!employee) return [] as EmployeeLike[];
    const q = search.trim().toLowerCase();
    return companyEmployees
      .filter((e) => e.id !== employee.id && e.company_id === employee.company_id)
      // Never allow linking/merging INTO another unresolved placeholder.
      .filter((e) =>
        (e.identity_status ?? "verified") === "verified" || (e.worker_type ?? "real_employee") === "real_employee",
      )
      .filter((e) => {
        if (!q) return true;
        const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.toLowerCase();
        return name.includes(q);
      })
      .slice(0, 40);
  }, [companyEmployees, employee, search]);

  const doAfter = async (fn: () => Promise<void>) => {
    await fn();
    onResolved?.();
    onOpenChange(false);
  };

  if (!employee) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="p-4 border-b space-y-1">
            <SheetTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Resolver identidad
            </SheetTitle>
            <div className="text-xs text-muted-foreground">
              {companyName ?? "Empresa"} · Same-tenant · Sin cambios a payroll ni portal
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4 pb-40">
              {/* Identity summary */}
              <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{displayName}</div>
                    {employee.original_placeholder_name && employee.original_placeholder_name !== displayName && (
                      <div className="text-[11px] text-muted-foreground">
                        Original: {employee.original_placeholder_name}
                      </div>
                    )}
                  </div>
                  <IdentityBadges employee={employee} size="sm" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <Field label="worker_type" value={employee.worker_type ?? "—"} />
                  <Field label="identity_status" value={employee.identity_status ?? "—"} />
                  <Field label="identity_source" value={employee.identity_source ?? "—"} />
                  <Field label="requires_resolution" value={employee.requires_identity_resolution ? "yes" : "no"} />
                  <Field label="portal_access" value={portalAccess === null ? "…" : portalAccess ? "ENABLED" : "disabled"} tone={portalAccess ? "warn" : undefined} />
                  <Field label="user_id" value={employee.user_id ? "present" : "—"} tone={employee.user_id ? "warn" : undefined} />
                  <Field label="assignments" value={assignmentCount === null ? "…" : String(assignmentCount)} />
                  <Field label="time_entries" value={timeEntryCount === null ? "…" : String(timeEntryCount)} tone={(timeEntryCount ?? 0) > 0 ? "warn" : undefined} />
                </div>

                {hasPortalHistory && (
                  <div className="text-[11px] rounded border border-rose-300 bg-rose-50 text-rose-800 p-2 leading-snug">
                    Este registro tiene acceso al portal o historial de fichajes.
                    No lo resuelvas ni lo bloquees sin confirmación operativa.
                    Link/Merge se permite solo si estás seguro; el portal y payroll no serán modificados por esta acción.
                  </div>
                )}
              </div>

              {/* Existing notes */}
              {employee.identity_notes && (
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Historial de notas</div>
                  <pre className="text-[11px] whitespace-pre-wrap font-mono leading-snug max-h-40 overflow-auto">{employee.identity_notes}</pre>
                </div>
              )}

              {/* Note input */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Nota de resolución</div>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej: confirmado por Keury, mismo trabajador que #1234."
                  rows={3}
                  className="text-xs"
                />
              </div>

              {/* Primary actions */}
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="outline"
                  className="justify-start gap-2"
                  disabled={pending !== null || !note.trim()}
                  onClick={() => doAfter(() => addNote({ employeeId: employee.id, companyId: employee.company_id, note }))}
                >
                  <Clock className="h-4 w-4" /> Guardar solo la nota
                </Button>
                <Button
                  variant="outline"
                  className="justify-start gap-2"
                  disabled={pending !== null}
                  onClick={() => doAfter(() => keepUnresolved({ employeeId: employee.id, companyId: employee.company_id, note }))}
                >
                  <Clock className="h-4 w-4" /> Mantener pendiente
                </Button>
                <Button
                  className="justify-start gap-2"
                  disabled={pending !== null}
                  onClick={() => setConfirm("verify")}
                >
                  <CheckCircle2 className="h-4 w-4" /> Marcar como verificado
                </Button>
                <Button
                  variant="destructive"
                  className="justify-start gap-2"
                  disabled={pending !== null}
                  onClick={() => setConfirm("reject")}
                >
                  <XCircle className="h-4 w-4" /> Marcar como inválido / rechazado
                </Button>
              </div>

              {/* Link / Merge */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Enlazar o consolidar dentro de {companyName ?? "esta empresa"}
                  </div>
                  <div className="flex rounded-md border p-0.5 text-[11px]">
                    <button
                      className={"px-2 py-0.5 rounded " + (mode === "link" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                      onClick={() => setMode("link")}
                    >
                      Link
                    </button>
                    <button
                      className={"px-2 py-0.5 rounded " + (mode === "merge" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                      onClick={() => setMode("merge")}
                    >
                      Merge
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  {mode === "link"
                    ? "Link: guarda una referencia a otro empleado real, sin mover historial ni fichajes."
                    : "Merge: consolida este registro en el master usando la lógica existente (merge_employees). Se refusa si hay periodos activos o cambios protegidos."}
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre (misma empresa)…"
                    className="pl-7 h-8 text-xs"
                  />
                </div>
                <div className="max-h-48 overflow-auto rounded border divide-y">
                  {targets.length === 0 ? (
                    <div className="p-2 text-[11px] text-muted-foreground">Sin resultados en esta empresa.</div>
                  ) : targets.map((t) => (
                    <button
                      key={t.id}
                      className={"w-full text-left p-2 text-xs hover:bg-muted/40 flex items-center justify-between gap-2 " + (target?.id === t.id ? "bg-muted" : "")}
                      onClick={() => setTarget(t)}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{`${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || "(sin nombre)"}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{t.id}</div>
                      </div>
                      {t.is_active === false && <Badge variant="outline" className="text-[9px]">inactivo</Badge>}
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={pending !== null || !target}
                  onClick={() => setConfirm(mode)}
                >
                  {mode === "link" ? <Link2 className="h-4 w-4" /> : <GitMerge className="h-4 w-4" />}
                  {mode === "link" ? "Enlazar a este empleado" : "Consolidar en este empleado"}
                </Button>
              </div>

              <div className="text-[10px] text-muted-foreground leading-snug pt-2">
                Estas acciones solo actualizan campos de identidad. No modifican
                payroll, time_entries, portal, documentos ni permisos. Cross-tenant
                está bloqueado por el trigger de base de datos.
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Confirm dialogs */}
      <AlertDialog open={confirm === "verify"} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como verificado</AlertDialogTitle>
            <AlertDialogDescription>
              Se establecerá worker_type=real_employee e identity_status=verified.
              No se modifica portal, payroll ni fichajes.
              {hasPortalHistory && " Este registro tiene portal o historial — asegúrate de tener confirmación operativa."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => doAfter(() => markVerified({ employeeId: employee.id, companyId: employee.company_id, note }))}
            >Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "reject"} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como inválido</AlertDialogTitle>
            <AlertDialogDescription>
              identity_status=rejected. Historial (asignaciones y fichajes) permanece intacto.
              No se cambia portal ni payroll.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => doAfter(() => markRejected({ employeeId: employee.id, companyId: employee.company_id, note }))}
            >Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "link"} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enlazar identidad</AlertDialogTitle>
            <AlertDialogDescription>
              Se guardará la referencia a <strong>{target ? `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() : ""}</strong>.
              No se mueven asignaciones ni fichajes. Same-company only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => target && doAfter(() => linkToEmployee({
                employeeId: employee.id, companyId: employee.company_id,
                targetEmployeeId: target.id, targetCompanyId: target.company_id, note,
              }))}
            >Enlazar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "merge"} onOpenChange={(v) => { if (!v) { setConfirm(null); setConfirmMasterName(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Consolidar en master</AlertDialogTitle>
            <AlertDialogDescription>
              Se ejecutará <code>merge_employees</code> con este registro como duplicado.
              El servidor puede rechazar si hay periodos activos o cambios protegidos.
              Same-company only. Escribe el nombre completo del master para confirmar:
              <div className="mt-2 text-foreground font-medium">
                {target ? `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() : ""}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmMasterName}
            onChange={(e) => setConfirmMasterName(e.target.value)}
            placeholder="Nombre del master"
            className="mt-1"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!target || !confirmMasterName.trim()}
              onClick={() => target && doAfter(() => mergeIntoEmployee({
                employeeId: employee.id, companyId: employee.company_id,
                masterEmployeeId: target.id, masterCompanyId: target.company_id,
                confirmMasterName: confirmMasterName.trim(), note,
              }))}
            >Consolidar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-background border px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={"font-mono " + (tone === "warn" ? "text-amber-700 font-semibold" : "")}>{value}</span>
    </div>
  );
}
