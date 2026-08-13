import { it } from "vitest";
import { buildTodayHubModel, FULL_HUB_PERMISSIONS } from "@/lib/command-center/today-hub-model";
it("dbg", () => {
  const m = buildTodayHubModel({
    permissions: FULL_HUB_PERMISSIONS,
    now: new Date("2026-08-01T10:00:00"),
    shifts: [{
      id: "s1", title: "Turno demo", date: "2026-08-01", start_time: "09:00:00", end_time: "20:00:00",
      slots: 2, client_name: "Cliente A", job_site_name: "Sede Norte", shift_ref: "QK-001592",
      pending_claims: 0, transport: { required: false, missing_driver: false, capacity_short: false },
      workers: [
        { employee_id: "e1", name: "Sophia Contreras", assignment_status: "confirmed", clock_state: "none" },
        { employee_id: "e2", name: "William Rodríguez", assignment_status: "confirmed", clock_state: "clocked_in" },
      ],
      ops: { bucket: "in_progress", required: 2, assigned_active: 2, confirmed: 2, clocked_in: 1, open_clocks: 1, missing_clock_outs: 0, not_started: 1 },
    } as any],
  });
  console.log(JSON.stringify(m.alerts.map(a => ({ id: a.id, sev: a.severity, people: a.context.people, ref: a.context.serviceRef, cta: a.cta?.href })), null, 1));
});
