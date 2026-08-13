/**
 * RESPONSIBILITY CARD — el perfil de acceso hablado en lenguaje de negocio.
 * Solo lectura: no edita permisos, no escribe nada. Lee `operating-model.ts`.
 */
import { Badge } from "@/components/ui/badge";
import { Check, ArrowDown, ArrowRight, Minus } from "lucide-react";
import {
  getResponsibility,
  operatingChainFor,
  roleLabel,
  scopeLabelOf,
  visibleAliases,
  type CanonicalRoleKeyLike,
  type OperatingPerson,
} from "@/lib/auth/operating-model-types";

interface Props {
  roleKey: string | null;
  /** Nombre visible del rol (puede venir renombrado por la empresa). */
  displayRole: string;
  companyName: string;
  people: readonly OperatingPerson[];
  grantedCount: number;
  overrideCount: number;
}

const names = (list: OperatingPerson[]) =>
  list.length ? list.map((p) => p.name).join(", ") : "Sin responsable asignado";

export function ResponsibilityCard({
  roleKey,
  displayRole,
  companyName,
  people,
  grantedCount,
  overrideCount,
}: Props) {
  const spec = getResponsibility(roleKey);

  if (!spec) {
    return (
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Responsabilidad
        </p>
        <p className="mt-1 text-sm">Acceso personalizado</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Esta persona no coincide con una responsabilidad canónica de {companyName}. Asigna un rol
          principal para que la cadena operativa quede completa.
        </p>
      </div>
    );
  }

  const key = spec.role as CanonicalRoleKeyLike;
  const { upstream, downstream } = operatingChainFor(key, people);
  const aliases = visibleAliases(key);

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Rol operativo
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{displayRole}</p>
          {aliases.map((a) => (
            <Badge key={a} variant="outline" className="text-[9px]">
              {a}
            </Badge>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{spec.mission}</p>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Responsable de
        </p>
        <ul className="mt-1 grid gap-1 sm:grid-cols-2">
          {spec.controls.map((c) => (
            <li key={c} className="flex items-center gap-1.5 text-xs">
              <Check className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{c}</span>
            </li>
          ))}
        </ul>
      </div>

      {spec.notResponsible.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Minus className="h-3 w-3" />
          No responde por: {spec.notResponsible.join(" · ")}
        </p>
      )}

      {/* OPERATING CHAIN — no es jerarquía, es cadena de trabajo */}
      <div className="rounded-lg border bg-background p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Cadena operativa
        </p>
        <div className="mt-2 space-y-2 text-xs">
          <div>
            <p className="text-muted-foreground">Recibe trabajo de</p>
            {upstream.length ? (
              upstream.map((l) => (
                <p key={l.role} className="font-medium">
                  {names(l.people)} <span className="text-muted-foreground">· {l.label}</span>
                </p>
              ))
            ) : (
              <p className="font-medium">Inicia la cadena</p>
            )}
          </div>
          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground">Su responsabilidad</p>
            <p className="font-medium">{spec.delivers}</p>
          </div>
          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground">Entrega trabajo a</p>
            {downstream.length ? (
              downstream.map((l) => (
                <p key={l.role} className="font-medium">
                  {names(l.people)} <span className="text-muted-foreground">· {l.label}</span>
                </p>
              ))
            ) : (
              <p className="font-medium">Cierra la cadena</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Al iniciar sesión ve
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {spec.focus.map((f) => (
            <Badge key={f} variant="secondary" className="text-[10px] font-normal">
              {f}
            </Badge>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Empresa: <strong>{companyName}</strong> · Alcance: <strong>{scopeLabelOf(key)}</strong>
      </p>
      <p className="text-xs text-muted-foreground">
        Acceso efectivo: <strong>{grantedCount} permisos</strong> ·{" "}
        <strong>{overrideCount} excepciones</strong>
      </p>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <ArrowRight className="h-3 w-3" />
        {roleLabel(key)} es la responsabilidad; los permisos solo la implementan.
      </p>
    </div>
  );
}
