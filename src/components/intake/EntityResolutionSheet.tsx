/**
 * Ecosystem Intake Engine — FASE 1 / 1.1: resolución inline de entidades.
 *
 * Superficie única del ciclo DETECTAR → BUSCAR → RECOMENDAR → CONFIRMAR →
 * VINCULAR O CREAR → CONTINUAR → APRENDER, sin abandonar la revisión.
 *
 * Reglas de superficie:
 *  - la IA propone, la persona confirma; nada se crea en silencio;
 *  - siempre se explica por qué se recomienda una coincidencia;
 *  - si hay algo parecido, se avisa y se exige una segunda confirmación;
 *  - antes de escribir se muestra el plan exacto ("VAMOS A");
 *  - crear es la última opción, nunca la primera;
 *  - tras confirmar, se ofrece recordar la corrección para esta empresa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Link2, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { useAuth } from "@/hooks/useAuth";
import { loadIntakeCatalogs, type IntakeCatalogs } from "@/lib/intake/text-intake";
import type { CatalogEntry } from "@/lib/intake/entity-resolution";
import {
  buildCreationPlan,
  buildEntityResolution,
  describePlanAction,
  KIND_LABEL,
  type EntityResolutionOption,
  type IntakeEntityKind,
} from "@/lib/intake/entity-linking";
import {
  ASSISTED_BLOCK_COPY,
  linkOrCreateClient,
  linkOrCreateClientContact,
  linkOrCreateVenue,
  type AssistedEntity,
} from "@/lib/intake/assisted-creation";
import {
  emptyEntityMetrics,
  logEntityMetrics,
  recordEntityOutcome,
  type EntityResolutionMetrics,
} from "@/lib/intake/entity-metrics";
import { useRememberCorrection } from "@/components/intake/RememberCorrectionPrompt";

export interface EntityResolutionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sólo cliente y lugar se resuelven contra catálogo en Fase 1. */
  kind: Extract<IntakeEntityKind, "client" | "venue">;
  /** Texto detectado por la IA. */
  raw: string;
  companyId: string;
  /** Origen del intake, sólo para trazabilidad del aprendizaje. */
  source?: string;
  /** Cliente ya vinculado del candidato: habilita crear contacto operativo. */
  linkedClientId?: string | null;
  onResolved: (kind: "client" | "venue", entity: AssistedEntity) => void;
}

export function EntityResolutionSheet({
  open,
  onOpenChange,
  kind,
  raw,
  companyId,
  source = "service_intake",
  linkedClientId,
  onResolved,
}: EntityResolutionSheetProps) {
  const { user } = useAuth();
  const [catalogs, setCatalogs] = useState<IntakeCatalogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(raw);
  const [newName, setNewName] = useState(raw);
  const [extra, setExtra] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [duplicates, setDuplicates] = useState<AssistedEntity[] | null>(null);

  const metrics = useRef<EntityResolutionMetrics>(emptyEntityMetrics(companyId));
  const startedAt = useRef<number>(Date.now());

  const { ask, dialog } = useRememberCorrection(companyId, source);

  useEffect(() => {
    if (!open) return;
    setQuery(raw);
    setNewName(raw);
    setExtra("");
    setContactName("");
    setContactEmail("");
    setShowCreate(false);
    setDuplicates(null);
    metrics.current = emptyEntityMetrics(companyId);
    startedAt.current = Date.now();
  }, [open, raw, companyId]);

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setLoading(true);
    loadIntakeCatalogs(companyId)
      .then((c) => { if (alive) setCatalogs(c); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, companyId]);

  const catalog: CatalogEntry[] = useMemo(
    () => (kind === "client" ? catalogs?.clients ?? [] : catalogs?.venues ?? []),
    [catalogs, kind],
  );

  const decision = useMemo(
    () => buildEntityResolution(kind, query, catalog),
    [kind, query, catalog],
  );

  /** Búsqueda manual: si la persona escribe, también mostramos texto libre. */
  const browse: EntityResolutionOption[] = useMemo(() => {
    if (decision.options.length > 0) return decision.options;
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((c) => (c.name ?? "").toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({ id: c.id, label: c.name, score: 0, reason: "Coincide con tu búsqueda" }));
  }, [decision.options, catalog, query]);

  /** Plan explícito: exactamente lo que se ejecutará al confirmar. */
  const plan = useMemo(() => {
    if (!showCreate) return [];
    return buildCreationPlan({
      [kind]: { mode: "create", label: newName.trim() || raw },
      contact:
        kind === "client" && contactName.trim()
          ? { mode: "create", label: contactName.trim() }
          : undefined,
    } as any);
  }, [showCreate, kind, newName, raw, contactName]);

  const closeWithMetrics = useCallback(() => {
    logEntityMetrics(metrics.current);
    onOpenChange(false);
  }, [onOpenChange]);

  const maybeCreateContact = useCallback(
    async (clientId: string) => {
      if (kind !== "client" || !contactName.trim()) return;
      const res = await linkOrCreateClientContact({
        companyId,
        userId: user?.id ?? null,
        confirmedByHuman: true,
        allowDuplicate: false,
        clientId,
        name: contactName,
        email: contactEmail || null,
      });
      if (res.status === "possible_duplicate") {
        metrics.current = recordEntityOutcome(metrics.current, "duplicate_prevented");
        notifyWarning({
          title: "Contacto muy parecido",
          fact: `Ya existe ${res.matches[0]?.name} en este cliente.`,
          consequence: "No creamos un contacto duplicado. Revísalo desde el cliente.",
        });
      } else if (res.status === "created") {
        metrics.current = recordEntityOutcome(metrics.current, "entity_created");
      }
    },
    [companyId, contactEmail, contactName, kind, user?.id],
  );

  const finish = useCallback(
    async (entity: AssistedEntity, created: boolean, clientIdForContact?: string) => {
      if (clientIdForContact) await maybeCreateContact(clientIdForContact);
      onResolved(kind, entity);
      notifySuccess({
        title: created ? `${KIND_LABEL[kind]} creado` : `${KIND_LABEL[kind]} vinculado`,
        fact: created
          ? `Se creó “${entity.name}” en el catálogo de esta empresa.`
          : `El servicio quedó vinculado a “${entity.name}”.`,
        consequence: "No se publicó ningún servicio ni se notificó a nadie.",
      });
      if (raw.trim() && raw.trim().toLowerCase() !== entity.name.trim().toLowerCase()) {
        metrics.current = recordEntityOutcome(metrics.current, "manual_correction");
        ask({
          ruleType: kind === "client" ? "client_alias" : "venue_alias",
          rawValue: raw.trim(),
          resolvedValue: entity.name,
          resolvedEntityId: entity.id,
          resolvedEntityKind: kind === "client" ? "client" : "location",
        });
      }
      closeWithMetrics();
    },
    [ask, closeWithMetrics, kind, maybeCreateContact, onResolved, raw],
  );

  const handleLink = (option: EntityResolutionOption) => {
    metrics.current = recordEntityOutcome(
      metrics.current,
      option.score >= 0.999 ? "exact_match" : "fuzzy_match",
      Date.now() - startedAt.current,
    );
    void finish(
      { id: option.id, name: option.label },
      false,
      kind === "client" ? option.id : linkedClientId ?? undefined,
    );
  };

  const runCreate = async (allowDuplicate: boolean) => {
    if (busy || !newName.trim()) return;
    setBusy(true);
    try {
      const result =
        kind === "client"
          ? await linkOrCreateClient({
              companyId,
              userId: user?.id ?? null,
              confirmedByHuman: true,
              allowDuplicate,
              name: newName,
              contactName: contactName || null,
              contactEmail: contactEmail || null,
            })
          : await linkOrCreateVenue({
              companyId,
              userId: user?.id ?? null,
              confirmedByHuman: true,
              allowDuplicate,
              name: newName,
              formattedAddress: extra || null,
            });

      if (result.status === "possible_duplicate") {
        metrics.current = recordEntityOutcome(metrics.current, "duplicate_prevented");
        setDuplicates(result.matches);
        return;
      }
      if (result.status === "created" || result.status === "linked") {
        metrics.current = recordEntityOutcome(
          metrics.current,
          result.status === "created" ? "entity_created" : "exact_match",
          Date.now() - startedAt.current,
        );
        await finish(
          result.entity,
          result.status === "created",
          kind === "client" ? result.entity.id : linkedClientId ?? undefined,
        );
        return;
      }
      if (result.status === "blocked") {
        notifyWarning({
          title: "No creamos nada",
          fact: ASSISTED_BLOCK_COPY[result.reason] ?? result.reason,
          consequence: "Tu revisión sigue intacta.",
        });
      } else {
        metrics.current = recordEntityOutcome(metrics.current, "failure");
        notifyError({
          title: `No pudimos crear el ${KIND_LABEL[kind]}`,
          fact: result.reason,
          consequence: "Nada quedó a medias: puedes reintentar sin duplicar.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) closeWithMetrics(); }}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Resolver {KIND_LABEL[kind]}
            </SheetTitle>
            <SheetDescription className="text-sm leading-snug">
              {decision.explanation}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="entity-search">Buscar en esta empresa</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="entity-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-11 pl-9"
                  placeholder={`Nombre del ${KIND_LABEL[kind]}`}
                />
              </div>
              <p className="text-[12px] text-muted-foreground">
                Detectado en la fuente: “{raw || "sin texto"}”
              </p>
            </div>

            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando coincidencias…
              </p>
            )}

            {!loading && browse.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Recomendaciones</p>
                {browse.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleLink(option)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-3 text-left transition-colors hover:border-primary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{option.label}</span>
                      <span className="block text-[12px] text-muted-foreground">{option.reason}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {option.score > 0 && (
                        <Badge variant="outline">{Math.round(option.score * 100)}%</Badge>
                      )}
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!loading && browse.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No encontramos ningún {KIND_LABEL[kind]} parecido en esta empresa.
              </p>
            )}

            <Separator />

            {duplicates && duplicates.length > 0 && (
              <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Posible duplicado
                </p>
                <p className="text-[12px] text-muted-foreground">
                  No creamos nada todavía. Ya existe algo muy parecido en esta empresa.
                </p>
                {duplicates.map((d) => (
                  <Button
                    key={d.id}
                    variant="outline"
                    className="h-11 w-full justify-start rounded-xl"
                    onClick={() =>
                      handleLink({ id: d.id, label: d.name, score: 0.95, reason: d.hint ?? "" })
                    }
                  >
                    Usar existente: {d.name}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="h-11 w-full rounded-xl text-destructive"
                  onClick={() => runCreate(true)}
                  disabled={busy}
                >
                  Crear de todas formas
                </Button>
              </div>
            )}

            {!showCreate ? (
              <Button
                variant="outline"
                className="h-11 w-full justify-start rounded-xl"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Crear {KIND_LABEL[kind]} nuevo
              </Button>
            ) : (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entity-name">Nombre del {KIND_LABEL[kind]}</Label>
                  <Input
                    id="entity-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-11"
                  />
                </div>
                {kind === "venue" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="entity-extra">Dirección (opcional)</Label>
                    <Input
                      id="entity-extra"
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                      className="h-11"
                      placeholder="Calle, ciudad"
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-name">Contacto operativo (opcional)</Label>
                      <Input
                        id="contact-name"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="h-11"
                        placeholder="Quién coordina el servicio"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-email">Email del contacto (opcional)</Label>
                      <Input
                        id="contact-email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="h-11"
                        placeholder="correo@empresa.com"
                      />
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      El contacto es comercial/operativo del cliente. No crea trabajador ni perfil.
                    </p>
                  </>
                )}

                {plan.length > 0 && (
                  <div className="rounded-lg bg-muted/60 px-3 py-2">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                      Vamos a
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[13px]">
                      {plan.map((a, i) => (
                        <li key={i}>+ {describePlanAction(a)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[12px] text-muted-foreground">
                  Si ya existe con ese nombre, lo vinculamos en lugar de duplicarlo.
                </p>
                <Button
                  className="h-12 w-full rounded-xl"
                  onClick={() => runCreate(false)}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Confirmar y crear
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {dialog}
    </>
  );
}

export default EntityResolutionSheet;
