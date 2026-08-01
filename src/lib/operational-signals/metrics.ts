import type { NotificationFamily, SignalPriority } from "./types";

export interface ShadowDecisionRow {
  id: string;
  company_id: string;
  event_type: string;
  notification_family: string;
  priority: string;
  should_group: boolean;
  requires_acknowledgement: boolean;
  suppress_reason: string | null;
  actual_recipients_count: number;
  recommended_recipients_count: number;
  estimated_noise_reduction: number;
  risk_detected: string[] | null;
  subject_user_id: string | null;
  created_at: string;
}

export interface ShadowMetrics {
  totalEvents: number;
  estimatedNotificationReductionPct: number;
  groupableEvents: number;
  criticalAlerts: number;
  overBroadAudienceEvents: number;
  acknowledgementNeededEvents: number;
  silentCandidates: number;
  overloadedUsers: { userId: string; count: number }[];
  noisiestFamilies: { family: NotificationFamily | string; recipients: number }[];
  priorityBreakdown: Record<SignalPriority, number>;
}

export function computeShadowMetrics(rows: ShadowDecisionRow[]): ShadowMetrics {
  const priorityBreakdown: Record<SignalPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    silent: 0,
  };
  const perUser = new Map<string, number>();
  const perFamily = new Map<string, number>();

  let actualTotal = 0;
  let recommendedTotal = 0;
  let groupable = 0;
  let overBroad = 0;
  let ackNeeded = 0;
  let silent = 0;

  for (const row of rows) {
    actualTotal += row.actual_recipients_count;
    recommendedTotal += row.recommended_recipients_count;
    if (row.should_group) groupable += 1;
    if (row.requires_acknowledgement) ackNeeded += 1;
    if (row.priority === "silent") silent += 1;
    if ((row.risk_detected ?? []).includes("over_broad_audience")) overBroad += 1;
    if (row.priority in priorityBreakdown) {
      priorityBreakdown[row.priority as SignalPriority] += 1;
    }
    if (row.subject_user_id) {
      perUser.set(row.subject_user_id, (perUser.get(row.subject_user_id) ?? 0) + 1);
    }
    perFamily.set(
      row.notification_family,
      (perFamily.get(row.notification_family) ?? 0) + row.actual_recipients_count,
    );
  }

  const reduction =
    actualTotal > 0 ? Math.max(0, (actualTotal - recommendedTotal) / actualTotal) : 0;

  return {
    totalEvents: rows.length,
    estimatedNotificationReductionPct: Math.round(reduction * 1000) / 10,
    groupableEvents: groupable,
    criticalAlerts: priorityBreakdown.critical,
    overBroadAudienceEvents: overBroad,
    acknowledgementNeededEvents: ackNeeded,
    silentCandidates: silent,
    overloadedUsers: [...perUser.entries()]
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    noisiestFamilies: [...perFamily.entries()]
      .map(([family, recipients]) => ({ family, recipients }))
      .sort((a, b) => b.recipients - a.recipients)
      .slice(0, 5),
    priorityBreakdown,
  };
}
