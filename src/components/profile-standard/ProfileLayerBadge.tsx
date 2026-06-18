/**
 * ProfileLayerBadge — presentational chip indicating which profile layer
 * (L1–L4) the current surface is rendering.
 *
 * @status foundation-only — do not wire until E2 approved
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
  // Phase 1C 2026-06-18: hidden on mobile to reduce repeated visual noise.
  // Layer/tenant context lives in the profile hero on mobile.
  return (
    <Badge
      variant="outline"
      className={cn("hidden sm:inline-flex text-[10px] font-medium", className)}
      title={PROFILE_LAYER_DESCRIPTIONS[layer]}
    >
      Capa {layer} · {PROFILE_LAYER_LABELS[layer]}
    </Badge>
  );
}
