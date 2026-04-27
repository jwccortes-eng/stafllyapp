/**
 * MeetingPointsSection — separate card for "where the team gathers".
 * Hidden / collapsed when transport is OFF.
 *
 * Currently supports a single meeting point (legacy `meeting_point` text +
 * premium `meeting_point_location_id`). Multiple points are out of scope
 * because they would require a schema change.
 */
import { memo } from "react";
import { Compass, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "./section-card";
import { SingleLocationPicker } from "../ShiftLocationsSection";

interface Props {
  transportRequired: boolean;
  meetingPoint: string;
  meetingPointLocationId: string | null;
  companyId: string | null;
  onChange: (patch: {
    meetingPoint?: string;
    meetingPointLocationId?: string | null;
  }) => void;
}

function buildMapsUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const a = text.trim();
  if (!a) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
}

function MeetingPointsSectionImpl({
  transportRequired,
  meetingPoint,
  meetingPointLocationId,
  companyId,
  onChange,
}: Props) {
  if (!transportRequired) {
    return (
      <SectionCard
        icon={Compass}
        title="Puntos de encuentro"
        subtitle="Activa transporte si necesitas coordinar puntos de encuentro o drivers."
        variant="muted"
      >
        {null}
      </SectionCard>
    );
  }

  const mapsUrl = buildMapsUrl(meetingPoint);

  return (
    <SectionCard
      icon={Compass}
      title="Puntos de encuentro"
      subtitle="Lugares donde los trabajadores se reúnen antes de ir al Job Site."
    >
      <div>
        <Label className="text-[11px] text-muted-foreground font-medium">Punto de encuentro principal</Label>
        <Input
          value={meetingPoint}
          onChange={(e) => onChange({ meetingPoint: e.target.value })}
          placeholder="Ej: Chase Bank 74 & Roosevelt"
          className="h-9 text-sm mt-1"
        />
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Abrir en Google Maps
          </a>
        )}
      </div>

      {companyId && (
        <SingleLocationPicker
          label="Meeting point (premium)"
          icon={Compass}
          helper="Lugar donde el equipo se reúne antes de iniciar el turno."
          companyId={companyId}
          type="meeting_point"
          selectedId={meetingPointLocationId}
          onSelect={(id, addr) =>
            onChange({
              meetingPointLocationId: id,
              meetingPoint: addr ?? meetingPoint,
            })
          }
        />
      )}
    </SectionCard>
  );
}

export const MeetingPointsSection = memo(MeetingPointsSectionImpl);
