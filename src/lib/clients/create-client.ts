/**
 * CLIENT TRUTH LAYER V1 — único carril de escritura de Clientes.
 *
 * Toda superficie (Clientes, Crear/Editar Servicio, Smart Intake, Bulk Service
 * Creation) crea clientes SÓLO a través de `createClientCanonical`.
 *
 * REGLAS DURAS
 *  - Nombre mínimo suficiente: no exige teléfono, email, dirección, contacto,
 *    venue ni mapping de Connecteam.
 *  - Nunca crea en silencio si hay coincidencia: devuelve `exact_match` o
 *    `possible_duplicate` y espera decisión humana (`allowDuplicate`).
 *  - No fusiona, no borra, no toca servicios ni facturación.
 *  - `company_id` viene siempre del contexto autenticado.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  matchClient,
  type ClientDuplicateWarning,
  type ClientRecord,
} from "./client-truth";

export const CLIENT_SELECT_COLUMNS =
  "id, company_id, name, client_code, aliases, contact_name, contact_email, contact_phone, status, notes, deleted_at, created_at";

export interface CanonicalClient {
  id: string;
  name: string;
  clientCode: string | null;
}

export type CreateClientOutcome =
  | { status: "created"; client: CanonicalClient }
  | { status: "exact_match"; client: CanonicalClient; candidates: ClientDuplicateWarning[] }
  | { status: "possible_duplicate"; candidates: ClientDuplicateWarning[] }
  | { status: "blocked"; reason: string }
  | { status: "error"; reason: string };

export interface CreateClientInput {
  companyId: string;
  /** Único campo obligatorio. */
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  /** Segunda confirmación explícita tras ver el aviso de duplicado. */
  allowDuplicate?: boolean;
}

export async function loadClientCatalog(companyId: string): Promise<ClientRecord[]> {
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_SELECT_COLUMNS)
    .eq("company_id", companyId)
    .limit(1000);
  if (error || !data) return [];
  return data as unknown as ClientRecord[];
}

function toCanonical(row: any): CanonicalClient {
  return { id: row.id as string, name: row.name as string, clientCode: (row.client_code ?? null) as string | null };
}

export async function createClientCanonical(
  input: CreateClientInput,
): Promise<CreateClientOutcome> {
  const name = input.name.trim();
  if (!input.companyId) return { status: "blocked", reason: "missing_company_context" };
  if (!name) return { status: "blocked", reason: "empty_name" };

  const catalog = await loadClientCatalog(input.companyId);
  const match = matchClient(
    { name, email: input.contactEmail, phone: input.contactPhone },
    catalog,
  );

  if (match.status === "EXACT_MATCH" && match.exact && !input.allowDuplicate) {
    return { status: "exact_match", client: toCanonical(match.exact), candidates: match.candidates };
  }
  if (match.status === "POSSIBLE_DUPLICATE" && !input.allowDuplicate) {
    return { status: "possible_duplicate", candidates: match.candidates };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      company_id: input.companyId,
      name,
      contact_name: input.contactName?.trim() || null,
      contact_email: input.contactEmail?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "active",
    } as any)
    .select("id, name, client_code")
    .single();

  if (error || !data) {
    // Carrera A/B: alguien pudo crearlo entre la lectura y la escritura.
    const retry = matchClient({ name }, await loadClientCatalog(input.companyId));
    if (retry.exact) {
      return { status: "exact_match", client: toCanonical(retry.exact), candidates: [] };
    }
    return { status: "error", reason: error?.message ?? "insert_failed" };
  }
  return { status: "created", client: toCanonical(data) };
}
