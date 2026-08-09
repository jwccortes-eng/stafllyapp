/**
 * Smart Service Intake — expansión genérica de listas de fechas.
 *
 * Módulo PURO (cero I/O). Convierte una expresión como:
 *   "Aug 30/31"            → 2026-08-30, 2026-08-31
 *   "Sep 1/2/3/4/5/6/7"    → 7 fechas
 *   "Aug 30, 31"           → 2 fechas
 *   "Aug 30-31"            → 2 fechas (rango explícito)
 *   "Aug 30/31/ Sep 1/2/3" → 5 fechas (dos meses en la misma línea)
 *
 * REGLAS DURAS:
 *  - Genérico: no conoce ningún venue, cliente ni tenant concreto.
 *  - No inventa año: si el texto no lo dice, se infiere por cercanía y se
 *    marca `yearInferred` para que el humano lo revise.
 *  - Un día inválido para el mes (Feb 30) se descarta con motivo, nunca se
 *    corrige en silencio.
 */

const MONTH_TOKENS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

export interface ExpandedDate {
  iso: string;
  /** Fragmento exacto de la fuente que originó esta fecha. */
  matched: string;
  confidence: number;
  yearInferred: boolean;
}

export interface DateExpansion {
  dates: ExpandedDate[];
  /** Todos los fragmentos consumidos (para limpiar el texto del venue). */
  matchedFragments: string[];
  /** Días detectados que no existen en su mes. */
  invalid: string[];
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toISO(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return "";
  return dt.toISOString().slice(0, 10);
}

/** Año que deja la fecha más cerca del futuro respecto a la referencia. */
function inferYear(month: number, day: number, referenceDate: string): number | null {
  const refYear = +referenceDate.slice(0, 4);
  const ref = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const options = [refYear, refYear + 1, refYear - 1]
    .map((y) => ({ y, iso: toISO(y, month, day) }))
    .filter((o) => o.iso);
  if (options.length === 0) return null;
  const future = options
    .filter((o) => new Date(`${o.iso}T00:00:00Z`).getTime() >= ref - 45 * 86400000)
    .sort((a, b) => a.iso.localeCompare(b.iso));
  return (future[0] ?? options[0]).y;
}

const MONTH_NAMES = Object.keys(MONTH_TOKENS).sort((a, b) => b.length - a.length).join("|");

/**
 * Lista de días tras un mes: `30`, `30/31`, `1/2/3`, `30, 31`, `30-31`.
 * Los separadores permitidos son `/`, `,`, `-`, `y`, `and`.
 *
 * `(?!\d)` tras cada día evita el falso positivo confirmado en la auditoría:
 * en "Aug 10, 2026" la coma más "20" del año se leían como un segundo día
 * (20 AGO). Un día real nunca va pegado a más dígitos.
 */
const DAY_TOKEN = `\\d{1,2}(?!\\d)`;
const GROUP_RE = new RegExp(
  `\\b(${MONTH_NAMES})\\.?\\s*` +
    `(${DAY_TOKEN}(?:\\s*(?:[/,]|-|\\band\\b|\\by\\b)\\s*${DAY_TOKEN})*)` +
    `(?!\\s*(?:am|pm|:\\d))`,
  "gi",
);


/**
 * Expande TODAS las listas de días encontradas en un fragmento.
 * Devuelve las fechas en el orden en que aparecen, sin duplicados.
 */
export function expandDateList(segment: string, referenceDate: string): DateExpansion {
  const text = stripAccents(String(segment ?? "").toLowerCase());
  const explicitYear = text.match(/\b(20\d{2})\b/);
  const dates: ExpandedDate[] = [];
  const matchedFragments: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(GROUP_RE)) {
    const month = MONTH_TOKENS[m[1]];
    if (!month) continue;
    const listRaw = m[2];

    // Tokens de día respetando rangos `30-31`.
    const parts = listRaw.split(/\s*(?:[/,]|\band\b|\by\b)\s*/).filter(Boolean);
    const days: number[] = [];
    for (const part of parts) {
      const range = part.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
      if (range) {
        const from = +range[1];
        const to = +range[2];
        if (from >= 1 && to <= 31 && to >= from && to - from <= 31) {
          for (let d = from; d <= to; d++) days.push(d);
        } else {
          invalid.push(part);
        }
        continue;
      }
      const single = part.match(/^\d{1,2}$/);
      if (single) days.push(+part);
      else invalid.push(part);
    }

    if (days.length === 0) continue;
    matchedFragments.push(m[0]);

    for (const day of days) {
      const year = explicitYear ? +explicitYear[1] : inferYear(month, day, referenceDate);
      const iso = year ? toISO(year, month, day) : "";
      if (!iso) {
        invalid.push(`${m[1]} ${day}`);
        continue;
      }
      if (seen.has(iso)) continue;
      seen.add(iso);
      dates.push({
        iso,
        matched: `${m[1]} ${day}`,
        confidence: explicitYear ? 0.95 : 0.88,
        yearInferred: !explicitYear,
      });
    }
  }

  return { dates, matchedFragments, invalid };
}
