/**
 * BÚSQUEDA DE SERVICIOS POR PERSONA — fuente única
 * ================================================
 *
 * Origen: addendum "William Rodríguez visibility / search regression".
 *
 * Problema demostrado: la grilla de /app/shifts se alimenta de
 * `shifts + assignments + roster`, pero el buscador sólo miraba
 * `title` y la referencia del turno. Escribir "william" no coincidía con
 * ningún título, la grilla quedaba vacía y la persona desaparecía de la
 * vista por Equipo aunque estuviera asignada.
 *
 * Regla: el buscador debe operar sobre EL MISMO dataset que la grilla y
 * conocer a las personas asignadas, incluidas las fichas fusionadas
 * (una asignación histórica puede colgar de una ficha sombra: la persona
 * es la misma y debe encontrarse igual).
 *
 * Sólo lectura. No consulta la base de datos: indexa lo que ya está en memoria.
 */

/** Minúsculas sin acentos ni signos: "Duván" → "duvan". */
export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Sólo dígitos, para comparar teléfonos escritos de cualquier forma. */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export interface SearchablePerson {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  employer_identification?: string | number | null;
  /** Ficha canónica cuando esta es una sombra fusionada. */
  merged_into_employee_id?: string | null;
}

export interface SearchableAssignment {
  shift_id: string;
  employee_id: string;
  status?: string | null;
}

/** Tokens de texto y de dígitos por los que una persona puede encontrarse. */
export interface PersonSearchTokens {
  text: string[];
  digits: string[];
}

export function buildPersonTokens(person: SearchablePerson): PersonSearchTokens {
  const first = normalizeSearchText(person.first_name);
  const last = normalizeSearchText(person.last_name);
  const text = [first, last, `${first} ${last}`.trim(), normalizeSearchText(person.email)].filter(
    (t) => t.length > 0,
  );
  const digits = [
    digitsOnly(person.phone_number),
    digitsOnly(person.employer_identification != null ? String(person.employer_identification) : ""),
  ].filter((d) => d.length > 0);
  return { text, digits };
}

/** ¿La consulta identifica a esta persona? */
export function personMatchesQuery(tokens: PersonSearchTokens, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return false;
  if (tokens.text.some((t) => t.includes(q))) return true;
  const qDigits = digitsOnly(rawQuery);
  // Los dígitos exigen al menos 3 caracteres para no convertir "1" en un comodín.
  if (qDigits.length >= 3 && tokens.digits.some((d) => d.includes(qDigits))) return true;
  return false;
}

/**
 * Índice `shift_id → personas asignadas`, construido con el mismo dataset que
 * ya renderiza la grilla. Las asignaciones rechazadas/retiradas no cuentan.
 */
export function buildShiftPeopleIndex(
  assignments: SearchableAssignment[],
  people: SearchablePerson[],
): Map<string, PersonSearchTokens[]> {
  const tokensById = new Map<string, PersonSearchTokens>();
  for (const p of people) tokensById.set(p.id, buildPersonTokens(p));

  const index = new Map<string, PersonSearchTokens[]>();
  for (const a of assignments) {
    if (a.status === "removed" || a.status === "rejected") continue;
    const tokens = tokensById.get(a.employee_id);
    if (!tokens) continue;
    const list = index.get(a.shift_id);
    if (list) list.push(tokens);
    else index.set(a.shift_id, [tokens]);
  }
  return index;
}

/** ¿Algún asignado de este turno responde a la búsqueda? */
export function shiftMatchesPersonQuery(
  index: Map<string, PersonSearchTokens[]>,
  shiftId: string,
  rawQuery: string,
): boolean {
  const people = index.get(shiftId);
  if (!people || people.length === 0) return false;
  return people.some((p) => personMatchesQuery(p, rawQuery));
}
