/**
 * WorkspaceSummary — composed right-rail for the desktop Shift Workspace.
 *
 * Stacks:
 *   1) Pending-info badges (semaphore)
 *   2) Publish-state descriptor (what happens when you save / publish)
 *   3) Existing <ShiftSummaryPanel/> (live ops validations — unchanged)
 *   4) Worker preview ("Así lo verá el trabajador")
 *
 * Phase 2: UI-only. No DB writes, no notifications, no portal touches.
 */
import { memo, useMemo } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftSummaryPanel } from "../form/ShiftSummaryPanel";
import { PendingBadgeRow } from "./PendingBadgeRow";
import { WorkerPreviewCard } from "./WorkerPreviewCard";
import { ServiceReadinessCard } from "./ServiceReadinessCard";
import { getServiceLifecycleReadiness } from "@/lib/shifts/service-lifecycle-readiness";
import {
  computeShiftPendingFlags,
  describePublishState,
  type PendingTone,
} from "@/lib/shifts/pending-flags";
import type { ReadinessBlocker } from "@/lib/shifts/service-publish-readiness";
import { ServiceCopilotPanel } from "../copilot/ServiceCopilotPanel";
import type { ServiceCopilotResult } from "@/lib/shifts/service-copilot";

interface Props {
  mode: "create" | "edit";
  // From form state
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingTime: string;
  clientId: string;
  locationId: string;
  jobSiteLocationId: string | null;
  jobSiteAddress?: string;
  meetingPoint: string;
  meetingPointLocationId: string | null;
  transportRequired: boolean;
  claimable: boolean;
  // Derived
  clientName: string | null;
  jobSiteLabel: string | null;
  meetingPointLabel: string | null;
  slotsNum: number;
  assignedCount: number;
  ridesNeeded: number;
  driversInTeam: number;
  payTypeLabel: string;
  // Validation signals (live ops)
  dateMissing: boolean;
  adminMissing: boolean;
  adminInvalid: boolean;
  noLocation: boolean;
  noTeam: boolean;
  driverMissing: boolean;
  driversShortage: boolean;
  capacityShortage: boolean;
  hasConflicts: boolean;
  conflictNames: string[];
  payOverrideActive: boolean;
  // Edit-only: real publication_status from DB if present
  publicationStatus?: string | null;
  /** Timezone efectiva del turno (opcional; default tenant). */
  timezone?: string | null;
  /** Bloqueos canónicos de publicación. */
  publishBlockers?: ReadinessBlocker[];
  /**
   * SERVICE COPILOT — cuando se provee, el rail encabeza con UNA sola
   * recomendación y el checklist de lectura. Las tarjetas de semáforo y de
   * compuertas se ocultan para no mostrar cinco recomendaciones a la vez.
   */
  copilot?: ServiceCopilotResult | null;
}

const TONE_BG: Record<PendingTone, string> = {
  urgent: "bg-destructive/5 border-destructive/30",
  warn: "bg-[hsl(var(--status-pending)/0.06)] border-[hsl(var(--status-pending)/0.3)]",
  info: "bg-primary/5 border-primary/30",
  ready: "bg-[hsl(142_76%_36%/0.06)] border-[hsl(142_76%_36%/0.3)]",
};

function WorkspaceSummaryImpl(p: Props) {
  const pending = computeShiftPendingFlags({
    date: p.date,
    startTime: p.startTime,
    endTime: p.endTime,
    clientId: p.clientId,
    locationId: p.locationId,
    jobSiteLocationId: p.jobSiteLocationId,
    jobSiteAddress: p.jobSiteAddress,
    meetingPoint: p.meetingPoint,
    meetingPointLocationId: p.meetingPointLocationId,
    transportRequired: p.transportRequired,
    claimable: p.claimable,
    assignedCount: p.assignedCount,
  });

  const blockers = p.publishBlockers ?? [];
  const publish = describePublishState({
    publicationStatus: p.publicationStatus ?? null,
    claimable: p.claimable,
    isReady: pending.isReady && blockers.length === 0,
  });

  // Readiness canónico: publicar ≠ exportar a Connecteam.
  const operational = useMemo(
    () =>
      getServiceLifecycleReadiness({
        title: p.title,
        date: p.date,
        startTime: p.startTime,
        endTime: p.endTime,
        clientId: p.clientId,
        locationId: p.locationId,
        jobSiteLocationId: p.jobSiteLocationId,
        jobSiteAddress: p.jobSiteAddress,
        meetingPoint: p.meetingPoint,
        meetingPointLocationId: p.meetingPointLocationId,
        transportRequired: p.transportRequired,
        driverIds: Array.from({ length: p.driversInTeam }, (_, i) => String(i)),
        assignedCount: p.assignedCount,
        claimable: p.claimable,
        publicationStatus: p.publicationStatus ?? null,
        slots: p.slotsNum,
        timezone: p.timezone ?? "America/New_York",
        connecteamJobLabel: p.clientName ?? p.jobSiteLabel ?? null,
        addressLabel: (p.jobSiteAddress ?? "").trim() || p.jobSiteLabel || null,
        referenceLabel: p.title,
        staffingPending: !p.slotsNum,
      }),
    [
      p.title, p.date, p.startTime, p.endTime, p.clientId, p.locationId,
      p.jobSiteLocationId, p.jobSiteAddress, p.meetingPoint, p.meetingPointLocationId,
      p.transportRequired, p.driversInTeam, p.assignedCount, p.claimable,
      p.publicationStatus, p.slotsNum, p.timezone, p.clientName, p.jobSiteLabel,
    ],
  );


  const hasManualAddress = !!(p.jobSiteAddress && p.jobSiteAddress.trim());
  const jobsiteMissing = !p.locationId && !p.jobSiteLocationId && !hasManualAddress;
  const meetingMissing =
    p.transportRequired && !p.meetingPoint.trim() && !p.meetingPointLocationId;
  const clientMissing = !p.clientId;
  const timeMissing = !p.startTime || !p.endTime;

  return (
    <div className="space-y-3">
      {/* 0) Copiloto — siguiente paso único + readiness + checklist */}
      {p.copilot && <ServiceCopilotPanel copilot={p.copilot} />}

      {/* 1) Pending badges */}
      {!p.copilot && <PendingBadgeRow flags={pending.flags} />}

      {/* 2) Publish-state descriptor */}
      {!p.copilot && (
      <div
        className={cn(
          "rounded-xl border px-3 py-2.5 flex items-start gap-2",
          TONE_BG[publish.tone],
        )}
      >
        <Send className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-80" />
        <div className="min-w-0">
          <div className="text-[12px] font-semibold leading-tight">{publish.label}</div>
          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
            {publish.description}
          </p>
        </div>
      </div>

      )}

      {/* 3) Publicar ≠ Exportar a Connecteam */}
      {!p.copilot && <ServiceReadinessCard lifecycle={operational} />}

      {/* 4) Existing ops summary (unchanged) */}
      <ShiftSummaryPanel
        mode={p.mode}
        title={p.title}
        clientName={p.clientName}
        date={p.date}
        startTime={p.startTime}
        endTime={p.endTime}
        slotsNum={p.slotsNum}
        assignedCount={p.assignedCount}
        ridesNeeded={p.ridesNeeded}
        transportRequired={p.transportRequired}
        driversInTeam={p.driversInTeam}
        jobSiteLabel={p.jobSiteLabel}
        meetingPointLabel={p.meetingPointLabel}
        dateMissing={p.dateMissing}
        adminMissing={p.adminMissing}
        adminInvalid={p.adminInvalid}
        noLocation={p.noLocation}
        noTeam={p.noTeam}
        driverMissing={p.driverMissing}
        driversShortage={p.driversShortage}
        capacityShortage={p.capacityShortage}
        hasConflicts={p.hasConflicts}
        conflictNames={p.conflictNames}
        payOverrideActive={p.payOverrideActive}
        payTypeLabel={p.payTypeLabel}
        publishBlockers={blockers}
      />


      {/* 4) Worker preview */}
      <WorkerPreviewCard
        clientName={p.clientName}
        date={p.date}
        startTime={p.startTime}
        endTime={p.endTime}
        meetingTime={p.meetingTime}
        jobSiteLabel={p.jobSiteLabel}
        meetingPointLabel={p.meetingPointLabel}
        claimable={p.claimable}
        hasPending={pending.hasPending}
        jobsiteMissing={jobsiteMissing}
        meetingMissing={meetingMissing}
        clientMissing={clientMissing}
        timeMissing={timeMissing}
      />
    </div>
  );
}

export const WorkspaceSummary = memo(WorkspaceSummaryImpl);
