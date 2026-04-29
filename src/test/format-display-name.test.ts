import { describe, expect, it } from "vitest";
import { formatDisplayName } from "@/lib/format-helpers";

describe("formatDisplayName", () => {
  it("converts ALL CAPS to Title Case", () => {
    expect(formatDisplayName("ZEMER HALL")).toBe("Zemer Hall");
    expect(formatDisplayName("CHEF KAUFMAN")).toBe("Chef Kaufman");
  });

  it("preserves known acronyms", () => {
    expect(formatDisplayName("VIP PRODUCTION")).toBe("VIP Production");
    expect(formatDisplayName("vip production")).toBe("vip production"); // already lowercased — leave
  });

  it("replaces heavy dash separators with middle-dot", () => {
    expect(formatDisplayName("CHEF KAUFMAN - 3")).toBe("Chef Kaufman · 3");
    expect(formatDisplayName("Passover - Team 2")).toBe("Passover · Team 2");
  });

  it("collapses repeated dashes and pipes", () => {
    expect(formatDisplayName("CHEF KAUFMAN -- 3")).toBe("Chef Kaufman · 3");
    expect(formatDisplayName("CHEF KAUFMAN | 3")).toBe("Chef Kaufman · 3");
  });

  it("keeps already mixed-case strings intact", () => {
    expect(formatDisplayName("Chef Kaufman")).toBe("Chef Kaufman");
    expect(formatDisplayName("McDonald's")).toBe("McDonald's");
  });

  it("returns empty for nullish", () => {
    expect(formatDisplayName(null)).toBe("");
    expect(formatDisplayName(undefined)).toBe("");
    expect(formatDisplayName("")).toBe("");
  });

  it("preserves digits and ids", () => {
    expect(formatDisplayName("EVENT 145")).toBe("Event 145");
    expect(formatDisplayName("CREW #12")).toBe("Crew #12");
  });

  it("does not truncate long names", () => {
    const long = "VIP PRODUCTION COMPANY OF NEW YORK CITY";
    expect(formatDisplayName(long)).toBe("VIP Production Company of New York City");
  });
});
