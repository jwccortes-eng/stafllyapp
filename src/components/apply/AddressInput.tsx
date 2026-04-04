import { useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Home } from "lucide-react";

interface AddressData {
  address_line: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

interface Props {
  value: AddressData;
  onChange: (v: AddressData) => void;
  required?: boolean;
}

export function AddressInput({ value, onChange, required }: Props) {
  const update = (field: keyof AddressData, v: string) =>
    onChange({ ...value, [field]: v });

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Home className="h-4 w-4 text-muted-foreground" />
        Dirección
        {required && <span className="text-destructive">*</span>}
      </label>
      <div className="space-y-2.5">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Calle y número"
            value={value.address_line}
            onChange={(e) => update("address_line", e.target.value)}
            className="h-12 pl-10 text-base md:text-sm rounded-xl"
            autoComplete="street-address"
          />
        </div>
        <div className="grid grid-cols-5 gap-2">
          <Input
            placeholder="Ciudad"
            value={value.address_city}
            onChange={(e) => update("address_city", e.target.value)}
            className="h-10 text-sm rounded-xl col-span-2"
            autoComplete="address-level2"
          />
          <Input
            placeholder="Estado"
            value={value.address_state}
            onChange={(e) => update("address_state", e.target.value)}
            className="h-10 text-sm rounded-xl col-span-2"
            autoComplete="address-level1"
          />
          <Input
            placeholder="ZIP"
            value={value.address_zip}
            onChange={(e) => update("address_zip", e.target.value)}
            className="h-10 text-sm rounded-xl col-span-1"
            autoComplete="postal-code"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Tu dirección nos ayuda a asignarte trabajos cercanos
      </p>
    </div>
  );
}

export type { AddressData };
