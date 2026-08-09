/**
 * Ecosystem Intake Engine — FASE 1: resolución inline de entidades.
 *
 * Superficie única del ciclo DETECTAR → BUSCAR → RECOMENDAR → CONFIRMAR →
 * VINCULAR O CREAR, sin abandonar la revisión del servicio.
 *
 * Reglas de superficie:
 *  - la IA propone, la persona confirma; nada se crea en silencio;
 *  - siempre se explica por qué se recomienda una coincidencia;
 *  - crear es la última opción, nunca la primera;
 *  - tras confirmar, se ofrece recordar la corrección para esta empresa.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Link2, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { useAuth } from "@/hooks/useAuth";
import { loadIntakeCatalogs, type IntakeCatalogs } from "@/lib/intake/text-intake";
import type { CatalogEntry } from "@/lib/intake/entity-resolution";
import {
  buildEntityResolution,
  KIND_LABEL,
  type EntityResolutionOption,
  type IntakeEntityKind,
} from "@/lib/intake/entity-linking";
import {
  ASSISTED_BLOCK_COPY,
  linkOrCreateClient,
  linkOrCreateVenue,
  type AssistedEntity,
} from "@/lib/intake/assisted-creation";
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
  onResolved: (kind: "client" | "venue", entity: AssistedEntity) => void;
}

export function EntityResolutionSheet({
  open,
  onOpenChange,
  kind,
  raw,
  companyId,
  source = "service_intake",
  onResolved,
}: EntityResolutionSheetProps) {
  const { user } = useAuth();
  const [catalogs, setCatalogs] = useState<IntakeCatalogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(raw);
  const [newName, setNewName] = useState(raw);
  const [extra, setExtra] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { ask, dialog } = useRememberCorrection(companyId, source);

  useEffect(() => {
    if (!open) return;
    setQuery(raw);
    setNewName(raw);
    setExtra("");
    setShowCreate(false);
  }, [open, raw]);

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

  const finish = useCallback(
    (entity: AssistedEntity, created: boolean) => {
      onResolved(kind, entity);
      notifySuccess({
        title: created ? `${KIND_LABEL[kind]} creado` : `${KIND_LABEL[kind]} vinculado`,
        fact: created
          ? `Se creó “${entity.name}” en el catálogo de esta empresa.`
          : `El servicio quedó vinculado a “${entity.name}”.`,
        consequence: "No se publicó ningún servicio ni se notificó a nadie.",
      });
      if (raw.trim() && raw.trim().toLowerCase() !== entity.name.trim().toLowerCase()) {
        ask({
          ruleType: kind === "client" ? "client_alias" : "venue_alias",
          rawValue: raw.trim(),
          resolvedValue: entity.name,
          resolvedEntityId: entity.id,
          resolvedEntityKind: kind === "client" ? "client" : "location",
        });
      }
      onOpenChange(false);
    },
    [ask, kind, onOpenChange, onResolved, raw],
  );

  const handleLink = (option: EntityResolutionOption) => {
    finish({ id: option.id, name: option.label }, false);
  };

  const handleCreate = async () => {
    if (busy || !newName.trim()) return;
    setBusy(true);
    try {
      const result =
        kind === "client"
          ? await linkOrCreateClient({
              companyId,
              userId: user?.id ?? null,
              confirmedByHuman: true,
              name: newName,
              contactName: extra || null,
            })
          : await linkOrCreateVenue({
              companyId,
              userId: user?.id ?? null,
              confirmedByHuman: true,
              name: newName,
              formattedAddress: extra || null,
            });

      if (result.status === "created" || result.status === "linked") {
        finish(result.entity, result.status === "created");
      } else if (result.status === "blocked") {
        notifyWarning({
          title: "No creamos nada",
          fact: ASSISTED_BLOCK_COPY[result.reason] ?? result.reason,
          consequence: "Tu revisión sigue intacta.",
        });
      } else {
        notifyError({
          title: `No pudimos crear el ${KIND_LABEL[kind]}`,
          fact: result.reason,
          consequence: "Nada quedó a medias: puedes reintentar.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
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
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-3 text-left transition-colors hover:border-primary"
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
                <div className="space-y-1.5">
                  <Label htmlFor="entity-extra">
                    {kind === "client" ? "Contacto (opcional)" : "Dirección (opcional)"}
                  </Label>
                  <Input
                    id="entity-extra"
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    className="h-11"
                    placeholder={kind === "client" ? "Nombre de quien coordina" : "Calle, ciudad"}
                  />
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Si ya existe con ese nombre, lo vinculamos en lugar de duplicarlo.
                </p>
                <Button className="h-11 w-full rounded-xl" onClick={handleCreate} disabled={busy}>
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
