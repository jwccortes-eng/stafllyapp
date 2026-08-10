/**
 * CLIENT TRUTH LAYER V1 — read model del directorio de Clientes.
 *
 * Lee (sólo lectura) clientes, contactos, lugares, actividad de servicios y
 * estado de mapping Connecteam, y los proyecta al modelo canónico
 * `ClientTruth`. No escribe nada. No toca payroll ni time_entries.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useConnecteamMapping } from "@/hooks/useConnecteamMapping";
import { mappingKey } from "@/lib/integrations/connecteam-mapping";
import { CLIENT_SELECT_COLUMNS } from "@/lib/clients/create-client";
import {
  buildDirectoryMatrix,
  findDuplicatePairs,
  getClientTruth,
  sortActiveFirst,
  type ClientContactSummary,
  type ClientRecord,
  type ClientTruth,
  type ClientVenueSummary,
} from "@/lib/clients/client-truth";

interface RawDirectory {
  clients: ClientRecord[];
  contacts: Record<string, ClientContactSummary[]>;
  venues: Record<string, ClientVenueSummary[]>;
  services: Record<string, { count: number; last: string | null }>;
}

async function fetchDirectory(companyId: string): Promise<RawDirectory> {
  const [clientsRes, contactsRes, venuesRes, shiftsRes] = await Promise.all([
    supabase.from("clients").select(CLIENT_SELECT_COLUMNS).eq("company_id", companyId).limit(1000),
    supabase
      .from("client_contacts")
      .select("id, client_id, name, email, phone, is_primary")
      .eq("company_id", companyId)
      .limit(2000),
    supabase
      .from("locations")
      .select("id, client_id, name, address")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .limit(2000),
    supabase
      .from("scheduled_shifts")
      .select("client_id, shift_date")
      .eq("company_id", companyId)
      .not("client_id", "is", null)
      .limit(5000),
  ]);

  const contacts: RawDirectory["contacts"] = {};
  for (const row of (contactsRes.data ?? []) as any[]) {
    (contacts[row.client_id] ??= []).push({
      id: row.id,
      name: row.name,
      email: row.email ?? null,
      phone: row.phone ?? null,
      isPrimary: Boolean(row.is_primary),
    });
  }

  const venues: RawDirectory["venues"] = {};
  for (const row of (venuesRes.data ?? []) as any[]) {
    if (!row.client_id) continue;
    (venues[row.client_id] ??= []).push({ id: row.id, name: row.name, address: row.address ?? null });
  }

  const services: RawDirectory["services"] = {};
  for (const row of (shiftsRes.data ?? []) as any[]) {
    const entry = (services[row.client_id] ??= { count: 0, last: null });
    entry.count += 1;
    const date = row.shift_date as string | null;
    if (date && (!entry.last || date > entry.last)) entry.last = date;
  }

  return {
    clients: (clientsRes.data ?? []) as unknown as ClientRecord[],
    contacts,
    venues,
    services,
  };
}

export function useClientDirectory() {
  const { selectedCompanyId } = useCompany();
  const { mapping } = useConnecteamMapping();

  const query = useQuery({
    queryKey: ["client-truth-directory", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: () => fetchDirectory(selectedCompanyId!),
    staleTime: 30_000,
  });

  const entries = query.data?.clients ?? [];

  const truths = useMemo<ClientTruth[]>(() => {
    const raw = query.data;
    if (!raw) return [];
    const list = raw.clients.map((client) => {
      const venues = raw.venues[client.id] ?? [];
      const mapped =
        Boolean(mapping.entries[mappingKey("client", client.id)]?.job) ||
        venues.some((v) => Boolean(mapping.entries[mappingKey("location", v.id)]?.job));
      const svc = raw.services[client.id];
      return getClientTruth({
        client,
        contacts: raw.contacts[client.id] ?? [],
        venues,
        serviceCount: svc?.count ?? 0,
        lastServiceAt: svc?.last ?? null,
        connecteamMapped: mapped,
        catalog: raw.clients,
      });
    });
    return sortActiveFirst(list);
  }, [query.data, mapping]);

  const duplicatePairs = useMemo(() => findDuplicatePairs(entries), [entries]);

  const matrix = useMemo(() => {
    const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    return buildDirectoryMatrix(truths, duplicatePairs, since);
  }, [truths, duplicatePairs]);

  return {
    records: entries,
    clients: truths,
    active: truths.filter((c) => c.lifecycle === "active"),
    inactive: truths.filter((c) => c.lifecycle !== "active"),
    duplicatePairs,
    matrix,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
