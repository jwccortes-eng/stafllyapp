import { describe, it } from "vitest";
import { normalizeStructuralText } from "@/lib/intake/recovery";
import { parseTextToCandidates, segmentText, resolveDateFromText, normalizePastedText } from "@/lib/intake/text-parser";
const A = "Monday, Aug 10, 2026\n4:00 PM - 9:00 PM\nJob: ELUM FRANKLHALL";
const B = "Imperial Aug 30/31 Sep 1/2/3/4/5/6/7 sin hora definida pero aprox 5pm cantidad de meseros pendientes";
const ctx = { companyId: "c1", batchId: null, source: "text" as const, referenceDate: "2026-08-09" };
describe("audit", () => {
  it("A", () => {
    const norm = normalizeStructuralText(A);
    console.log("NORM:", JSON.stringify(norm));
    const segs = segmentText(normalizePastedText(norm));
    segs.forEach((s: any, i) => console.log("SEG", i, JSON.stringify(s)));
    segs.forEach((s: any, i) => console.log("DATE", i, JSON.stringify(resolveDateFromText(s.text ?? String(s), "2026-08-09"))));
    const r = parseTextToCandidates(norm, ctx);
    r.candidates.forEach(c => console.log("CAND", c.id, c.serviceDate, c.startTime, c.endTime, JSON.stringify(c.venueCandidate.raw)));
  });
  it("B", () => {
    const r = parseTextToCandidates(B, ctx);
    console.log("B n=", r.candidates.length);
    r.candidates.forEach(c => console.log("CAND", c.id, c.serviceDate, c.startTime, c.endTime, "workers=", c.requestedWorkers, JSON.stringify(c.venueCandidate.raw), JSON.stringify(c.clientCandidate.raw)));
    console.log("notices", JSON.stringify(r.notices));
  });
});
