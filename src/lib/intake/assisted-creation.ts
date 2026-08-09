/**
 * Ecosystem Intake Engine — FASE 1: creación asistida de entidades.
 *
 * ÚNICO carril de escritura de Clientes, Lugares y Contactos desde intake.
 *
 * REGLAS DURAS
 *  - Nada se crea en silencio: toda función exige `confirmedByHuman: true`.
 *  - Antes de crear, siempre se intenta vincular (idempotencia por nombre
 *    normalizado dentro de la misma empresa).
 *  - `company_id` viene SIEMPRE del contexto autenticado, nunca del contenido.
 *  - No toca servicios, asignaciones, payroll ni time_entries.
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeEntityName } from "./entity-resolution";

export type AssistedOutcome<T> =
  | { status: "linked"; entity: T }
  | { status: "created"; entity: T }
  | { status: "blocked"; reason: string }
  | { status: "error"; reason: string };

export interface AssistedEntity {
  id: string;
  name: string;
}

interface BaseInput {
  companyId: string;
  userId?: string | null;
  /** Obligatorio: la persona confirmó explícitamente esta acción. */
  confirmedByHuman: boolean;
}

function guard(input: BaseInput, name: string): string | null {
  if (!input.companyId) return "missing_company_context";
  if (!input.confirmedByHuman) return "requires_human_confirmation";
  if (!name.trim()) return "empty_name";
  return null;
}

/** Busca en el catálogo del tenant por nombre normalizado. */
async function findExisting(
  table: "clients" | "locations_v2",
  companyId: string,
  name: string,
): Promise<AssistedEntity | null> {
  const needle = normalizeEntityName(name);
  if (!needle) return null;

  let query = supabase.from(table).select("id, name").eq("company_id", companyId).limit(200);
  if (table === "clients") query = query.is("deleted_at", null);
  else query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error || !data) return null;
  const hit = (data as any[]).find((row) => normalizeEntityName(row.name ?? "") === needle);
  return hit ? { id: hit.id as string, name: (hit.name ?? name) as string } : null;
}

export interface LinkOrCreateClientInput extends BaseInput {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

/** Vincula si ya existe; crea sólo tras confirmación humana explícita. */
export async function linkOrCreateClient(
  input: LinkOrCreateClientInput,
): Promise<AssistedOutcome<AssistedEntity>> {
  const blocked = guard(input, input.name);
  if (blocked) return { status: "blocked", reason: blocked };

  const existing = await findExisting("clients", input.companyId, input.name);
  if (existing) return { status: "linked", entity: existing };

  const { data, error } = await supabase
    .from("clients")
    .insert({
      company_id: input.companyId,
      name: input.name.trim(),
      contact_name: input.contactName?.trim() || null,
      contact_email: input.contactEmail?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "active",
    } as any)
    .select("id, name")
    .single();

  if (error || !data) return { status: "error", reason: error?.message ?? "insert_failed" };
  return { status: "created", entity: { id: data.id as string, name: data.name as string } };
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

  const existing = await findExisting("locations_v2", input.companyId, input.name);
  if (existing) return { status: "linked", entity: existing };

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

  if (error || !data) return { status: "error", reason: error?.message ?? "insert_failed" };
  return { status: "created", entity: { id: data.id as string, name: (data.name ?? input.name) as string } };
}

export interface LinkOrCreateContactInput extends BaseInput {
  clientId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
}

/** Contacto de cliente. Requiere un cliente ya vinculado o creado. */
export async function linkOrCreateClientContact(
  input: LinkOrCreateContactInput,
): Promise<AssistedOutcome<AssistedEntity>> {
  const blocked = guard(input, input.name);
  if (blocked) return { status: "blocked", reason: blocked };
  if (!input.clientId) return { status: "blocked", reason: "missing_client" };

  const { data: rows } = await supabase
    .from("client_contacts")
    .select("id, name")
    .eq("company_id", input.companyId)
    .eq("client_id", input.clientId)
    .is("deleted_at", null)
    .limit(200);

  const needle = normalizeEntityName(input.name);
  const hit = (rows ?? []).find((r: any) => normalizeEntityName(r.name ?? "") === needle);
  if (hit) return { status: "linked", entity: { id: hit.id as string, name: hit.name as string } };

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
