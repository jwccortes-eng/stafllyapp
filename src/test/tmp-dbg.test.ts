import { it } from "vitest";
import { parseTextToCandidates } from "@/lib/intake/text-parser";
it("dbg", () => {
  const t = `Shift details
Monday, Aug 10, 2026
Start 4:00 PM
End 9:00 PM
Job: ELUM FRANKLHALL`;
  const r = parseTextToCandidates(t, { companyId: "c", batchId: null, source: "image", referenceDate: "2026-08-09" });
  console.log(JSON.stringify(r.candidates.map(c => ({ d: c.serviceDate, s: c.startTime, e: c.endTime, v: c.venueCandidate.raw, raw: (c as any).sourceReference })), null, 1));
  const r2 = parseTextToCandidates("Aug 10 2026 4:00 PM - 9:00 PM ELUM FRANKLHALL", { companyId: "c", batchId: null, source: "image", referenceDate: "2026-08-09" });
  console.log(JSON.stringify(r2.candidates.map(c => ({ d: c.serviceDate, s: c.startTime, e: c.endTime, v: c.venueCandidate.raw }))));
});
