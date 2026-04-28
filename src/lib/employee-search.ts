/**
 * Flexible & safe worker search utilities for staffing UIs.
 *
 * Goals:
 * - Tolerant for real ops typing: "mune", "munera", "johny", "jhionny", "#145".
 * - Never aggressive: must NOT flood the list with unrelated workers.
 * - Deterministic ordering by relevance:
 *   1) exact employer_identification (#145)
 *   2) exact phone match
 *   3) last name token match
 *   4) first name token match
 *   5) alias / phonetic fuzzy match
 *
 * No external deps. Pure functions, easy to unit-test.
 */

export interface SearchableEmployee {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number?: string | null;
  email?: string | null;
  employee_role?: string | null;
  groups?: string | null;
  employer_identification?: string | null;
}

/** Lowercase, strip accents, collapse spaces, drop most punctuation (keep #). */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Phone → digits only. */
export function digitsOnly(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Soft phonetic key for English/Spanish first names typical in our ops.
 * Goal: collapse common typos & spelling variants WITHOUT being aggressive.
 *
 * Rules (applied in order on a normalized lowercase token):
 *  - leading "jh" / "yh" → "j"   (jhionny → jionny, yhonny → jonny)
 *  - "ph"  → "f"
 *  - drop a single trailing "y" only if length > 3 (johnny → johnn, leave "may")
 *  - collapse double consonants (johnn → john, munerra → munera)
 *  - strip vowels NOT at position 0 (john → jhn, munera → mnr)
 *
 * The vowel-strip step is what gives us the alias resilience:
 * "johny", "johnny", "jhonny", "jhony", "jhionny" all collapse to "jhn".
 * "munera" / "muner" / "munerra" collapse to "mnr".
 *
 * IMPORTANT: We only USE this key as a *secondary* match path, AND only when
 * the search token is at least 3 chars and its phonetic key is at least 2 chars,
 * so we never explode the result set on tiny inputs like "a" / "el".
 */
export function phoneticKey(input: string): string {
  let s = normalizeText(input).replace(/\s+/g, "");
  if (!s) return "";
  s = s.replace(/^jh/, "j").replace(/^yh/, "j");
  s = s.replace(/ph/g, "f");
  if (s.length > 3) s = s.replace(/y$/, "");
  s = s.replace(/(.)\1+/g, "$1"); // collapse repeated chars
  if (s.length <= 1) return s;
  const head = s[0];
  const tail = s.slice(1).replace(/[aeiou]/g, "");
  return head + tail;
}

export interface MatchResult {
  /** Lower = more relevant. -1 means no match, filter it out. */
  score: number;
  /** Diagnostic for debug panels. */
  matchedBy:
    | "id_exact"
    | "phone_exact"
    | "last_name"
    | "first_name"
    | "full_name"
    | "email"
    | "phonetic"
    | "substring"
    | "none";
}

/** Score a single employee against a raw search query. -1 → exclude. */
export function scoreEmployee(
  emp: SearchableEmployee,
  rawQuery: string,
): MatchResult {
  const query = (rawQuery ?? "").trim();
  if (!query) return { score: 0, matchedBy: "none" };

  const norm = normalizeText(query);
  const queryDigits = digitsOnly(query);
  // Tokens for substring matching (each token must appear somewhere).
  const tokens = norm.split(/\s+/).filter(Boolean);
  // Strip leading # for ID matching.
  const idQuery = norm.replace(/^#/, "").trim();

  const fn = normalizeText(emp.first_name);
  const ln = normalizeText(emp.last_name);
  const full = `${fn} ${ln}`.trim();
  const empId = (emp.employer_identification ?? "").toString().trim();
  const empPhone = digitsOnly(emp.phone_number);
  const empEmail = normalizeText(emp.email);
  const role = normalizeText(emp.employee_role);
  const groups = normalizeText(emp.groups);

  // 1) Exact employer_identification match (with or without #).
  if (empId && idQuery && (empId === idQuery || `#${empId}` === norm)) {
    return { score: 0, matchedBy: "id_exact" };
  }

  // 2) Phone exact / suffix match — only if query is mostly digits (>=4).
  if (queryDigits.length >= 4 && empPhone) {
    if (empPhone === queryDigits) return { score: 5, matchedBy: "phone_exact" };
    if (empPhone.endsWith(queryDigits)) return { score: 10, matchedBy: "phone_exact" };
  }

  // Tokenized substring match across the canonical haystack.
  // Must match ALL tokens (AND semantics) — keeps results focused.
  const haystack = [full, empEmail, role, groups, empId, `#${empId}`]
    .filter(Boolean)
    .join(" ");

  const allTokensHit =
    tokens.length > 0 && tokens.every((t) => haystack.includes(t));

  if (allTokensHit) {
    // Refine: where did the strongest token land?
    const primary = tokens[0];
    if (ln && ln.includes(primary)) {
      // last name match — strong signal
      return { score: ln.startsWith(primary) ? 20 : 30, matchedBy: "last_name" };
    }
    if (fn && fn.includes(primary)) {
      return { score: fn.startsWith(primary) ? 40 : 50, matchedBy: "first_name" };
    }
    if (full.includes(primary)) {
      return { score: 60, matchedBy: "full_name" };
    }
    if (empEmail && empEmail.includes(primary)) {
      return { score: 70, matchedBy: "email" };
    }
    return { score: 80, matchedBy: "substring" };
  }

  // 3) Phonetic / alias fallback — ONLY for textual queries of length >= 3,
  // single-token, no digits. This protects against flood on short inputs
  // and on numeric searches.
  if (
    tokens.length === 1 &&
    primaryLooksLikeName(tokens[0])
  ) {
    const qKey = phoneticKey(tokens[0]);
    if (qKey.length >= 2) {
      const fnKey = phoneticKey(fn);
      const lnKey = phoneticKey(ln);
      // Require startsWith on the phonetic key — a true alias, not a coincidence.
      if (lnKey && lnKey.startsWith(qKey)) {
        return { score: 100, matchedBy: "phonetic" };
      }
      if (fnKey && fnKey.startsWith(qKey)) {
        return { score: 110, matchedBy: "phonetic" };
      }
    }
  }

  return { score: -1, matchedBy: "none" };
}

function primaryLooksLikeName(token: string): boolean {
  return token.length >= 3 && /^[a-z]+$/.test(token);
}

/** Filter + sort employees by relevance for a given query. Stable. */
export function searchEmployees<T extends SearchableEmployee>(
  employees: T[],
  query: string,
): Array<T & { __match: MatchResult }> {
  if (!query.trim()) {
    return employees.map((e) => ({ ...e, __match: { score: 0, matchedBy: "none" as const } }));
  }
  const scored = employees
    .map((e) => ({ ...e, __match: scoreEmployee(e, query) }))
    .filter((e) => e.__match.score >= 0);
  scored.sort((a, b) => {
    if (a.__match.score !== b.__match.score) return a.__match.score - b.__match.score;
    const al = `${a.last_name ?? ""} ${a.first_name ?? ""}`.toLowerCase();
    const bl = `${b.last_name ?? ""} ${b.first_name ?? ""}`.toLowerCase();
    return al.localeCompare(bl);
  });
  return scored;
}
