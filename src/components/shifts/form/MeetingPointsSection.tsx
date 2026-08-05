/**
 * MeetingPointsSection — punto de encuentro (dónde se reúne el equipo).
 *
 * NUNCA sustituye al "Lugar del servicio". Si ambos coinciden, el operador
 * puede copiarlo explícitamente con la acción "Usar este punto también como
 * lugar del servicio" — nunca se copia en silencio.
 */
import { memo } from "react";
import { Compass, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./section-card";
import { SmartLocationField } from "./SmartLocationField";
import {
  SERVICE_LOCATION_COPY,
  SERVICE_MEETING_POINT_ANCHOR,
} from "@/lib/shifts/service-publish-readiness";

interface Props {
  transportRequired: boolean;
  meetingPoint: string;
  meetingPointLocationId: string | null;
  companyId: string | null;
  /** true cuando aún no hay lugar del servicio definido. */
  jobSiteMissing?: boolean;
  onChange: (patch: {
    meetingPoint?: string;
    meetingPointLocationId?: string | null;
    jobSiteAddress?: string;
    jobSiteLocationId?: string | null;
  }) => void;
}

function MeetingPointsSectionImpl({
  transportRequired,
  meetingPoint,
  meetingPointLocationId,
  companyId,
  jobSiteMissing = false,
  onChange,
}: Props) {
  if (!transportRequired) {
    return (
      <SectionCard
        id={SERVICE_MEETING_POINT_ANCHOR}
        icon={Compass}
        title={SERVICE_LOCATION_COPY.meetingPoint}
        subtitle="Activa transporte si necesitas coordinar un punto de encuentro o drivers."
        variant="muted"
      >
        {null}
      </SectionCard>
    );
  }

  const canReuse = jobSiteMissing && !!meetingPoint.trim();

  return (
    <SectionCard
      id={SERVICE_MEETING_POINT_ANCHOR}
      icon={Compass}
      title={SERVICE_LOCATION_COPY.meetingPoint}
      subtitle={`${SERVICE_LOCATION_COPY.meetingPointHelp} No reemplaza el lugar del servicio.`}
    >
      <SmartLocationField
        companyId={companyId}
        kind="meeting_point"
        title={SERVICE_LOCATION_COPY.meetingPoint}
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

      {canReuse && (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground leading-snug">
            Aún falta el <span className="font-semibold">{SERVICE_LOCATION_COPY.jobSite.toLowerCase()}</span>.
            Si el trabajo se realiza en el mismo punto, cópialo explícitamente.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-[11px]"
            onClick={() =>
              onChange({
                jobSiteAddress: meetingPoint,
                jobSiteLocationId: null,
              })
            }
          >
            <ArrowDownToLine className="h-3.5 w-3.5 mr-1.5" />
            {SERVICE_LOCATION_COPY.reuseMeetingAsJobSite}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

export const MeetingPointsSection = memo(MeetingPointsSectionImpl);
