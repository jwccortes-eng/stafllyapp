/**
 * buildPrePublishReview — pure helper that assembles the data needed by
 * the "Antes de publicar" review modal (Phase 4).
 *
 * Pure / read-only. No DB access. No side effects.
 */
import { computeShiftPendingFlags } from "./pending-flags";
import { buildShiftDisplayName } from "./display-name";
import type { ReadinessBlocker } from "./service-publish-readiness";
import type { PrePublishReviewData } from "@/components/shifts/workspace/PrePublishDialog";
import { resolveServiceLocationTruth } from "./service-location";

export interface BuildPrePublishInput {
  manualTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingTime: string;
  clientId: string;
  locationId: string;
  jobSiteLocationId: string | null;
  /** Free-text manual address typed by the operator (one-off Job Site). */
  jobSiteAddress?: string;
  meetingPoint: string;
  meetingPointLocationId: string | null;
  transportRequired: boolean;
  claimable: boolean;
  assignedCount: number;
  slotsNum: number;
  clientName: string | null;
  jobSiteLabel: string | null;
  meetingPointLabel: string | null;
  /** Bloqueos canónicos de publicación (getServicePublishReadiness). */
  blockers?: ReadinessBlocker[];
}

export function buildPrePublishReview(v: BuildPrePublishInput): PrePublishReviewData {
  const pending = computeShiftPendingFlags({
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    clientId: v.clientId,
    locationId: v.locationId,
    jobSiteLocationId: v.jobSiteLocationId,
    jobSiteAddress: v.jobSiteAddress,
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
  // P0 Service Location SSOT — misma verdad que el editor y las listas.
  const loc = resolveServiceLocationTruth({
    location_id: v.locationId,
    job_site_location_id: v.jobSiteLocationId,
    job_site_address: v.jobSiteAddress,
    meeting_point: v.meetingPoint,
    meeting_point_location_id: v.meetingPointLocationId,
    transportation_required: v.transportRequired,
  });
  const jobsiteMissing = loc.destinationStatus === "MISSING_DESTINATION";
  const meetingMissing = loc.meetingPointMissing;

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
    blockers: v.blockers ?? [],
  };
}
