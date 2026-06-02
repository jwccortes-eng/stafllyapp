/**
 * <SmartWorkCard />
 *
 * Componente PRESENTACIONAL de la Smart Work Card v1.
 *
 * BOUNDARIES (HARD):
 *  - Recibe un ViewModel YA construido. NO hace queries, NO toca Supabase.
 *  - NO toca payroll, time_entries, attendance, closeout, RLS, schema,
 *    auth, Connecteam ni Worker Portal productivo.
 *  - Pago SIEMPRE mostrado como estimado. Nunca verde, nunca "pagado".
 *  - Trabajo # es SECUNDARIO. Nunca protagonista del título.
 *
 * Audiencia: worker | admin
 * Densidad:  compact | standard | full
 *
 * Visualiza únicamente los `visibleBlocks` definidos en el ViewModel.
 *
 * Acciones (onAction, onDirections, onCopyAddress) son opcionales.
 * Si no se proveen, los botones se renderizan en estado "informativo"
 * (sin disparar nada). Esto mantiene el componente seguro para sandbox
 * y previews sin riesgo de side-effects.
 */

import { useState } from "react";
import {
  MapPin,
  Clock,
  Shirt,
  AlertTriangle,
  Users,
  Copy as CopyIcon,
  Navigation,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  SmartWorkCardViewModel,
  NextActionKind,
} from "@/lib/shifts/smart-work-card";

export interface SmartWorkCardProps {
  vm: SmartWorkCardViewModel;
  className?: string;
  /** Callback opcional cuando el usuario toca la acción principal. */
  onAction?: (kind: NextActionKind) => void;
  /** Callback opcional para "Cómo llegar". */
  onDirections?: () => void;
  /** Callback opcional para "Copiar dirección". Si no se provee y existe
   *  copyText, usa navigator.clipboard como fallback puro de UI. */
  onCopyAddress?: (text: string) => void;
}

// ── Tone helpers (semantic tokens only) ─────────────────────────────────

const STATUS_TONE: Record<
  SmartWorkCardViewModel["status"]["tone"],
  string
> = {
  neutral: "bg-muted text-muted-foreground",
  ok: "bg-primary/10 text-primary",
  warn: "bg-warning/15 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

const LOCATION_BADGE: Record<
  SmartWorkCardViewModel["location"]["badge"],
  string
> = {
  ok: "bg-primary/10 text-primary",
  needs_review: "bg-warning/15 text-warning",
  missing: "bg-destructive/10 text-destructive",
};

// ── Sub-blocks ──────────────────────────────────────────────────────────

function IdentityBlock({
  identity,
  coverageShort,
}: {
  identity: SmartWorkCardViewModel["identity"];
  /** Mini-chip "1/3" para densidades compactas admin. */
  coverageShort?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold leading-tight text-foreground">
          {identity.title}
        </h3>
        {identity.subtitleLine && (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {identity.subtitleLine}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {coverageShort && (
          <span
            className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold leading-none text-warning"
            title="Workers confirmados / requeridos"
            data-testid="coverage-chip"
          >
            {coverageShort}
          </span>
        )}
        {identity.refLabel && (
          <span
            className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            title="Referencia operativa"
          >
            Trabajo {identity.refLabel.replace(/^Ref\s*/i, "")}
          </span>
        )}
      </div>
    </div>
  );
}

function TimingBlock({
  timing,
  density,
}: {
  timing: SmartWorkCardViewModel["timing"];
  density: SmartWorkCardViewModel["density"];
}) {
  const big =
    density === "full" ? "text-4xl" : density === "standard" ? "text-3xl" : "text-2xl";
  const showDuration = density !== "compact";
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p
          className={cn(
            "font-semibold leading-none tracking-tight text-foreground",
            big,
          )}
          style={{ fontFamily: "Sora, Inter, system-ui, sans-serif" }}
        >
          {timing.startLabel}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {timing.endApproxLabel}
        </p>
        {timing.meetingLabel && (
          <p className="mt-0.5 text-[12px] text-foreground/80">
            {timing.meetingLabel}
          </p>
        )}
      </div>
      {showDuration && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {timing.durationLabel}
        </div>
      )}
    </div>
  );
}

function CoverageLine({
  coverage,
}: {
  coverage: NonNullable<SmartWorkCardViewModel["coverage"]>;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2",
        !coverage.complete && "border-warning/30 bg-warning/5",
      )}
      data-testid="coverage-line"
    >
      <Users className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[12px] font-medium text-foreground">
        {coverage.label}
      </span>
      {coverage.pending > 0 && (
        <span className="text-[11px] text-muted-foreground">
          · Pendientes {coverage.pending}
        </span>
      )}
    </div>
  );
}

function LocationBlock({
  location,
  onDirections,
  onCopyAddress,
}: {
  location: SmartWorkCardViewModel["location"];
  onDirections?: () => void;
  onCopyAddress?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!location.copyText) return;
    if (onCopyAddress) {
      onCopyAddress(location.copyText);
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(location.copyText).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <MapPin className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          {location.primaryLine && (
            <p className="truncate text-[13px] font-semibold text-foreground">
              {location.primaryLine}
            </p>
          )}
          {location.addressLine && (
            <p className="truncate text-[12px] text-muted-foreground">
              {location.addressLine}
            </p>
          )}
          {location.meetingPoint && (
            <p className="mt-0.5 text-[12px] text-foreground/80">
              Encuentro: {location.meetingPoint}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                LOCATION_BADGE[location.badge],
              )}
            >
              {location.hint}
            </span>
          </div>
        </div>
      </div>
      {(location.hasDirections || location.copyText) && (
        <div className="mt-2.5 flex gap-2">
          {location.hasDirections && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 flex-1"
              onClick={onDirections}
            >
              <Navigation className="h-3.5 w-3.5" />
              Cómo llegar
            </Button>
          )}
          {location.copyText && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={handleCopy}
            >
              <CopyIcon className="h-3.5 w-3.5" />
              {copied ? "Copiado" : "Copiar"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function UniformBlock({
  uniform,
}: {
  uniform: SmartWorkCardViewModel["uniform"];
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
          <Shirt className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-foreground">Qué llevar</p>
          {uniform.hasInfo ? (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {uniform.instructions ?? "Ver foto de referencia."}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {uniform.hint}
            </p>
          )}
          {uniform.photoUrl && (
            <img
              src={uniform.photoUrl}
              alt="Referencia de uniforme"
              className="mt-2 h-20 w-20 rounded-lg object-cover"
              loading="lazy"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PayBlock({ pay }: { pay: SmartWorkCardViewModel["pay"] }) {
  // Pago SIEMPRE estimado. Ámbar. Nunca verde.
  // Una sola línea: "Estimado · $176.00". Disclaimer debajo.
  return (
    <div
      className="rounded-xl border border-warning/30 bg-warning/5 p-3"
      data-testid="pay-block"
    >
      <p className="text-[13px] font-semibold text-foreground">
        <span className="text-warning">{pay.label}</span>
        {pay.amountLabel ? (
          <>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span>{pay.amountLabel}</span>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {pay.disclaimer}
      </p>
    </div>
  );
}

function StatusBlock({
  status,
}: {
  status: SmartWorkCardViewModel["status"];
}) {
  return (
    <div className="space-y-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
          STATUS_TONE[status.tone],
        )}
      >
        {status.label}
      </span>
      {status.riskHints.length > 0 && (
        <ul className="space-y-0.5">
          {status.riskHints.map((r) => (
            <li
              key={r}
              className="flex items-center gap-1.5 text-[11.5px] text-warning"
            >
              <AlertTriangle className="h-3 w-3" />
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionBlock({
  action,
  onAction,
}: {
  action: SmartWorkCardViewModel["nextAction"];
  onAction?: (kind: NextActionKind) => void;
}) {
  return (
    <Button
      type="button"
      variant={action.emphasis === "primary" ? "default" : "outline"}
      size="sm"
      className="h-10 w-full justify-between"
      disabled={action.disabled}
      title={action.reason}
      onClick={() => onAction?.(action.kind)}
    >
      <span>{action.label}</span>
      <ChevronRight className="h-4 w-4" />
    </Button>
  );
}

// ── Main component ──────────────────────────────────────────────────────

export function SmartWorkCard({
  vm,
  className,
  onAction,
  onDirections,
  onCopyAddress,
}: SmartWorkCardProps) {
  const show = (k: SmartWorkCardViewModel["visibleBlocks"][number]) =>
    vm.visibleBlocks.includes(k);

  const isAdmin = vm.audience === "admin";
  const isCompact = vm.density === "compact";

  // F. Borde ámbar sutil para Pending Accept.
  const pendingAccept =
    vm.status.tone === "warn" && vm.nextAction.kind === "accept";

  // D. Coverage rendering:
  //  - admin compact → mini-chip junto al título.
  //  - admin standard/full → línea con icono y conteo.
  const coverageShort =
    isAdmin && isCompact && vm.coverage && !vm.coverage.complete
      ? vm.coverage.shortLabel
      : null;
  const showCoverageLine =
    isAdmin && !isCompact && vm.coverage !== null;

  return (
    <article
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-4 shadow-sm",
        "flex flex-col gap-3",
        pendingAccept && "border-warning/40 bg-warning/[0.03]",
        className,
      )}
      data-audience={vm.audience}
      data-density={vm.density}
      data-pending-accept={pendingAccept || undefined}
    >
      {show("identity") && (
        <IdentityBlock identity={vm.identity} coverageShort={coverageShort} />
      )}
      {show("timing") && <TimingBlock timing={vm.timing} density={vm.density} />}
      {showCoverageLine && <CoverageLine coverage={vm.coverage!} />}
      {show("location") && (
        <LocationBlock
          location={vm.location}
          onDirections={onDirections}
          onCopyAddress={onCopyAddress}
        />
      )}
      {show("uniform") && <UniformBlock uniform={vm.uniform} />}
      {show("pay") && <PayBlock pay={vm.pay} />}
      {show("status") && <StatusBlock status={vm.status} />}
      {show("action") && (
        <ActionBlock action={vm.nextAction} onAction={onAction} />
      )}
    </article>
  );
}

export default SmartWorkCard;
