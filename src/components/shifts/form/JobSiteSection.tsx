/**
 * JobSiteSection — premium one-off-first Job Site card.
 *
 * v1 (Shift Location UX v1 — Smart Address Search):
 *   - Primary: smart address search (free text → scheduled_shifts.job_site_address)
 *   - Secondary: "Usar ubicación guardada" (saved locations_v2 row)
 *   - Optional save-for-reuse checkbox (default OFF) to promote a one-off
 *     into a saved location_v2 row.
 *
 * The legacy `location_id` (FK → locations) is no longer surfaced here for
 * new edits — the field stays in the form state for backwards compatibility
 * with existing shifts and reads through `signals.jobSiteLabel`.
 */
import { memo } from "react";
import { MapPin, FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "./section-card";
import { SmartLocationField } from "./SmartLocationField";
import type { LocationOption } from "../ShiftFormFields";

interface Props {
  companyId: string | null;
  locationId: string;
  jobSiteLocationId: string | null;
  jobSiteAddress: string;
  specialInstructions: string;
  locations: LocationOption[];
  onChange: (patch: {
    locationId?: string;
    jobSiteLocationId?: string | null;
    jobSiteAddress?: string;
    specialInstructions?: string;
    meetingPoint?: string;
    clockMethod?: "mobile" | "kiosk" | "both";
    transportRequired?: boolean;
  }) => void;
  onQuickAddLocation?: (name: string, address: string) => Promise<void>;
}

function JobSiteSectionImpl({
  companyId,
  jobSiteLocationId,
  jobSiteAddress,
  specialInstructions,
  onChange,
}: Props) {
  return (
    <SectionCard
      icon={MapPin}
      title="Dirección del trabajo"
      subtitle="Pega la dirección que te envió el cliente o busca en Google. Solo guárdala si la vas a reutilizar."
      variant="hero"
    >
      <SmartLocationField
        companyId={companyId}
        kind="job_site"
        title="Dirección del trabajo"
        helper="Para hoteles, playas, eventos privados o direcciones de WhatsApp."
        freeTextValue={jobSiteAddress}
        savedLocationId={jobSiteLocationId}
        onFreeText={(text) => onChange({ jobSiteAddress: text })}
        onSavedLocation={(id) =>
          onChange({
            jobSiteLocationId: id,
            // When promoting to saved, clear the one-off text so payload is unambiguous
            jobSiteAddress: id ? "" : jobSiteAddress,
          })
        }
        placeholder="Ej: 1601 Broadway, New York, NY 10019"
      />

      <div>
        <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
          <FileText className="h-3 w-3" /> Indicaciones para el trabajador
        </Label>
        <Textarea
          value={specialInstructions}
          onChange={(e) => onChange({ specialInstructions: e.target.value })}
          rows={2}
          placeholder="Ej: Entrar por la puerta lateral, parking en sótano 2…"
          className="text-sm resize-none mt-1"
        />
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Visible para el equipo en su portal — solo del job site, no del punto de encuentro.
        </p>
      </div>
    </SectionCard>
  );
}

export const JobSiteSection = memo(JobSiteSectionImpl);
