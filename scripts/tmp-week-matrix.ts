import { getCalendarServiceIdentity } from "@/lib/shifts/calendar-service-identity";
import { getServiceLifecycleReadiness } from "@/lib/shifts/service-lifecycle-readiness";

const rows: any[] = [
  { shift_ref: "QK-001577", date: "2026-08-13", title: "Luminance", publication_status: "draft", start_time: "16:00:00", end_time: "23:59:00", slots: 2, client_id: null, client_name: null, job_site_address: "Luminance", notes: "Luminance Aug 13", assigned: 2, claimable: false },
  { shift_ref: "QK-001578", date: "2026-08-18", title: "Luminance", publication_status: "published", start_time: "00:08:00", end_time: "00:09:00", slots: 1, client_id: "c", client_name: "LUMINANCE HALL", job_site_address: "Luminance", notes: "Luminance Aug 18", assigned: 2, claimable: false },
  { shift_ref: "QK-001579", date: "2026-08-18", title: "Imperial", publication_status: "draft", start_time: "00:08:00", end_time: "00:09:00", slots: 2, client_id: "c", client_name: "IMPERIAL HALL", job_site_address: "Imperial", notes: "Imperial Aug 18", assigned: 0, claimable: true },
  { shift_ref: "QK-001581", date: "2026-08-30", title: "Imperial — Imperial", publication_status: "published", start_time: "17:00:00", end_time: "17:00:00", slots: null, client_id: "c", client_name: "IMPERIAL HALL", job_site_address: "Imperial", notes: "Aug 30/31\n\n[Intake pendiente]\n- Venue detectado: Imperial — pendiente de vincular\n- Hora de fin pendiente de confirmar\n- Cantidad de personal pendiente", assigned: 1, claimable: true },
  { shift_ref: "QK-001582", date: "2026-08-31", title: "Imperial — Imperial", publication_status: "draft", start_time: "17:00:00", end_time: "17:00:00", slots: null, client_id: "c", client_name: "IMPERIAL HALL", job_site_address: "Imperial", notes: "Aug 30/31\n\n[Intake pendiente]\n- Venue detectado: Imperial — pendiente de vincular\n- Hora de fin pendiente de confirmar\n- Cantidad de personal pendiente", assigned: 1, claimable: false },
  { shift_ref: "QK-001583", date: "2026-09-01", title: "Imperial — Imperial", publication_status: "draft", start_time: "17:00:00", end_time: "17:00:00", slots: null, client_id: "c", client_name: "IMPERIAL HALL", job_site_address: "Imperial", notes: "Sep 1/2/3/4/5/6/7\n\n[Intake pendiente]\n- Venue detectado: Imperial — pendiente de vincular\n- Hora de fin pendiente de confirmar\n- Cantidad de personal pendiente", assigned: 2, claimable: false },
];

for (const r of rows) {
  const id = getCalendarServiceIdentity(r, {
    assignedCount: r.assigned,
    clientName: r.client_name,
    locationName: null,
    defaultTimezone: "America/New_York",
  });
  const notes = String(r.notes ?? "");
  const endMissing = notes.includes("Hora de fin pendiente") || r.start_time?.slice(0,5) === r.end_time?.slice(0,5);
  const life = getServiceLifecycleReadiness({
    date: r.date, startTime: r.start_time, endTime: endMissing ? "" : r.end_time,
    title: r.title, clientId: r.client_id ?? "", locationId: "", jobSiteLocationId: null,
    jobSiteAddress: r.job_site_address, meetingPoint: "", meetingPointLocationId: null,
    transportRequired: false, assignedCount: r.assigned, claimable: r.claimable,
    publicationStatus: r.publication_status, slots: r.slots ?? 0, timezone: "America/New_York",
    connecteamJobLabel: r.client_name ?? r.job_site_address, addressLabel: r.job_site_address,
    referenceLabel: r.shift_ref, companyId: "co", originTrace: "manual",
    staffingPending: r.slots == null || notes.includes("Cantidad de personal pendiente"),
    approxStart: notes.includes("Hora de inicio pendiente"),
  } as any);
  console.log("=".repeat(70));
  console.log(r.shift_ref, r.date, r.publication_status, "| time:", id.time.label, "| staffing:", id.staffing.label);
  console.log("draft", life.readyToCreateDraft, "staff", life.readyToStaff, "export", life.readyToExportConnecteam, "publish", life.readyToPublish, "close", life.readyToClose);
  console.log("EXPORT blockers:", life.operational.exportBlockers.map((b) => `${b.code}(${b.field})`).join(", ") || "none");
  console.log("STAFF blockers:", life.gates.staff.blockers.map((b) => b.code).join(", ") || "none");
  console.log("PUBLISH blockers:", life.gates.publish.blockers.map((b) => b.code).join(", ") || "none");
  console.log("calendar connecteam:", id.connecteam.label);
}
