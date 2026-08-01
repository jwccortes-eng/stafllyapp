import { describe, it, expect } from "vitest";
import {
  evaluateBurst,
  burstToastMessage,
  isCriticalNotification,
  getNotificationPriority,
  sortByPriorityThenDate,
  BurstWindow,
} from "@/lib/notifications/priority";

describe("F0 notification priority + burst coalescing", () => {
  it("marks no_show_alert and no_clockin_alert as critical", () => {
    expect(isCriticalNotification("no_show_alert")).toBe(true);
    expect(isCriticalNotification("no_clockin_alert")).toBe(true);
    expect(getNotificationPriority("shift_claimable")).toBe("normal");
  });

  it("coalesces 5 notifications in 10s into one grouped toast, sound once", () => {
    let win: BurstWindow = { start: 0, count: 0 };
    const t0 = 1_000_000;
    const results = [0, 1000, 2000, 3000, 4000].map((offset) => {
      const r = evaluateBurst(win, "shift_claimable", t0 + offset);
      win = r.window;
      return r;
    });
    const grouped = results.filter((r) => r.decision.mode === "grouped");
    const sounds = results.filter((r) => r.playSound);
    expect(grouped).toHaveLength(3); // 3rd, 4th, 5th collapse into the same toast id
    expect(sounds).toHaveLength(2); // sound stops once the burst threshold is hit
    expect(burstToastMessage(5)).toBe("5 actualizaciones en tu operación");
  });

  it("never coalesces or silences critical alerts", () => {
    let win: BurstWindow = { start: 0, count: 0 };
    const t0 = 2_000_000;
    for (let i = 0; i < 4; i++) {
      win = evaluateBurst(win, "shift_claimable", t0 + i * 500).window;
    }
    const critical = evaluateBurst(win, "no_show_alert", t0 + 2500);
    expect(critical.decision.mode).toBe("individual");
    expect(critical.playSound).toBe(true);
  });

  it("resets the window after 10s", () => {
    let win: BurstWindow = { start: 0, count: 0 };
    const t0 = 3_000_000;
    for (let i = 0; i < 4; i++) win = evaluateBurst(win, "announcement", t0 + i * 100).window;
    const after = evaluateBurst(win, "announcement", t0 + 11_000);
    expect(after.decision.mode).toBe("individual");
    expect(after.window.count).toBe(1);
  });

  it("sorts unread critical alerts first without dropping anything", () => {
    const items = [
      { id: "a", type: "shift_claimable", created_at: "2026-01-02T00:00:00Z", read_at: null },
      { id: "b", type: "no_show_alert", created_at: "2026-01-01T00:00:00Z", read_at: null },
      { id: "c", type: "announcement", created_at: "2026-01-03T00:00:00Z", read_at: null },
    ];
    const sorted = sortByPriorityThenDate(items);
    expect(sorted[0].id).toBe("b");
    expect(sorted).toHaveLength(3);
  });
});
