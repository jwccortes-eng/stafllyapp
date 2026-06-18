/**
 * W9EntryCard — entry banner that points workers to /portal/w9.
 *
 * Presentation-only. CTA label adapts to current W-9 status:
 *   - null / pending  → "Firmar W-9"
 *   - submitted / pending review → "Ver estado"
 *   - approved → "Ver W-9"
 *   - rejected → "Corregir W-9"
 *
 * Does NOT change W-9 submission or approval logic.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { StatusPill, type WorkerStatusTone } from "@/components/portal/StatusPill";
import { cn } from "@/lib/utils";

type W9Status = "approved" | "submitted" | "rejected" | "pending" | null;

interface W9Meta {
  pillTone: WorkerStatusTone;
  pillLabel: string;
  cta: string;
}

function resolveMeta(status: W9Status): W9Meta {
  switch (status) {
    case "approved":
      return { pillTone: "approved", pillLabel: "W-9 aprobado", cta: "Ver W-9" };
    case "submitted":
      return { pillTone: "in_review", pillLabel: "W-9 en revisión", cta: "Ver estado" };
    case "rejected":
      return { pillTone: "rejected", pillLabel: "W-9 rechazado", cta: "Corregir W-9" };
    case "pending":
    case null:
    default:
      return { pillTone: "pending", pillLabel: "Pendiente de firmar", cta: "Firmar W-9" };
  }
}

export function W9EntryCard() {
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const [status, setStatus] = useState<W9Status>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveEmployeeId) return;
    (async () => {
      const { data } = await supabase
        .from("contractor_w9")
        .select("status, signed_at")
        .eq("employee_id", effectiveEmployeeId)
        .maybeSingle();
      if (data) {
        setStatus((data.status as W9Status) ?? null);
        setSignedAt(data.signed_at);
      }
    })();
  }, [effectiveEmployeeId]);

  const meta = resolveMeta(status);

  return (
    <Link
      to="/portal/w9"
      className={cn(
        "block rounded-2xl border bg-card p-4 shadow-xs transition-all hover:bg-muted/40 active:scale-[0.99]",
        "border-border/50",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground leading-tight">
            Formulario W-9
          </p>
          <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">
            Necesario para procesar pagos como contratista 1099.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill tone={meta.pillTone} label={meta.pillLabel} />
            {signedAt && status === "approved" && (
              <span className="text-[11.5px] text-muted-foreground">
                · firmado {new Date(signedAt).toLocaleDateString("en-US")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-primary">
          <span className="text-[13px] font-bold">{meta.cta}</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
