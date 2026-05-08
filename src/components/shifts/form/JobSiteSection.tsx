/**
 * JobSiteSection — protagonist card. The main work address.
 *
 * Owns:
 *  - Saved location (Location row)
 *  - Premium structured Job Site (locations_v2 → job_site_location_id)
 *  - Worker-facing notes ("indicaciones para llegar" → special_instructions)
 *  - "Open in Google Maps" link when an address is available
 *
 * Meeting points are NOT in this card. They live in MeetingPointsSection.
 */
import { memo } from "react";
import { MapPin, FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "./section-card";
import { SingleLocationPicker } from "../ShiftLocationsSection";
import type { LocationOption } from "../ShiftFormFields";

interface Props {
  companyId: string | null;
  locationId: string;
  jobSiteLocationId: string | null;
  specialInstructions: string;
  locations: LocationOption[];
  onChange: (patch: {
    locationId?: string;
    jobSiteLocationId?: string | null;
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
  specialInstructions,
  onChange,
}: Props) {
  return (
    <SectionCard
      icon={MapPin}
      title="Job Site"
      subtitle="Dirección principal donde se realizará el trabajo."
      variant="hero"
    >
      {/* Premium structured Job Site — official source of truth.
          The legacy "saved location" dropdown was removed to avoid duplicate
          inputs; reuse of saved locations is already available inside the
          picker (Reutilizar list). */}
      {companyId && (
        <SingleLocationPicker
          label="Job Site"
          icon={MapPin}
          helper="No hay Job Site asignado."
          companyId={companyId}
          type="job_site"
          selectedId={jobSiteLocationId}
          onSelect={(id) => onChange({ jobSiteLocationId: id })}
          emptyCtaLabel="Asignar Job Site"
          changeCtaLabel="Cambiar ubicación"
        />
      )}

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
          Visible para el equipo en su portal — solo del Job Site, no del meeting point.
        </p>
      </div>
    </SectionCard>
  );
}

export const JobSiteSection = memo(JobSiteSectionImpl);

