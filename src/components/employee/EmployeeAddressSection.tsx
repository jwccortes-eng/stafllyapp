/**
 * EmployeeAddressSection — premium address card for the Employee profile.
 *
 * Behavior:
 *   - Hydrates from `employees.address_structured` (JSONB) when present.
 *   - Falls back to legacy columns (address_line, address_city, …, address)
 *     so existing data renders correctly.
 *   - On change, persists BOTH the JSONB and the legacy columns in sync,
 *     so any code path still reading `address` / `address_line` keeps
 *     working without a single regression.
 *   - Read-only by default; switches to editable when `isEditing` is true.
 */
import { useEffect, useMemo, useState } from "react";
import { Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { PremiumAddressField, AddressPreviewCard } from "@/components/address";
import {
  normalizeFromLegacyColumns,
  recomputeDerived,
  type StructuredAddress,
} from "@/lib/address";
import { toast } from "sonner";

type EmployeeRecord = Record<string, any>;

interface Props {
  employee: EmployeeRecord;
  isEditing: boolean;
  onEmployeeUpdate?: (patch: Partial<EmployeeRecord>) => void;
}

/** Hydrate a StructuredAddress from the employee row (JSONB first, legacy fallback). */
function hydrate(employee: EmployeeRecord): StructuredAddress | null {
  const stored = employee.address_structured as StructuredAddress | null | undefined;
  if (stored && typeof stored === "object" && stored.formatted_address) {
    // Re-derive zone/maps_url in case stored data is stale.
    return recomputeDerived(stored);
  }
  return normalizeFromLegacyColumns({
    address_line: employee.address_line ?? null,
    address_city: employee.address_city ?? null,
    address_state: employee.address_state ?? null,
    address_zip: employee.address_zip ?? null,
    address: employee.address ?? null,
    county: employee.county ?? null,
    latitude: employee.approx_latitude ?? null,
    longitude: employee.approx_longitude ?? null,
  });
}

export function EmployeeAddressSection({ employee, isEditing, onEmployeeUpdate }: Props) {
  const initial = useMemo(() => hydrate(employee), [employee?.id, employee?.address_structured, employee?.address]);
  const [value, setValue] = useState<StructuredAddress | null>(initial);
  const [saving, setSaving] = useState(false);

  // Re-hydrate when the employee changes (e.g. switching profiles).
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  const persist = async (next: StructuredAddress | null) => {
    if (!employee?.id) return;
    setSaving(true);
    try {
      // Sync legacy columns so any pre-existing reader keeps working.
      const patch: Record<string, any> = {
        address_structured: next,
        address: next?.formatted_address ?? null,
        address_line: next?.address_line1 ?? null,
        address_city: next?.city ?? null,
        address_state: next?.state ?? null,
        address_zip: next?.postal_code ?? null,
        county: next?.county ?? employee.county ?? null,
        approx_latitude: next?.latitude ?? employee.approx_latitude ?? null,
        approx_longitude: next?.longitude ?? employee.approx_longitude ?? null,
      };
      const { error } = await (supabase as any)
        .from("employees")
        .update(patch)
        .eq("id", employee.id);
      if (error) throw error;
      onEmployeeUpdate?.(patch);
    } catch (e: any) {
      toast.error("No se pudo guardar la dirección", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (next: StructuredAddress | null) => {
    setValue(next);
    void persist(next);
  };

  // Read-only mode → just show the preview (or a soft empty hint).
  if (!isEditing) {
    if (!value?.formatted_address) {
      return (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5 flex items-center gap-1">
            <Home className="h-3 w-3" /> Dirección
          </h3>
          <Card className="rounded-lg border-dashed border-border/40">
            <CardContent className="p-3 text-center text-[11px] text-muted-foreground/60">
              Sin dirección registrada
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5 flex items-center gap-1">
          <Home className="h-3 w-3" /> Dirección
        </h3>
        <AddressPreviewCard address={value} />
      </div>
    );
  }

  // Edit mode → premium field with autocomplete + manual fallback.
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5 flex items-center gap-1">
        <Home className="h-3 w-3" /> Dirección {saving && <span className="ml-auto text-[9px] text-muted-foreground/60">Guardando…</span>}
      </h3>
      <Card className="rounded-lg border-border/30">
        <CardContent className="p-3">
          <PremiumAddressField
            value={value}
            onChange={handleChange}
            label="Dirección residencial"
            helper="Se usa para asignar trabajos cercanos, sugerir meeting points y agrupar drivers por zona."
            country="US"
          />
        </CardContent>
      </Card>
    </div>
  );
}
