/**
 * Ecosystem Intake Engine — FASE 1 / 1.1: creación asistida de entidades.
 *
 * ÚNICO carril de escritura de Clientes, Lugares y Contactos desde intake.
 *
 * REGLAS DURAS
 *  - Nada se crea en silencio: toda función exige `confirmedByHuman: true`.
 *  - Antes de crear, siempre se intenta vincular (idempotencia por nombre
 *    normalizado dentro de la misma empresa).
 *  - Si existe algo PARECIDO, se devuelve `possible_duplicate` y se detiene:
 *    crear igualmente exige `allowDuplicate: true` (segunda confirmación).
 *  - `company_id` viene SIEMPRE del contexto autenticado, nunca del contenido.
 *  - No toca servicios, asignaciones, payroll ni time_entries.
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeEntityName, similarity } from "./entity-resolution";
import { createClientCanonical } from "@/lib/clients/create-client";

export interface AssistedEntity {
  id: string;
  name: string;
  /** Sólo informativo para explicar por qué se parece (dirección, email…). */
  hint?: string | null;
}

export type AssistedOutcome<T> =
  | { status: "linked"; entity: T }
  | { status: "created"; entity: T }
  | { status: "possible_duplicate"; matches: T[] }
  | { status: "blocked"; reason: string }
  | { status: "error"; reason: string };

interface BaseInput {
  companyId: string;
  userId?: string | null;
  /** Obligatorio: la persona confirmó explícitamente esta acción. */
  confirmedByHuman: boolean;
  /** Segunda confirmación explícita tras ver el aviso de posible duplicado. */
  allowDuplicate?: boolean;
}

/** Umbral de "se parece demasiado como para crear sin preguntar". */
export const DUPLICATE_THRESHOLD = 0.82;

function guard(input: BaseInput, name: string): string | null {
  if (!input.companyId) return "missing_company_context";
  if (!input.confirmedByHuman) return "requires_human_confirmation";
  if (!name.trim()) return "empty_name";
  return null;
}

interface CatalogRow {
  id: string;
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Catálogo del tenant. Nunca se consulta sin `company_id`. */
async function loadRows(
  table: "clients" | "locations_v2",
  companyId: string,
): Promise<CatalogRow[]> {
  const columns = table === "clients" ? "id, name" : "id, name, formatted_address";
  const base = (supabase.from(table as any) as any)
    .select(columns)
    .eq("company_id", companyId)
    .limit(500);
  const query = table === "clients" ? base.is("deleted_at", null) : base.eq("is_active", true);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    id: r.id as string,
    name: (r.name ?? "") as string,
    address: (r.formatted_address ?? null) as string | null,
  }));
}

function exactMatch(rows: CatalogRow[], name: string): CatalogRow | null {
  const needle = normalizeEntityName(name);
  if (!needle) return null;
  return rows.find((r) => normalizeEntityName(r.name) === needle) ?? null;
}

/** Coincidencias fuertes que exigen una segunda decisión humana. */
export function nearDuplicates(
  rows: CatalogRow[],
  name: string,
  address?: string | null,
): AssistedEntity[] {
  const needle = normalizeEntityName(name);
  const addrNeedle = normalizeEntityName(address ?? "");
  const out: AssistedEntity[] = [];
  for (const r of rows) {
    const byName = needle ? similarity(needle, normalizeEntityName(r.name)) : 0;
    const byAddress =
      addrNeedle && r.address ? similarity(addrNeedle, normalizeEntityName(r.address)) : 0;
    const score = Math.max(byName, byAddress);
    if (score >= DUPLICATE_THRESHOLD) {
      out.push({
        id: r.id,
        name: r.name,
        hint: byAddress >= byName ? `Misma dirección: ${r.address}` : "Nombre muy parecido",
      });
    }
  }
  return out.slice(0, 5);
}

export interface LinkOrCreateClientInput extends BaseInput {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

/**
 * Vincula si ya existe; crea sólo tras confirmación humana explícita.
 * CLIENT TRUTH LAYER V1: la escritura delega en `createClientCanonical`
 * para que Intake use exactamente las mismas reglas anti-duplicado.
 */
export async function linkOrCreateClient(
  input: LinkOrCreateClientInput,
): Promise<AssistedOutcome<AssistedEntity>> {
  const blocked = guard(input, input.name);
  if (blocked) return { status: "blocked", reason: blocked };

  const rows = await loadRows("clients", input.companyId);
  const exact = exactMatch(rows, input.name);
  if (exact) return { status: "linked", entity: { id: exact.id, name: exact.name } };

  if (!input.allowDuplicate) {
    const matches = nearDuplicates(rows, input.name);
    if (matches.length > 0) return { status: "possible_duplicate", matches };
  }

  const outcome = await createClientCanonical({
    companyId: input.companyId,
    name: input.name,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    notes: input.notes,
    allowDuplicate: input.allowDuplicate,
  });

  if (outcome.status === "created") {
    return { status: "created", entity: { id: outcome.client.id, name: outcome.client.name } };
  }
  if (outcome.status === "exact_match") {
    return { status: "linked", entity: { id: outcome.client.id, name: outcome.client.name } };
  }
  if (outcome.status === "possible_duplicate") {
    const retryRows = await loadRows("clients", input.companyId);
    return { status: "possible_duplicate", matches: nearDuplicates(retryRows, input.name) };
  }
  return { status: "error", reason: outcome.reason };
}


export interface LinkOrCreateVenueInput extends BaseInput {
  name: string;
  /** Dirección tal como la escribió la persona (opcional). */
  formattedAddress?: string | null;
  accessNotes?: string | null;
}

/** Vincula o crea un lugar operativo (`locations_v2`). Nunca en silencio. */
export async function linkOrCreateVenue(
  input: LinkOrCreateVenueInput,
): Promise<AssistedOutcome<AssistedEntity>> {
  const blocked = guard(input, input.name);
  if (blocked) return { status: "blocked", reason: blocked };

  const rows = await loadRows("locations_v2", input.companyId);
  const exact = exactMatch(rows, input.name);
  if (exact) return { status: "linked", entity: { id: exact.id, name: exact.name } };

  if (!input.allowDuplicate) {
    const matches = nearDuplicates(rows, input.name, input.formattedAddress);
    if (matches.length > 0) return { status: "possible_duplicate", matches };
  }

  const { data, error } = await supabase
    .from("locations_v2")
    .insert({
      company_id: input.companyId,
      name: input.name.trim(),
      formatted_address: input.formattedAddress?.trim() || null,
      access_notes: input.accessNotes?.trim() || null,
      location_type: "operational",
      is_active: true,
      created_by: input.userId ?? null,
    } as any)
    .select("id, name")
    .single();

  if (error || !data) {
    const retry = exactMatch(await loadRows("locations_v2", input.companyId), input.name);
    if (retry) return { status: "linked", entity: { id: retry.id, name: retry.name } };
    return { status: "error", reason: error?.message ?? "insert_failed" };
  }
  return {
    status: "created",
    entity: { id: data.id as string, name: (data.name ?? input.name) as string },
  };
}

export interface LinkOrCreateContactInput extends BaseInput {
  clientId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
}

/**
 * Contacto operativo/comercial del cliente. NO es un Worker ni un Passport:
 * vive sólo en `client_contacts`, con scope de empresa y cliente.
 */
export async function linkOrCreateClientContact(
  input: LinkOrCreateContactInput,
): Promise<AssistedOutcome<AssistedEntity>> {
  const blocked = guard(input, input.name);
  if (blocked) return { status: "blocked", reason: blocked };
  if (!input.clientId) return { status: "blocked", reason: "missing_client" };

  const { data: rows } = await supabase
    .from("client_contacts")
    .select("id, name, email, phone")
    .eq("company_id", input.companyId)
    .eq("client_id", input.clientId)
    .is("deleted_at", null)
    .limit(200);

  const list = (rows ?? []) as any[];
  const needle = normalizeEntityName(input.name);
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.replace(/\D/g, "") || null;

  const exact = list.find(
    (r) =>
      normalizeEntityName(r.name ?? "") === needle ||
      (email && (r.email ?? "").toLowerCase() === email) ||
      (phone && (r.phone ?? "").replace(/\D/g, "") === phone),
  );
  if (exact) return { status: "linked", entity: { id: exact.id, name: exact.name } };

  if (!input.allowDuplicate) {
    const matches = list
      .filter((r) => similarity(needle, normalizeEntityName(r.name ?? "")) >= DUPLICATE_THRESHOLD)
      .slice(0, 5)
      .map((r) => ({ id: r.id as string, name: r.name as string, hint: "Nombre muy parecido" }));
    if (matches.length > 0) return { status: "possible_duplicate", matches };
  }

  const { data, error } = await supabase
    .from("client_contacts")
    .insert({
      company_id: input.companyId,
      client_id: input.clientId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      title: input.title?.trim() || null,
      created_by: input.userId ?? null,
    } as any)
    .select("id, name")
    .single();

  if (error || !data) return { status: "error", reason: error?.message ?? "insert_failed" };
  return { status: "created", entity: { id: data.id as string, name: data.name as string } };
}

export const ASSISTED_BLOCK_COPY: Record<string, string> = {
  missing_company_context: "Falta el contexto de empresa.",
  requires_human_confirmation: "Necesitamos tu confirmación explícita antes de crear.",
  empty_name: "Escribe un nombre para poder continuar.",
  missing_client: "Primero vincula o crea el cliente.",
};
