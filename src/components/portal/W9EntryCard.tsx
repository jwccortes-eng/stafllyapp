/**
 * W9EntryCard — small entry banner that points workers to /portal/w9.
 * Read-only fetch of contractor_w9 status; no sensitive data fetched.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ChevronRight, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { cn } from "@/lib/utils";

type W9Status = "approved" | "submitted" | "rejected" | "pending" | null;

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

  const meta =
    status === "approved"
      ? { label: "W-9 aprobado", tone: "earning", Icon: CheckCircle2 }
      : status === "submitted" || status === "pending"
        ? { label: "W-9 en revisión", tone: "warning", Icon: Clock }
        : status === "rejected"
          ? { label: "W-9 rechazado — reenvía", tone: "deduction", Icon: AlertTriangle }
          : { label: "Pendiente de firmar", tone: "warning", Icon: AlertTriangle };

  return (
    <Link
      to="/portal/w9"
      className={cn(
        "block rounded-2xl border bg-card p-3.5 shadow-xs transition-all hover:bg-muted/40",
        "border-border/40",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">Formulario W-9</p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Completa y firma tu W-9 para mantener tu información fiscal actualizada.
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <meta.Icon className={`h-3 w-3 text-${meta.tone}`} />
            <span className={`text-[10.5px] font-semibold text-${meta.tone}`}>{meta.label}</span>
            {signedAt && status === "approved" && (
              <span className="text-[10px] text-muted-foreground/70">
                · firmado {new Date(signedAt).toLocaleDateString("en-US")}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}
