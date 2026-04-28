/**
 * Regression tests for the flexible-but-safe worker search engine
 * used by the shift assignment combobox.
 *
 * Pinned cases (real ops typing for "Johny Munera #145"):
 *   mune, munera, johny, jhionny, jhonny, jhony, johnny, #145, 145
 * Anti-flood guards: short queries (a, jo, m) must NOT explode results.
 */
import { describe, it, expect } from "vitest";
import {
  searchEmployees,
  scoreEmployee,
  phoneticKey,
  normalizeText,
  digitsOnly,
  type SearchableEmployee,
} from "@/lib/employee-search";

const johny: SearchableEmployee = {
  id: "emp-johny",
  first_name: "Johny",
  last_name: "Munera",
  employer_identification: "145",
  phone_number: "+1 (305) 555-1145",
  email: "johny@example.com",
};

const carlos: SearchableEmployee = {
  id: "emp-carlos",
  first_name: "Carlos",
  last_name: "Alvarez",
  employer_identification: "414",
  phone_number: "3055559999",
  email: "carlos@example.com",
};

const maria: SearchableEmployee = {
  id: "emp-maria",
  first_name: "Maria",
  last_name: "Gomez",
  employer_identification: "212",
};

const angel: SearchableEmployee = {
  id: "emp-angel",
  first_name: "Angel",
  last_name: "Munera",
  employer_identification: "954",
};

const pedro: SearchableEmployee = {
  id: "emp-pedro",
  first_name: "Pedro",
  last_name: "Jimenez",
  employer_identification: "300",
};

const baseRoster: SearchableEmployee[] = [johny, carlos, maria, angel, pedro];

function ids(rows: { id: string }[]): string[] {
  return rows.map((r) => r.id);
}

describe("normalizeText", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalizeText("  Jürgen   Pérez  ")).toBe("jurgen perez");
  });
  it("drops most punctuation but keeps #", () => {
    expect(normalizeText("#145")).toBe("#145");
    expect(normalizeText("o'connor")).toBe("o connor");
  });
  it("returns empty for null/undefined", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});

describe("digitsOnly", () => {
  it("strips all non-digit chars", () => {
    expect(digitsOnly("+1 (305) 555-1145")).toBe("13055551145");
  });
});

describe("phoneticKey — alias collapsing", () => {
  it("collapses Johny / Johnny / Jhonny / Jhony / Jhionny to the same key", () => {
    const key = phoneticKey("Johny");
    for (const variant of ["johnny", "jhonny", "jhony", "jhionny", "johny"]) {
      expect(key.startsWith(phoneticKey(variant))).toBe(true);
    }
  });

  it("does NOT collapse unrelated names to Johny's key", () => {
    const target = phoneticKey("Johny");
    for (const noise of ["carlos", "maria", "pedro", "alvarez"]) {
      expect(target.startsWith(phoneticKey(noise))).toBe(false);
    }
  });
});

describe("searchEmployees — primary cases for Johny Munera", () => {
  it("finds Johny by 'mune' (last name substring)", () => {
    const out = searchEmployees(baseRoster, "mune");
    expect(ids(out)).toContain("emp-johny");
  });

  it("finds Johny by 'munera'", () => {
    const out = searchEmployees(baseRoster, "munera");
    expect(ids(out)).toContain("emp-johny");
  });

  it("finds Johny by 'johny'", () => {
    const out = searchEmployees(baseRoster, "johny");
    expect(ids(out)).toContain("emp-johny");
  });

  it("finds Johny by phonetic alias variants jhionny/jhonny/jhony/johnny", () => {
    for (const q of ["jhionny", "jhonny", "jhony", "johnny"]) {
      const out = searchEmployees(baseRoster, q);
      expect(ids(out), `query=${q}`).toContain("emp-johny");
    }
  });

  it("ranks Johny FIRST when searching by employer ID '#145' or '145'", () => {
    for (const q of ["#145", "145"]) {
      const out = searchEmployees(baseRoster, q);
      expect(out.length).toBeGreaterThan(0);
      expect(out[0].id, `query=${q}`).toBe("emp-johny");
      expect(out[0].__match.matchedBy).toBe("id_exact");
    }
  });
});

describe("searchEmployees — false-positive guards", () => {
  it("does NOT return Johny when searching 'carlos'", () => {
    const out = searchEmployees(baseRoster, "carlos");
    expect(ids(out)).not.toContain("emp-johny");
    expect(ids(out)).toContain("emp-carlos");
  });

  it("does NOT return Johny when searching 'alvarez'", () => {
    const out = searchEmployees(baseRoster, "alvarez");
    expect(ids(out)).not.toContain("emp-johny");
  });

  it("short single-letter query 'a' does not explode the result set", () => {
    // 'a' is a substring of names — but our token-AND substring path is fine
    // since the search just degenerates to "contains 'a'". The critical
    // guarantee: phonetic fallback must NOT activate (its key would be empty
    // or 1 char) and we don't fabricate matches via phonetic.
    const out = searchEmployees(baseRoster, "a");
    // Must NOT include rows whose match path was 'phonetic' for a 1-char query.
    for (const row of out) {
      expect(row.__match.matchedBy === "phonetic").toBe(false);
    }
  });

  it("short query 'jo' does not phonetic-match unrelated names like 'maria'", () => {
    const out = searchEmployees(baseRoster, "jo");
    expect(ids(out)).not.toContain("emp-maria");
    expect(ids(out)).not.toContain("emp-pedro");
    expect(ids(out)).not.toContain("emp-carlos");
  });

  it("short query 'm' is permissive but never fabricates phonetic matches", () => {
    const out = searchEmployees(baseRoster, "m");
    for (const row of out) {
      expect(row.__match.matchedBy === "phonetic").toBe(false);
    }
  });

  it("numeric query never triggers phonetic fallback", () => {
    const out = searchEmployees(baseRoster, "999");
    for (const row of out) {
      expect(row.__match.matchedBy === "phonetic").toBe(false);
    }
  });
});

describe("scoreEmployee — relevance ordering", () => {
  it("exact ID beats last-name substring", () => {
    const idExact = scoreEmployee(johny, "145");
    const lnSub = scoreEmployee(johny, "mune");
    expect(idExact.score).toBeLessThan(lnSub.score);
  });

  it("last-name match beats first-name match", () => {
    const ln = scoreEmployee(johny, "munera");
    const fn = scoreEmployee(johny, "johny");
    expect(ln.score).toBeLessThan(fn.score);
  });

  it("phonetic match scores worse than direct substring", () => {
    const direct = scoreEmployee(johny, "johny");
    const phonetic = scoreEmployee(johny, "jhionny");
    expect(direct.score).toBeLessThan(phonetic.score);
  });

  it("returns -1 when nothing matches", () => {
    expect(scoreEmployee(johny, "xyzqqq").score).toBe(-1);
  });
});
