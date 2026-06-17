/**
 * ConsentGovernancePanel — admin-facing read-only governance notice that
 * communicates the consent ownership model without reading
 * `worker_consent_records` or any Supabase resource.
 *
 * Pure presentation. No data fetching, no hooks, no actions, no deep-links.
 * The worker remains the sole controller of grant/revoke via /portal/update-center.
 *
 * @status wired in WorkerProfileTab (E3A) — UI-only placeholder, no data reads
 * See: docs/ECOSYSTEM_PROFILE_STANDARD.md
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { ProfileLayerBadge } from "@/components/profile-standard/ProfileLayerBadge";
import { cn } from "@/lib/utils";

interface ConsentGovernancePanelProps {
  className?: string;
}

export function ConsentGovernancePanel({ className }: ConsentGovernancePanelProps) {
  return (
    <Card className={cn("border-dashed", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Consentimientos
          </CardTitle>
          <ProfileLayerBadge layer="L4" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground">
        <p className="leading-relaxed">
          Los consentimientos de marketplace y data sharing son administrados
          directamente por el worker desde su portal. Los admins no pueden
          otorgar ni revocar consentimiento en nombre del worker.
        </p>
        <ul className="space-y-1.5 list-disc pl-4">
          <li>Solo el worker puede otorgar o revocar.</li>
          <li>Admin no puede editar ni impersonar.</li>
          <li>El portal del worker es <span className="font-mono">/portal/update-center</span>.</li>
        </ul>
        <p className="text-[11px] italic pt-1 border-t">
          Visibilidad detallada pendiente de policy tenant-scoped.
        </p>
      </CardContent>
    </Card>
  );
}
