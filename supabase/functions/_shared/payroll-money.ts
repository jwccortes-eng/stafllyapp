// Parseo monetario explícito y auditable para cierres de nómina externos.
// Regla: nunca interpretar texto arbitrario en silencio. Si el valor no se puede
// convertir con seguridad, se devuelve ok=false y la fila queda en revisión humana.

export interface MoneyParseResult {
  ok: boolean;
  value: number;
  raw: string;
  /** "empty" | "number" | "currency_text" | "parenthesis_negative" | "unsafe" */
  kind: string;
  note?: string;
}

// Palabras de moneda aceptadas explícitamente (el archivo real trae "52 DOLARES").
const CURRENCY_WORDS = [
  "dolares", "dolar", "dollars", "dollar", "usd", "dlls", "dls", "us", "pesos?no",
];

const EMPTY_TOKENS = new Set(["", "-", "--", "—", "n/a", "na", "none", "null", "$", "$-", "0.00", "$0.00"]);

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseMoney(raw: unknown): MoneyParseResult {
  if (raw === null || raw === undefined) {
    return { ok: true, value: 0, raw: "", kind: "empty" };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { ok: false, value: 0, raw: String(raw), kind: "unsafe", note: "Valor numérico inválido" };
    }
    return { ok: true, value: round2(raw), raw: String(raw), kind: "number" };
  }

  const original = String(raw).trim();
  const lower = original.toLowerCase();

  if (EMPTY_TOKENS.has(lower)) {
    return { ok: true, value: 0, raw: original, kind: "empty" };
  }

  // Paréntesis = negativo contable
  let negative = false;
  let work = lower;
  const parenMatch = work.match(/^\((.*)\)$/);
  if (parenMatch) {
    negative = true;
    work = parenMatch[1];
  }

  // Quitar símbolos de moneda y separadores de miles
  work = work
    .replace(/[$\u00a0]/g, "")
    // separador de miles: solo se elimina cuando va entre dígitos (1,037.50)
    .replace(/(\d),(?=\d{3}(\D|$))/g, "$1")
    .replace(/,/g, " ")
    .trim();

  // Extraer el número y verificar que el resto sea únicamente palabra de moneda
  const numMatch = work.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) {
    return { ok: false, value: 0, raw: original, kind: "unsafe", note: "No se encontró un importe numérico" };
  }

  const rest = work.replace(numMatch[0], " ").replace(/[.\s]+/g, " ").trim();
  const restTokens = rest.length ? rest.split(/\s+/) : [];
  const unknownTokens = restTokens.filter((t) => !CURRENCY_WORDS.includes(t));

  if (unknownTokens.length > 0) {
    return {
      ok: false,
      value: 0,
      raw: original,
      kind: "unsafe",
      note: `Texto no reconocido junto al importe: "${unknownTokens.join(" ")}"`,
    };
  }

  let value = parseFloat(numMatch[0]);
  if (!Number.isFinite(value)) {
    return { ok: false, value: 0, raw: original, kind: "unsafe", note: "Importe ilegible" };
  }
  if (negative) value = -Math.abs(value);

  return {
    ok: true,
    value: round2(value),
    raw: original,
    kind: negative ? "parenthesis_negative" : (restTokens.length ? "currency_text" : "number"),
    note: restTokens.length ? `Importe en texto interpretado como ${value}` : undefined,
  };
}

export { round2 };
