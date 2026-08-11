import { useState } from "react";
import { Copy, Check, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyInfo } from "@/lib/feedback/notify";
import { INTERNAL_ID_LABEL } from "@/lib/identity/internal-id";

/**
 * FASE 5 — Bloque compacto de Identificadores (solo perfil administrativo).
 *
 * Solo lectura. Nunca se renderiza en el portal del trabajador.
 * El Internal ID es el número de la empresa/pagadora; el resto son
 * identificadores técnicos que sólo un administrador necesita ver.
 */
export interface IdentifiersBlockProps {
  internalId?: string | null;
  employeeUuid: string;
  authUserId?: string | null;
  externalId?: string | null;
  externalLabel?: string;
}

interface Row {
  label: string;
  value: string | null | undefined;
  emphasis?: boolean;
}

export function IdentifiersBlock({
  internalId,
  employeeUuid,
  authUserId,
  externalId,
  externalLabel = "External ID / Connecteam ID",
}: IdentifiersBlockProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const rows: Row[] = [
    { label: INTERNAL_ID_LABEL, value: internalId, emphasis: true },
    { label: "Employee UUID", value: employeeUuid },
    { label: "Auth User ID", value: authUserId },
    { label: externalLabel, value: externalId },
  ].filter((r) => r.emphasis || (r.value != null && String(r.value).trim() !== ""));

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
    } catch (cause) {
      notifyInfo({
        title: "No se pudo copiar",
        fact: `${label} no llegó al portapapeles.`,
        consequence: "Selecciona el valor y cópialo manualmente.",
        cause,
      });
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/80">
        <Fingerprint className="h-3 w-3" />
        Identificadores
      </div>
      <dl className="space-y-1">
        {rows.map((row) => {
          const value = row.value == null || String(row.value).trim() === "" ? null : String(row.value);
          return (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 hover:bg-muted/40"
            >
              <dt
                className={
                  row.emphasis
                    ? "text-[11px] font-semibold text-foreground"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {row.label}
              </dt>
              <dd className="flex min-w-0 items-center gap-1">
                <span
                  className={
                    row.emphasis
                      ? "truncate font-mono text-[12px] font-bold tabular-nums text-foreground"
                      : "truncate font-mono text-[11px] text-muted-foreground"
                  }
                  title={value ?? undefined}
                >
                  {value ?? "Sin asignar"}
                </span>
                {value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    onClick={() => copy(row.label, value)}
                    aria-label={`Copiar ${row.label}`}
                  >
                    {copied === row.label ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground/70">
        Solo lectura. El {INTERNAL_ID_LABEL} pertenece a la operación y es inmutable una vez
        asignado.
      </p>
    </div>
  );
}

export default IdentifiersBlock;
