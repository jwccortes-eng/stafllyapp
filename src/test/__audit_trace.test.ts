import { describe, it } from "vitest";
import { runStructuralRecovery } from "@/lib/intake/recovery";
import { parseScheduleText } from "@/lib/intake/text-parser";

const CASE_A = "Monday, Aug 10, 2026\n4:00 PM - 9:00 PM\nJob: ELUM FRANKLHALL";
const CASE_B = "Imperial Aug 30/31 Sep 1/2/3/4/5/6/7 sin hora definida pero aprox 5pm cantidad de meseros pendientes";

describe("audit", () => {
  it("recovery A", () => {
    const r = runStructuralRecovery({ text: CASE_A, companyId: "c1", batchId: null, source: "text", referenceDate: "2026-08-09", sourceReference: "x", failureKind: "unknown" });
    console.log("RECOVERY_A outcome", r.outcome, "n=", r.candidates.length);
    r.candidates.forEach(c => console.log("  cand", c.id, c.serviceDate, c.startTime, c.endTime, JSON.stringify(c.venueCandidate.raw), "notes=", JSON.stringify(c.notes)?.slice(0,80)));
    console.log("  notices", r.notices);
  });
  it("parser A", () => {
    const r = parseScheduleText({ text: CASE_A, companyId: "c1", referenceDate: "2026-08-09", batchId: null } as any);
    console.log("PARSER_A n=", (r as any).candidates?.length);
    (r as any).candidates?.forEach((c: any) => console.log("  cand", c.id, c.serviceDate, c.startTime, c.endTime, JSON.stringify(c.venueCandidate?.raw)));
  });
  it("parser B", () => {
    const r = parseScheduleText({ text: CASE_B, companyId: "c1", referenceDate: "2026-08-09", batchId: null } as any);
    console.log("PARSER_B n=", (r as any).candidates?.length);
    (r as any).candidates?.forEach((c: any) => console.log("  cand", c.serviceDate, c.startTime, c.endTime, c.requestedWorkers, JSON.stringify(c.venueCandidate?.raw)));
  });
});
