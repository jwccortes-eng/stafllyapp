/**
 * MeetingPointsSection — premium one-off-first Meeting Point card.
 * Hidden / muted when transport is OFF.
 *
 * v1: same SmartLocationField pattern as JobSite. Free text is written to
 * the existing `meeting_point` column. Saved-location pick mirrors its
 * address into the text field so worker portal / notifications keep working.
 */
import { memo } from "react";
import { Compass } from "lucide-react";
import { SectionCard } from "./section-card";
import { SmartLocationField } from "./SmartLocationField";

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
        title="Punto de encuentro"
        subtitle="Activa transporte si necesitas coordinar un punto de encuentro o drivers."
        variant="muted"
      >
        {null}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={Compass}
      title="Punto de encuentro"
      subtitle="Lugar donde el equipo se reúne antes de ir al job site."
    >
      <SmartLocationField
        companyId={companyId}
        kind="meeting_point"
        title="Punto de encuentro"
        helper="Pega o busca la dirección. Solo guárdala si la vas a reutilizar."
        freeTextValue={meetingPoint}
        savedLocationId={meetingPointLocationId}
        onFreeText={(text) => onChange({ meetingPoint: text })}
        onSavedLocation={(id, addr) =>
          onChange({
            meetingPointLocationId: id,
            // Mirror saved location's address into legacy text so portal/notifications keep working
            meetingPoint: addr ?? (id ? meetingPoint : ""),
          })
        }
        placeholder="Ej: Chase Bank 74 & Roosevelt"
      />
    </SectionCard>
  );
}

export const MeetingPointsSection = memo(MeetingPointsSectionImpl);
