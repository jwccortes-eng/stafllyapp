import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { usePermissions, evaluateAccessPreview } from "@/hooks/usePermissions";
import { AuthorizationLoading } from "@/components/auth/PermissionGate";
import {
  PERMISSION_CATALOG,
  DOMAIN_LABELS,
  permissionsByDomain,
  summarizeAccess,
  type PermissionDomain,
  type PermissionSpec,
} from "@/lib/auth/permission-catalog";
import type { ActionPermissionRow, ModulePermissionRow } from "@/lib/auth/permission-resolver";
import {
  EMPTY_DRAFT,
  applyToggle,
  applyTemplateToDraft,
  changedPermissions,
  isConfigurable,
  isDirty,
  isProtected,
  overrideValue,
  switchValue,
  type OverrideDraft,
} from "@/lib/auth/permission-overrides";
import {
  SCOPE_LABELS,
  roleFromTemplateName,
  
  templateActionsFor,
} from "@/lib/auth/role-model";
import { assignableRoles, resolvePrimaryRole } from "@/lib/auth/primary-role";
import type { OperatingPerson } from "@/lib/auth/operating-model";
import { ResponsibilityCard } from "@/components/access/ResponsibilityCard";
import { CompanyOperatingModel } from "@/components/access/CompanyOperatingModel";
import { resolvePortalStatus } from "@/lib/portal/portal-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader } from "@/components/ui/page-header";
import { Shield, Check, X, Loader2, Eye, Users, LayoutTemplate, ListChecks, Workflow } from "lucide-react";
import { notifyError, notifySuccess } from "@/lib/feedback/notify";

interface MemberRow {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  updated_at: string | null;
  /** Overrides de acción persistidos en esta empresa (para derivar el rol principal). */
  overrides: Record<string, boolean>;
  is_active: boolean | null;
  portal: string;
}

interface RoleTemplate {
  id: string;
  name: string;
  description: string | null;
  actions: string[];
  is_system: boolean;
}

type ModuleState = Record<string, { view: boolean; edit: boolean; delete: boolean }>;

const DOMAIN_ORDER: PermissionDomain[] = [
  "services",
  "staffing",
  "attendance",
  "people",
  "clients",
  "documents",
  "communication",
  "payroll",
  "admin",
];

export default function AccessConsole() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { status, can } = usePermissions();

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  /** Capa 2: overrides explícitos de esta compañía. ÚNICO estado editable. */
  const [draft, setDraft] = useState<OverrideDraft>(EMPTY_DRAFT);
  /** Copia de lo persistido, para detectar cambios sin guardar y revertir. */
  const [baseline, setBaseline] = useState<OverrideDraft>(EMPTY_DRAFT);
  const [legacyRows, setLegacyRows] = useState<ModulePermissionRow[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  /** Pestaña activa: Roles necesita poder llevar a Usuarios sin perder contexto. */
  const [tab, setTab] = useState("users");
  /** Plantilla elegida en Roles que espera persona en Usuarios. NO persiste nada. */
  const [pendingTemplate, setPendingTemplate] = useState<RoleTemplate | null>(null);
  /** Tarjeta de rol con el listado de personas desplegado. */
  const [rosterFor, setRosterFor] = useState<string | null>(null);

  const byDomain = useMemo(() => permissionsByDomain(), []);

  /* ---------------- carga de miembros y plantillas ---------------- */
  useEffect(() => {
    if (!selectedCompanyId) return;
    let cancelled = false;
    setLoading(true);
    setSelectedUser(null);

    (async () => {
      const [{ data: cu }, { data: tmpl }] = await Promise.all([
        supabase.from("company_users").select("user_id, role").eq("company_id", selectedCompanyId),
        supabase.from("role_templates").select("*").or(`company_id.eq.${selectedCompanyId},is_system.eq.true`),
      ]);

      const ids = (cu ?? []).map((r) => r.user_id);
      const [{ data: profiles }, { data: overrideRows }, { data: emps }] = ids.length
        ? await Promise.all([
            supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids),
            supabase
              .from("action_permissions")
              .select("user_id, action, granted, updated_at")
              .eq("company_id", selectedCompanyId)
              .in("user_id", ids)
              .order("updated_at", { ascending: false }),
            supabase
              .from("employees")
              .select("user_id, is_active, phone_number")
              .eq("company_id", selectedCompanyId)
              .in("user_id", ids),
          ])
        : [
            { data: [] as { user_id: string; full_name: string | null; email: string | null }[] },
            { data: [] as { user_id: string; action: string; granted: boolean; updated_at: string }[] },
            { data: [] as { user_id: string; is_active: boolean | null; phone_number: string | null }[] },
          ];

      if (cancelled) return;
      setMembers(
        (cu ?? []).map((row) => {
          const p = profiles?.find((x) => x.user_id === row.user_id);
          const emp = emps?.find((e) => e.user_id === row.user_id) ?? null;
          const overrides: Record<string, boolean> = {};
          for (const o of overrideRows ?? []) {
            if (o.user_id === row.user_id) overrides[o.action] = o.granted;
          }
          return {
            user_id: row.user_id,
            role: row.role,
            full_name: p?.full_name ?? null,
            email: p?.email ?? null,
            updated_at: overrideRows?.find((c) => c.user_id === row.user_id)?.updated_at ?? null,
            overrides,
            is_active: emp?.is_active ?? null,
            portal: resolvePortalStatus(
              emp ? { user_id: row.user_id, is_active: emp.is_active, phone_number: emp.phone_number } : { user_id: row.user_id },
            ).label,
          };
        }),
      );
      setTemplates((tmpl as RoleTemplate[]) ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);


  /* ---------------- perfil de acceso del usuario elegido ---------------- */
  const loadProfile = useCallback(
    async (userId: string) => {
      if (!selectedCompanyId) return;
      setLoadingProfile(true);
      const [{ data: acts }, { data: mods }] = await Promise.all([
        supabase.from("action_permissions").select("action, granted").eq("user_id", userId).eq("company_id", selectedCompanyId),
        supabase.from("module_permissions").select("module, company_id, can_view, can_edit, can_delete").eq("user_id", userId),
      ]);

      // OVERRIDES = solo lo explícito de ESTA compañía. Lo heredado
      // (company_id NULL) alimenta el preview, nunca el estado editable.
      const nextActions: Record<string, boolean> = {};
      for (const a of acts ?? []) nextActions[a.action] = a.granted;

      const scoped = (mods ?? []).filter((m) => m.company_id === selectedCompanyId);
      const legacy = (mods ?? []).filter((m) => m.company_id === null) as ModulePermissionRow[];
      const nextModules: ModuleState = {};
      for (const m of scoped) {
        nextModules[m.module] = { view: m.can_view, edit: m.can_edit, delete: m.can_delete };
      }

      const loaded: OverrideDraft = { actions: nextActions, modules: nextModules };
      setDraft(loaded);
      setBaseline(loaded);
      setLegacyRows(legacy);
      setReason("");
      setLoadingProfile(false);
    },
    [selectedCompanyId],
  );

  useEffect(() => {
    if (selectedUser) void loadProfile(selectedUser);
  }, [selectedUser, loadProfile]);

  const target = members.find((m) => m.user_id === selectedUser) ?? null;

  /** Personas de la empresa mapeadas a la cadena operativa (solo lectura). */
  const operatingPeople: OperatingPerson[] = useMemo(
    () =>
      members.map((m) => {
        const p = resolvePrimaryRole(m.role, m.overrides);
        return {
          userId: m.user_id,
          name: m.full_name ?? m.email ?? "Sin nombre",
          role: p.role?.key ?? null,
          custom: p.custom,
        };
      }),
    [members],
  );

  /* ---------------- capas: role defaults · overrides · effective ---------------- */
  const evaluateWith = useCallback(
    (source: OverrideDraft) => {
      if (!target || !selectedCompanyId) return {} as Record<string, boolean>;
      const actionRows: ActionPermissionRow[] = Object.entries(source.actions).map(([action, granted]) => ({
        action,
        company_id: selectedCompanyId,
        granted,
      }));
      const moduleRows: ModulePermissionRow[] = Object.entries(source.modules).map(([module, v]) => ({
        module,
        company_id: selectedCompanyId,
        can_view: v.view,
        can_edit: v.edit,
        can_delete: v.delete,
      }));
      return evaluateAccessPreview(
        {
          globalRoles: new Set<string>(),
          companyRoles: { [selectedCompanyId]: target.role },
          modulePermissions: [...moduleRows, ...legacyRows],
          actionPermissions: actionRows,
        },
        selectedCompanyId,
      );
    },
    [target, selectedCompanyId, legacyRows],
  );

  /** Capa 1: lo que concede el rol por sí solo (sin overrides). */
  const roleDefaults = useMemo(() => evaluateWith(EMPTY_DRAFT), [evaluateWith]);
  /** Capa 3: acceso efectivo = rol + overrides. SOLO LECTURA. */
  const preview = useMemo(() => evaluateWith(draft), [evaluateWith, draft]);

  const grantedSet = useMemo(
    () => new Set(Object.entries(preview).filter(([, v]) => v).map(([k]) => k)),
    [preview],
  );

  const dirty = useMemo(() => isDirty(draft, baseline), [draft, baseline]);
  const changedCount = useMemo(() => changedPermissions(draft, baseline).length, [draft, baseline]);

  /** REGLA: rol principal vigente según el borrador actual. */
  const primary = useMemo(
    () => (target ? resolvePrimaryRole(target.role, draft.actions) : null),
    [target, draft.actions],
  );

  /** EXCEPCIONES: permisos donde el override contradice al rol principal. */
  const exceptions = useMemo(
    () =>
      PERMISSION_CATALOG.filter((spec) => {
        const ov = overrideValue(spec, draft);
        return ov !== undefined && ov !== !!roleDefaults[spec.permission];
      }).length,
    [draft, roleDefaults],
  );

  /* ---------------- edición (capa 2: overrides) ---------------- */
  const togglePermission = (spec: PermissionSpec, next: boolean) => {
    if (isProtected(target?.role, spec)) return;
    setDraft((prev) => applyToggle(prev, spec, next));
  };

  /** Cambia el ROL PRINCIPAL: reescribe la regla, conserva la membresía. */
  const changePrimaryRole = (roleKey: string) => {
    const role = assignableRoles(target?.role ?? "").find((r) => r.key === roleKey);
    if (!role) return;
    setDraft(applyTemplateToDraft(EMPTY_DRAFT, templateActionsFor(role)));
  };


  /** Roles → Usuarios: conserva la plantilla y pide persona en la superficie canónica. */
  const startTemplateFlow = (tpl: RoleTemplate) => {
    setPendingTemplate(tpl);
    setRosterFor(null);
    setTab("users");
  };

  const applyTemplate = (tpl: RoleTemplate) => {
    setDraft((prev) => applyTemplateToDraft(prev, tpl.actions));
    notifySuccess({
      key: "access-template",
      title: `Plantilla "${tpl.name}" aplicada`,
      fact: "Los cambios aún no se guardaron.",
      consequence: "Revisa el perfil y pulsa Guardar cambios.",
    });
  };

  const discard = () => setDraft(baseline);



  const save = async () => {
    if (!selectedUser || !selectedCompanyId) return;
    const attempted = draft;
    setSaving(true);

    const { error } = await supabase.rpc("admin_set_user_access", {
      _user_id: selectedUser,
      _company_id: selectedCompanyId,
      _actions: attempted.actions,
      _modules: attempted.modules,
      _reason: reason || null,
    } as never);

    setSaving(false);
    if (error) {
      // Revertir: el estado editable vuelve a lo persistido.
      setDraft(baseline);
      notifyError({
        key: "access-save",
        title: "No se guardaron los permisos",
        fact: error.message,
        consequence: "El acceso de esta persona sigue como estaba y los cambios se descartaron.",
        action: { label: "Reintentar", onClick: () => void save() },
        cause: error,
      });
      return;
    }
    notifySuccess({
      key: "access-save",
      title: "Acceso actualizado",
      fact: `Se guardó el acceso de ${target?.full_name ?? "la persona"} en ${selectedCompany?.name ?? "esta empresa"}.`,
      consequence: "Aplica solo a esta empresa y queda registrado en Actividad.",
    });
    void loadProfile(selectedUser);
  };


  /* ---------------- render ---------------- */
  if (status === "loading") return <AuthorizationLoading />;

  if (!can("roles.manage")) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
        <Shield className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-semibold">Sin acceso a la consola de accesos</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Solo quien administra esta empresa puede ver o modificar permisos.
        </p>
      </div>
    );
  }

  const filtered = members.filter((m) =>
    `${m.full_name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        variant="5"
        icon={Shield}
        title="Accesos y permisos"
        subtitle={`Quién puede hacer qué en ${selectedCompany?.name ?? "esta empresa"}. Los permisos aplican solo a esta empresa.`}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" />Usuarios</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><LayoutTemplate className="h-3.5 w-3.5" />Roles</TabsTrigger>
          <TabsTrigger value="model" className="gap-1.5"><Workflow className="h-3.5 w-3.5" />Modelo operativo</TabsTrigger>
          <TabsTrigger value="catalog" className="gap-1.5"><ListChecks className="h-3.5 w-3.5" />Permisos</TabsTrigger>
        </TabsList>

        {/* ---------------- USUARIOS ---------------- */}
        <TabsContent value="users" className="mt-4 space-y-4">
          {pendingTemplate && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Aplicar plantilla
                  </p>
                  <p className="text-sm font-semibold">{pendingTemplate.name}</p>
                  <p className="text-xs text-muted-foreground">
                    A: <strong>{target ? (target.full_name ?? target.email ?? "—") : "elige una persona en la lista"}</strong>
                    {" · Empresa: "}
                    <strong>{selectedCompany?.name ?? "—"}</strong>
                    {(() => {
                      const c = roleFromTemplateName(pendingTemplate.name);
                      return c ? ` · Alcance: ${SCOPE_LABELS[c.scope]}` : "";
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pendingTemplate.actions.length} permisos · se cargan como excepciones de esta empresa y
                    no cambian nada en otras empresas.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPreview(true)}
                    disabled={!target}
                    className="gap-1.5"
                  >
                    <Eye className="h-4 w-4" />
                    Ver permisos efectivos
                  </Button>
                  <Button
                    size="sm"
                    disabled={!target}
                    onClick={() => {
                      applyTemplate(pendingTemplate);
                      setPendingTemplate(null);
                    }}
                  >
                    Confirmar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingTemplate(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
              {!target && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Elige a la persona en la lista de la izquierda para continuar.
                </p>
              )}
            </div>
          )}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Personas con acceso</CardTitle>
                <CardDescription className="text-xs">
                  Miembros de {selectedCompany?.name ?? "la empresa"} · elige a alguien para ver y cambiar
                  qué puede hacer.
                </CardDescription>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar persona…"
                  className="mt-2 h-9 max-w-sm"
                />
              </CardHeader>
              <CardContent className="space-y-1.5">
                {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {!loading && filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay miembros en esta empresa.</p>
                )}
                {!loading && filtered.length > 0 && (
                  <div className="hidden grid-cols-[minmax(0,2fr)_1.4fr_1.4fr_.8fr_1fr] gap-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <span>Nombre</span>
                    <span>Rol principal</span>
                    <span>Alcance</span>
                    <span>Estado</span>
                    <span>Portal</span>
                  </div>
                )}
                <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                  {filtered.map((m) => {
                    const p = resolvePrimaryRole(m.role, m.overrides);
                    return (
                      <button
                        key={m.user_id}
                        onClick={() => setSelectedUser(m.user_id)}
                        className={`grid w-full grid-cols-1 gap-1 rounded-xl border p-3 text-left transition-colors sm:grid-cols-[minmax(0,2fr)_1.4fr_1.4fr_.8fr_1fr] sm:items-center sm:gap-3 ${
                          selectedUser === m.user_id ? "border-primary/40 bg-accent/60" : "hover:bg-accent/40"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{m.full_name ?? m.email ?? m.user_id}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{m.email ?? "—"}</p>
                        </div>
                        <span className="truncate text-xs">
                          {p.label}
                          {p.custom && (
                            <Badge variant="outline" className="ml-1.5 text-[9px]">
                              excepciones
                            </Badge>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{p.scopeLabel}</span>
                        <span className="text-xs text-muted-foreground">
                          {m.is_active === false ? "Inactiva" : "Activa"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{m.portal}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {target ? `Perfil de acceso — ${target.full_name ?? target.email}` : "Perfil de acceso"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {target
                    ? summarizeAccess(grantedSet)
                    : "Elige una persona para administrar su acceso en esta empresa."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!target && <p className="text-sm text-muted-foreground">Nadie seleccionado.</p>}
                {target && loadingProfile && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

                {target && !loadingProfile && (
                  <>
                    {/* REGLA — rol principal */}
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Rol principal
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {assignableRoles(target.role).length > 0 ? (
                          <Select
                            value={primary?.role?.key ?? "custom"}
                            onValueChange={changePrimaryRole}
                          >
                            <SelectTrigger className="h-9 w-full max-w-xs">
                              <SelectValue placeholder="Elige un rol" />
                            </SelectTrigger>
                            <SelectContent>
                              {primary?.custom && (
                                <SelectItem value="custom" disabled>
                                  Acceso personalizado
                                </SelectItem>
                              )}
                              {assignableRoles(target.role).map((r) => (
                                <SelectItem key={r.key} value={r.key}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className="text-[11px]">{primary?.label}</Badge>
                        )}
                        {primary?.role?.description && (
                          <p className="text-xs text-muted-foreground">{primary.role.description}</p>
                        )}
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Empresa: <strong>{selectedCompany?.name ?? "—"}</strong>
                        {" · Alcance: "}
                        <strong>{primary?.scopeLabel}</strong>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Acceso efectivo: <strong>{grantedSet.size} permisos</strong> ·{" "}
                        <strong>{exceptions} excepciones</strong>
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        El rol principal es la regla. Los cambios se aplican al pulsar Guardar y solo afectan
                        a esta empresa.
                      </p>
                    </div>

                    {/* RESPONSABILIDAD — el mismo acceso, en lenguaje de negocio */}
                    <ResponsibilityCard
                      roleKey={primary?.role?.key ?? null}
                      displayRole={primary?.label ?? "Acceso personalizado"}
                      companyName={selectedCompany?.name ?? "esta empresa"}
                      people={operatingPeople}
                      grantedCount={grantedSet.size}
                      overrideCount={exceptions}
                    />



                    {(target.role === "company_owner" || target.role === "admin") && (
                      <p className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                        Esta persona es <strong>{target.role}</strong> en {selectedCompany?.name}: su membresía concede
                        todo por defecto. Puedes quitarle permisos concretos aquí y la excepción aplica solo a esta
                        empresa.
                        {target.role === "company_owner" && (
                          <>
                            {" "}Como dueña de la empresa conserva siempre <strong>administrar usuarios</strong>,{" "}
                            <strong>administrar roles y permisos</strong> y <strong>configuración de empresa</strong>.
                          </>
                        )}
                      </p>
                    )}

                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Excepciones · {exceptions}
                    </p>





                    <Accordion type="multiple" className="w-full">
                      {DOMAIN_ORDER.filter((d) => byDomain[d]?.length).map((domain) => {
                        const specs = byDomain[domain];
                        const grantedCount = specs.filter((s) => preview[s.permission]).length;
                        return (
                          <AccordionItem key={domain} value={domain}>
                            <AccordionTrigger className="text-sm">
                              <span className="flex items-center gap-2">
                                {DOMAIN_LABELS[domain]}
                                <Badge variant={grantedCount ? "default" : "secondary"} className="text-[10px]">
                                  {grantedCount}/{specs.length}
                                </Badge>
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-2">
                              {specs.map((spec) => {
                                const configurable = isConfigurable(spec);
                                const protectedPerm = isProtected(target.role, spec);
                                const roleDefault = !!roleDefaults[spec.permission];
                                const checked = protectedPerm
                                  ? true
                                  : switchValue(spec, draft, roleDefault);
                                const ov = overrideValue(spec, draft);
                                const effective = !!preview[spec.permission];
                                return (
                                  <div
                                    key={spec.permission}
                                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm">{spec.label}</p>
                                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                                        {spec.permission}
                                        {spec.write ? " · escritura" : ""}
                                      </p>
                                      <p className="truncate text-[10px] text-muted-foreground">
                                        {protectedPerm
                                          ? "Protegido: el dueño no puede quitárselo"
                                          : ov === undefined
                                            ? `Heredado del rol ${target.role} · ${roleDefault ? "permitido" : "denegado"}`
                                            : `Excepción de esta empresa · ${ov ? "permitido" : "denegado"}`}
                                        {" · efectivo: "}
                                        {effective ? "sí" : "no"}
                                      </p>
                                    </div>
                                    {configurable ? (
                                      <Switch
                                        checked={checked}
                                        disabled={protectedPerm}
                                        onCheckedChange={(v) => togglePermission(spec, v)}
                                      />
                                    ) : (
                                      <Badge variant="secondary" className="text-[10px]">
                                        Solo administración
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>

                    <div className="space-y-2">
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Motivo del cambio (opcional, queda en la auditoría)"
                        className="min-h-[60px] text-sm"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {dirty && (
                          <Badge variant="destructive" className="text-[10px]">
                            Cambios sin guardar · {changedCount}
                          </Badge>
                        )}
                        <Button onClick={save} disabled={saving || !dirty}>
                          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Guardar cambios
                        </Button>
                        <Button variant="ghost" onClick={discard} disabled={saving || !dirty}>
                          Descartar
                        </Button>
                        <Button variant="outline" onClick={() => setShowPreview((v) => !v)} className="gap-1.5">
                          <Eye className="h-4 w-4" />
                          Ver acceso efectivo
                        </Button>
                      </div>
                    </div>


                    {showPreview && (
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Acceso efectivo en {selectedCompany?.name}
                        </p>
                        <p className="mb-3 text-sm">{summarizeAccess(grantedSet)}</p>
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {PERMISSION_CATALOG.map((spec) => (
                            <div key={spec.permission} className="flex items-center gap-2 text-xs">
                              {preview[spec.permission] ? (
                                <Check className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <X className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className={preview[spec.permission] ? "" : "text-muted-foreground"}>
                                {spec.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- ROLES (plantillas) ---------------- */}
        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Roles como plantillas</CardTitle>
              <CardDescription className="text-xs">
                Un rol es un punto de partida de permisos, no la autoridad final. Aquí ves qué hace, qué
                alcance tiene y quién lo tiene. Al aplicarlo se abre Usuarios, la única superficie donde se
                edita el acceso de una persona.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {templates.map((tpl) => {
                const canonical = roleFromTemplateName(tpl.name);
                return (
                <div key={tpl.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{tpl.name}</p>
                    {tpl.is_system && <Badge variant="secondary" className="text-[10px]">Sistema</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{tpl.description ?? "—"}</p>
                  {canonical && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Alcance: <strong>{SCOPE_LABELS[canonical.scope]}</strong>
                      {canonical.aliases?.length ? ` · También llamado: ${canonical.aliases.join(", ")}` : ""}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">{tpl.actions.length} permisos</p>

                  {(() => {
                    const roster = canonical
                      ? members.filter((m) => m.role === canonical.membershipRole)
                      : [];
                    const open = rosterFor === tpl.id;
                    return (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => startTemplateFlow(tpl)}>
                            Aplicar a persona
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRosterFor(open ? null : tpl.id)}
                          >
                            {open ? "Ocultar personas" : `Ver personas con este rol (${roster.length})`}
                          </Button>
                        </div>
                        {open && (
                          <div className="mt-3 space-y-1.5 rounded-lg border bg-muted/30 p-3">
                            <p className="text-[11px] text-muted-foreground">
                              Miembros de {selectedCompany?.name ?? "esta empresa"} con este nivel de membresía.
                            </p>
                            {roster.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nadie con este rol todavía.</p>
                            ) : (
                              roster.map((m) => (
                                <button
                                  key={m.user_id}
                                  onClick={() => {
                                    setSelectedUser(m.user_id);
                                    setTab("users");
                                  }}
                                  className="block w-full truncate rounded-md px-2 py-1 text-left text-xs hover:bg-accent/60"
                                >
                                  {m.full_name ?? m.email ?? m.user_id}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                );
              })}

            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- CATÁLOGO ---------------- */}
        <TabsContent value="catalog" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Catálogo canónico de permisos</CardTitle>
              <CardDescription className="text-xs">
                Un solo catálogo compartido por la app y la base de datos. Cada permiso se evalúa dentro
                de la empresa activa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {DOMAIN_ORDER.filter((d) => byDomain[d]?.length).map((domain) => (
                <div key={domain}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {DOMAIN_LABELS[domain]}
                  </p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {byDomain[domain].map((spec) => (
                      <div key={spec.permission} className="rounded-lg border px-3 py-1.5">
                        <p className="font-mono text-[11px]">{spec.permission}</p>
                        <p className="text-[11px] text-muted-foreground">{spec.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
