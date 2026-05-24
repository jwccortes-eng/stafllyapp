/**
 * QuickCreateWorkspace — premium fast-create layout for the New Shift dialog.
 *
 * Goal: let an operator ship a shift in under 30 seconds. Only the primary
 * fields (client/date/time/slots — already inside ShiftBasicInfoSection)
 * surface immediately. Everything else lives in collapsible groups below so
 * the form feels calm, not like a spreadsheet.
 *
 * v3 — adds optional "Plantilla rápida" chip rail above the primary card.
 * Templates are frontend-only and apply via the existing onPatch path with
 * "fill empty only" semantics, preserving the calendar-selected date/time.
 *
 * Pure layout — no business logic, no state mutations beyond forwarding the
 * template patch to the existing onPatch handler.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { Users, MapPin, Car, DollarSign, Settings2, Sparkles, Check } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ShiftFormState } from "../ShiftFormFields";
import {
  QUICK_TEMPLATES,
  buildTemplatePatch,
  type QuickTemplateId,
} from "./quick-templates";
import { QuickCreateReadinessHints } from "./QuickCreateReadinessHints";

interface Props {
  displayName: string;
  displayNameHint?: string;
  primary: ReactNode;
  team: ReactNode;
  location: ReactNode;
  transportation: ReactNode;
  pay: ReactNode;
  advanced: ReactNode;
  /** Current form state — used for "fill empty only" template semantics. */
  formState: ShiftFormState;
  /** Existing patch handler from ShiftFormFields. No new write paths. */
  onPatch: (patch: Partial<ShiftFormState>) => void;
  /** Parsed slots number for readiness hints. */
  slotsNum: number;
  /** Whether draft save is available in this context. */
  isDraftContext?: boolean;
}

interface GroupDef {
  value: string;
  label: string;
  icon: any;
  hint: string;
  node: ReactNode;
}

export function QuickCreateWorkspace({
  displayName,
  displayNameHint,
  primary,
  team,
  location,
  transportation,
  pay,
  advanced,
  formState,
  onPatch,
}: Props) {
  const [open, setOpen] = useState<string[]>([]);
  const [appliedId, setAppliedId] = useState<QuickTemplateId | null>(null);

  const handleApplyTemplate = (id: QuickTemplateId) => {
    const tpl = QUICK_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    const patch = buildTemplatePatch(formState, tpl);
    if (Object.keys(patch).length === 0) {
      toast.info(`Plantilla "${tpl.label}" no aplicó cambios`, {
        description: "Los campos ya tenían valores propios. No se sobrescribió nada.",
      });
      setAppliedId(id);
      return;
    }
    onPatch(patch);
    setAppliedId(id);
    toast.success(`Plantilla aplicada: ${tpl.label}`, {
      description: "Ajusta los campos como necesites antes de publicar.",
    });
  };

  const groups: GroupDef[] = [
    {
      value: "team",
      label: "Equipo y asignación",
      icon: Users,
      hint: "Opcional por ahora · puedes asignar personal después",
      node: team,
    },
    {
      value: "location",
      label: "Ubicación y punto de encuentro",
      icon: MapPin,
      hint: "Job site, instrucciones y meeting point",
      node: location,
    },
    {
      value: "transportation",
      label: "Transporte",
      icon: Car,
      hint: "Vehículos, capacidad y driver",
      node: transportation,
    },
    {
      value: "pay",
      label: "Pago y compensación",
      icon: DollarSign,
      hint: "Tipo de pago y overrides",
      node: pay,
    },
    {
      value: "advanced",
      label: "Más detalles del turno",
      icon: Settings2,
      hint: "Etiqueta interna, notas, attendance mode y QR",
      node: advanced,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Auto display name banner — desktop only */}
      <div className="hidden lg:block rounded-2xl border border-border/40 bg-gradient-to-br from-muted/30 to-background px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Nombre del turno
        </p>
        <h3 className="text-base font-bold font-heading mt-0.5 leading-tight truncate">
          {displayName}
        </h3>
        {displayNameHint && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{displayNameHint}</p>
        )}
      </div>

      {/* Operator helper */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">Crea el turno rápido.</span>{" "}
          Completa fecha, hora y personal requerido. Puedes asignar equipo,
          transporte y detalles después.
        </p>
      </div>

      {/* Plantilla rápida — optional, frontend-only presets */}
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight">Plantilla rápida</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Empieza con una base y ajusta lo que necesites. Opcional.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold shrink-0">
            Opcional
          </span>
        </div>
        <div className="p-3 flex flex-wrap gap-2">
          {QUICK_TEMPLATES.map((t) => {
            const isApplied = appliedId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleApplyTemplate(t.id)}
                title={t.hint}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  "hover:bg-primary/[0.06] hover:border-primary/40",
                  isApplied
                    ? "bg-primary/10 border-primary/50 text-foreground"
                    : "bg-background border-border/50 text-muted-foreground",
                )}
              >
                <span aria-hidden className="text-[13px] leading-none">
                  {t.emoji}
                </span>
                <span>{t.label}</span>
                {isApplied && <Check className="h-3 w-3 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary — protagonist card, always visible */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5 px-1">
          Esencial
        </p>
        {primary}
      </div>

      {/* Secondary — collapsed by default */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5 px-1">
          Completa después si quieres
        </p>
        <Accordion
          type="multiple"
          value={open}
          onValueChange={setOpen}
          className="space-y-2"
        >
          {groups.map((g) => {
            const Icon = g.icon;
            const isOpen = open.includes(g.value);
            return (
              <AccordionItem
                key={g.value}
                value={g.value}
                className={cn(
                  "rounded-2xl border bg-card overflow-hidden transition-colors",
                  isOpen ? "border-border/60" : "border-border/30",
                )}
              >
                <AccordionTrigger
                  className={cn(
                    "px-4 py-3 hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/30",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold leading-tight">{g.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug truncate">
                        {g.hint}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-3 pb-4 space-y-3">
                  {g.node}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}
