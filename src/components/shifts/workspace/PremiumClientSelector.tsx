/**
 * PremiumClientSelector — searchable client combobox for the desktop Shift Workspace.
 *
 * Schema-free: works only with the existing { id, name } SelectOption shape.
 * - Search by name
 * - Keyboard navigation (cmdk)
 * - Clear selected client
 * - "Cliente pendiente" intentional state
 * - Quick-add hook into existing onQuickAddClient flow
 */
import { memo, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Search, X, AlertCircle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EntityCard } from "@/components/entities/EntityCard";
import { clientAccentColor, clientAccentSoft } from "@/lib/clients/client-accent";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import type { SelectOption } from "../types";

interface Props {
  clientId: string;
  clients: SelectOption[];
  onChange: (clientId: string) => void;
  onQuickAddClient?: (name: string) => Promise<void>;
}

function PremiumClientSelectorImpl({ clientId, clients, onChange, onQuickAddClient }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => clients.find((c) => c.id === clientId) || null,
    [clients, clientId],
  );

  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return clients.slice(0, 50);
    return clients
      .filter((c) => c.name.toLowerCase().includes(normalized))
      .slice(0, 50);
  }, [clients, normalized]);

  const exactExists = useMemo(
    () => clients.some((c) => c.name.trim().toLowerCase() === normalized),
    [clients, normalized],
  );

  const handleQuickAdd = async () => {
    if (!onQuickAddClient || !query.trim() || adding) return;
    setAdding(true);
    try {
      await onQuickAddClient(query.trim());
      setQuery("");
      setOpen(false);
    } finally {
      setAdding(false);
    }
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground font-medium">Cliente</Label>
        {!selected && (
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
          >
            <AlertCircle className="h-2.5 w-2.5" />
            Cliente pendiente
          </Badge>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full mt-1 h-auto min-h-10 py-2 px-3 justify-between text-left font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            {selected ? (
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-7 w-7 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0"
                  style={
                    clientAccentSoft(selected.id)
                      ? { backgroundColor: clientAccentSoft(selected.id), color: clientAccentColor(selected.id) }
                      : undefined
                  }
                >
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {formatDisplayText(selected.name, "name")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Cliente seleccionado</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5" />
                <span className="text-sm">Buscar cliente…</span>
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              {selected && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Quitar cliente"
                  onClick={handleClear}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onChange("");
                    }
                  }}
                  className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              ref={inputRef}
              placeholder="Buscar cliente…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-72">
              <CommandEmpty>
                <div className="px-3 py-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">No encontramos ese cliente</p>
                  <div className="flex flex-col gap-1.5">
                    {onQuickAddClient && query.trim() && !exactExists && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs"
                        onClick={handleQuickAdd}
                        disabled={adding}
                      >
                        {adding ? (
                          <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3 mr-1.5" />
                        )}
                        Crear cliente "{query.trim()}"
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => handleSelect("")}
                    >
                      Dejar cliente pendiente
                    </Button>
                  </div>
                </div>
              </CommandEmpty>

              {filtered.length > 0 && (
                <CommandGroup heading="Clientes">
                  <CommandItem
                    value="__pending__"
                    onSelect={() => handleSelect("")}
                    className="text-xs text-muted-foreground"
                  >
                    <AlertCircle className="h-3.5 w-3.5 mr-2 text-amber-500" />
                    Dejar cliente pendiente
                  </CommandItem>
                  {filtered.map((c) => {
                    const isSelected = c.id === clientId;
                    return (
                      <CommandItem
                        key={c.id}
                        value={c.id}
                        onSelect={() => handleSelect(c.id)}
                        className="p-0"
                      >
                        <EntityCard
                          bare
                          density="compact"
                          kind="client"
                          accentClientId={c.id}
                          name={formatDisplayText(c.name, "name")}
                          code={(c as { client_code?: string | null }).client_code ?? null}
                          entityId={c.id}
                          status={isSelected ? "assigned" : "operational"}
                          selected={isSelected}
                          actions={isSelected ? <Check className="h-3.5 w-3.5 text-primary" /> : undefined}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {onQuickAddClient && query.trim() && !exactExists && filtered.length > 0 && (
                <CommandGroup heading="Acciones">
                  <CommandItem
                    value="__create__"
                    onSelect={handleQuickAdd}
                    disabled={adding}
                  >
                    {adding ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 mr-2" />
                    )}
                    <span className="text-sm">Crear cliente "{query.trim()}"</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {!selected ? (
        <p className="text-[10px] text-muted-foreground/80 mt-1">
          Puedes completar el cliente después. El turno quedará marcado como información pendiente.
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          Ubicaciones frecuentes disponibles según historial del cliente.
        </p>
      )}
    </div>
  );
}

export const PremiumClientSelector = memo(PremiumClientSelectorImpl);
