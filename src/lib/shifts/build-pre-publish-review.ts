/**
 * buildPrePublishReview — pure helper that assembles the data needed by
 * the "Antes de publicar" review modal (Phase 4).
 *
 * Pure / read-only. No DB access. No side effects.
 */
import { computeShiftPendingFlags } from "./pending-flags";
import { buildShiftDisplayName } from "./display-name";
import type { PrePublishReviewData } from "@/components/shifts/workspace/PrePublishDialog";

export interface BuildPrePublishInput {
  manualTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingTime: string;
  clientId: string;
  locationId: string;
  jobSiteLocationId: string | null;
  meetingPoint: string;
  meetingPointLocationId: string | null;
  transportRequired: boolean;
  claimable: boolean;
  assignedCount: number;
  slotsNum: number;
  clientName: string | null;
  jobSiteLabel: string | null;
  meetingPointLabel: string | null;
}

export function buildPrePublishReview(v: BuildPrePublishInput): PrePublishReviewData {
  const pending = computeShiftPendingFlags({
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    clientId: v.clientId,
    locationId: v.locationId,
    jobSiteLocationId: v.jobSiteLocationId,
    meetingPoint: v.meetingPoint,
    meetingPointLocationId: v.meetingPointLocationId,
    transportRequired: v.transportRequired,
    claimable: v.claimable,
    assignedCount: v.assignedCount,
  });

  const shiftName = buildShiftDisplayName({
    manualTitle: v.manualTitle,
    clientName: v.clientName,
    startTime: v.startTime,
  });

  const clientMissing = !v.clientId;
  const timeMissing = !v.startTime || !v.endTime;
  const jobsiteMissing = !v.locationId && !v.jobSiteLocationId;
  const meetingMissing =
    v.transportRequired && !v.meetingPoint.trim() && !v.meetingPointLocationId;

  return {
    shiftName,
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    meetingTime: v.meetingTime,
    clientName: v.clientName,
    jobSiteLabel: v.jobSiteLabel,
    meetingPointLabel: v.meetingPointLabel,
    slotsNum: v.slotsNum,
    assignedCount: v.assignedCount,
    claimable: v.claimable,
    flags: pending.flags,
    hasPending: pending.hasPending,
    clientMissing,
    timeMissing,
    jobsiteMissing,
    meetingMissing,
  };
}
