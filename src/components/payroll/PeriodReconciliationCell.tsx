import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GitCompareArrows, ExternalLink, Database, Upload, Sparkles, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  periodId: string;
  sourceType?: string | null;
  reconciliationStatus?: string | null;
  lastReconciledAt?: string | null;
}

const SOURCE_META: Record<string, { label: string; icon: any; className: string }> = {
  organic: { label: "Orgánico", icon: Sparkles, className: "bg-muted text-muted-foreground border-border" },
  imported: { label: "Importado", icon: Upload, className: "bg-info/15 text-info border-info/30" },
  reconciled: { label: "Reconciliado", icon: GitCompareArrows, className: "bg-primary/15 text-primary border-primary/30" },
  hybrid: { label: "Híbrido", icon: Layers, className: "bg-accent-warm/15 text-accent-warm border-accent-warm/30" },
};

const RECON_STATUS_META: Record<string, { label: string; className: string }> = {
  importing: { label: "Importando", className: "bg-muted text-muted-foreground" },
  matching: { label: "Matching", className: "bg-info/15 text-info" },
  reviewing: { label: "Revisión", className: "bg-warning/15 text-warning" },
  approved: { label: "Aprobado", className: "bg-earning/15 text-earning" },
  posted: { label: "Publicado", className: "bg-earning/15 text-earning" },
  locked: { label: "Cerrado", className: "bg-muted text-muted-foreground" },
};

/**
 * Inline cell for the Periods table that shows reconciliation source +
 * status mirror, with a quick-jump button into the matching reconciliation
 * session. Reads the denormalized columns on pay_periods (kept in sync
 * via DB triggers).
 */
export default function PeriodReconciliationCell({
  periodId,
  sourceType,
  reconciliationStatus,
  lastReconciledAt,
}: Props) {
  const navigate = useNavigate();
  const source = SOURCE_META[sourceType || "organic"] || SOURCE_META.organic;
  const SourceIcon = source.icon;
  const recon = reconciliationStatus ? RECON_STATUS_META[reconciliationStatus] : null;

  const goToReconciliation = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/app/staged-reconciliation?period=${periodId}`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`text-[10px] gap-1 ${source.className}`}>
              <SourceIcon className="h-3 w-3" />
              {source.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            <p>Origen del periodo: {source.label.toLowerCase()}</p>
            {lastReconciledAt && <p className="text-muted-foreground">Última reconciliación: {new Date(lastReconciledAt).toLocaleString()}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {recon && (
        <Badge variant="outline" className={`text-[10px] ${recon.className}`}>
          {recon.label}
        </Badge>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={goToReconciliation}
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            Abrir en Reconciliation
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
