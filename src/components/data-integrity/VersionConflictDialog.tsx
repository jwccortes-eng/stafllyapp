/**
 * P0 — VWC Fase 3: UI ÚNICA DE CONFLICTO.
 *
 * Se usa en cualquier superficie que escriba con `versionedWrite`.
 * Nunca sobrescribe automáticamente ni hace merge automático: el operador
 * decide de forma explícita.
 */
import { useState } from "react";
import { AlertTriangle, Eye, RefreshCw, Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface VersionConflictInfo {
  /** Campos que el operador intentaba guardar. */
  patch: Record<string, any>;
  /** Fila persistida hoy en el backend. */
  serverRow: Record<string, any> | null;
  actualVersion: number | null;
  expectedVersion: number | null;
  updatedAt: string | null;
}

/** Tipo de dato en conflicto: adapta el copy y las acciones permitidas. */
export type ConflictKind = "service" | "hours" | "money";

interface Props {
  open: boolean;
  conflict: VersionConflictInfo | null;
  /** "este servicio", "este turno"… */
  entityLabel?: string;
  fieldLabels?: Record<string, string>;
  busy?: boolean;
  kind?: ConflictKind;
  /**
   * Reaplica mis cambios sobre la versión nueva (acción explícita).
   * En horas y dinero NO se ofrece por defecto: requiere override autorizado.
   */
  onKeepMine?: () => void;
  /** Descarta mis cambios y recarga la versión actual para volver a editar. */
  onReload: () => void;
  onCancel: () => void;
}

const COPY: Record<ConflictKind, { title: (label: string) => string; body: (when: string | null) => string }> = {
  service: {
    title: (label) => `Cambió ${label} mientras lo editabas`,
    body: (when) =>
      `Otra persona guardó una versión más reciente${when ? ` ${when}` : ""}. No guardamos nada para no borrar su trabajo ni el tuyo.`,
  },
  hours: {
    title: () => "Estas horas cambiaron mientras las revisabas",
    body: (when) =>
      `Otra persona actualizó el fichaje${when ? ` ${when}` : ""}. Ninguna hora fue sobrescrita: revisa los cambios y vuelve a editar.`,
  },
  money: {
    title: (label) => `Cambió ${label} mientras la editabas`,
    body: (when) =>
      `Otra persona guardó una versión más reciente${when ? ` ${when}` : ""}. Ningún valor fue sobrescrito.`,
  },
};


function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const min = Math.round(ms / 60000);
  if (min < 1) return "hace menos de un minuto";
  if (min < 60) return `hace ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  return `hace ${Math.round(h / 24)} días`;
}

function display(value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

export function VersionConflictDialog({
  open, conflict, entityLabel = "este servicio", fieldLabels = {},
  busy, onKeepMine, onReload, onCancel,
}: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const fields = Object.keys(conflict?.patch ?? {});
  const when = relativeTime(conflict?.updatedAt ?? null);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {`Cambió ${entityLabel} mientras lo editabas`}
          </DialogTitle>
          <DialogDescription className="text-sm leading-snug">
            Otra persona guardó una versión más reciente{when ? ` ${when}` : ""}. No guardamos nada
            para no borrar su trabajo ni el tuyo.
          </DialogDescription>
        </DialogHeader>

        {showDiff && fields.length > 0 && (
          <div className="rounded-xl border border-border/60 divide-y divide-border/50 text-[12px] max-h-56 overflow-y-auto">
            {fields.map((field) => (
              <div key={field} className="px-3 py-2">
                <p className="font-medium">{fieldLabels[field] ?? field}</p>
                <p className="text-muted-foreground">
                  Ahora: <span className="text-foreground">{display(conflict?.serverRow?.[field])}</span>
                </p>
                <p className="text-muted-foreground">
                  Tu cambio: <span className="text-foreground">{display(conflict?.patch?.[field])}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {fields.length > 0 && (
            <Button
              variant="ghost"
              className="w-full h-11 rounded-xl justify-start gap-2"
              onClick={() => setShowDiff((v) => !v)}
              disabled={busy}
            >
              <Eye className="h-4 w-4" />
              {showDiff ? "Ocultar cambios" : "Ver cambios"}
            </Button>
          )}
          <Button className="w-full h-11 rounded-xl gap-2" onClick={onKeepMine} disabled={busy}>
            <Save className="h-4 w-4" />
            Conservar mis cambios
          </Button>
          <Button variant="outline" className="w-full h-11 rounded-xl gap-2" onClick={onReload} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
            Volver a editar con la versión nueva
          </Button>
          <Button variant="ghost" className="w-full h-11 rounded-xl gap-2" onClick={onCancel} disabled={busy}>
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default VersionConflictDialog;
