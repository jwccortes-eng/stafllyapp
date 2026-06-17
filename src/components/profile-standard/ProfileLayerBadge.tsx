/**
 * ProfileLayerBadge — presentational chip indicating which profile layer
 * (L1–L4) the current surface is rendering.
 *
 * @status wired in ProfileSummaryGrid (E2)
 *
 * Pure render. No data fetching, no hooks beyond React primitives.
 * See: docs/ECOSYSTEM_PROFILE_STANDARD.md
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PROFILE_LAYER_DESCRIPTIONS,
  PROFILE_LAYER_LABELS,
  type ProfileLayer,
} from "@/lib/profile-layers";

interface ProfileLayerBadgeProps {
  layer: ProfileLayer;
  className?: string;
}

export function ProfileLayerBadge({ layer, className }: ProfileLayerBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium", className)}
      title={PROFILE_LAYER_DESCRIPTIONS[layer]}
    >
      Capa {layer} · {PROFILE_LAYER_LABELS[layer]}
    </Badge>
  );
}
