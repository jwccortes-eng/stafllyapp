import { useMemo, useState } from "react";
import { useBillingClients, type BillingClient } from "@/hooks/useBillingClients";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Receipt, Plus, Search, Building2, Loader2, Archive, RotateCcw,
  Pencil, Mail, Phone, CreditCard, Hash, Globe2, Link2,
  Check, ChevronsUpDown, X,
} from "lucide-react";
import BillingClientLocationsManager from "@/components/billing/BillingClientLocationsManager";
import { toast } from "sonner";

type StatusFilter = "active" | "inactive" | "all";

const CURRENCIES = ["USD", "EUR", "MXN", "COP", "GBP", "CAD"];
const PAYMENT_TERMS = ["Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Due on receipt"];

interface OpClient { id: string; name: string }

export default function InvoicingClients() {
  const { selectedCompanyId } = useCompany();
  const { clients, isLoading, create, update, setActive } = useBillingClients({ includeInactive: true });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<BillingClient | null>(null);
  const [tab, setTab] = useState<"details" | "locations">("details");

  const { data: opClients = [] } = useQuery({
    queryKey: ["operational-clients-for-billing", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<OpClient[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("company_id", selectedCompanyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as OpClient[];
    },
  });

  const [form, setForm] = useState({
    name: "", legal_name: "", email: "", phone: "", tax_id: "",
    payment_terms: "Net 30", default_currency: "USD", notes: "",
    operational_client_id: null as string | null,
    billing_address_line1: "", billing_address_line2: "",
    billing_city: "", billing_state: "", billing_zip: "", billing_country: "",
  });
  const [opLinkOpen, setOpLinkOpen] = useState(false);

  const resetForm = () => {
    setForm({
      name: "", legal_name: "", email: "", phone: "", tax_id: "",
      payment_terms: "Net 30", default_currency: "USD", notes: "",
      operational_client_id: null,
      billing_address_line1: "", billing_address_line2: "",
      billing_city: "", billing_state: "", billing_zip: "", billing_country: "",
    });
    setEditing(null);
    setTab("details");
  };

  const openNew = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (c: BillingClient) => {
    setEditing(c);
    setForm({
      name: c.name ?? "",
      legal_name: c.legal_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      tax_id: c.tax_id ?? "",
      payment_terms: c.payment_terms ?? "Net 30",
      default_currency: c.default_currency ?? "USD",
      notes: c.notes ?? "",
      operational_client_id: c.operational_client_id ?? null,
      billing_address_line1: c.billing_address_line1 ?? "",
      billing_address_line2: c.billing_address_line2 ?? "",
      billing_city: c.billing_city ?? "",
      billing_state: c.billing_state ?? "",
      billing_zip: c.billing_zip ?? "",
      billing_country: c.billing_country ?? "",
    });
    setTab("details");
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    const payload = { ...form };
    if (editing) {
      await update.mutateAsync({ id: editing.id, patch: payload });
      const updated = clients.find(c => c.id === editing.id);
      if (updated) setEditing(updated);
    } else {
      const created = await create.mutateAsync(payload);
      setEditing(created);
      setTab("locations");
    }
  };

  const filtered = useMemo(() => {
    let list = clients;
    if (statusFilter === "active") list = list.filter(c => c.is_active);
    if (statusFilter === "inactive") list = list.filter(c => !c.is_active);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(s) ||
        (c.legal_name ?? "").toLowerCase().includes(s) ||
        (c.email ?? "").toLowerCase().includes(s) ||
        (c.tax_id ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [clients, search, statusFilter]);

  const counts = useMemo(() => ({
    active: clients.filter(c => c.is_active).length,
    inactive: clients.filter(c => !c.is_active).length,
    total: clients.length,
  }), [clients]);

  const linkedOpClient = opClients.find(c => c.id === form.operational_client_id) ?? null;

  return (
    <div>
      <PageHeader
        variant="1"
        icon={Receipt}
        title="Billing Clients"
        subtitle={`${counts.active} activos · ${counts.inactive} archivados`}
        rightSlot={
          <Button size="sm" onClick={openNew} className="press-scale gap-2">
            <Plus className="h-4 w-4" /> New Client
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email, tax ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList className="h-9">
            <TabsTrigger value="active" className="text-xs">Activos ({counts.active})</TabsTrigger>
            <TabsTrigger value="inactive" className="text-xs">Archivados ({counts.inactive})</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">Todos ({counts.total})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Receipt}
              title={search ? "Sin resultados" : "Aún no tienes clientes de facturación"}
              description={search
                ? "Ajusta tu búsqueda o limpia los filtros."
                : "Crea tu primer cliente para empezar a facturar."}
              action={!search ? (
                <Button onClick={openNew} className="press-scale gap-2">
                  <Plus className="h-4 w-4" /> New Client
                </Button>
              ) : undefined}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Tax ID</TableHead>
                <TableHead>Términos</TableHead>
                <TableHead className="text-right">Moneda</TableHead>
                <TableHead className="text-right">Estado</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => openEdit(c)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/[0.08] flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{c.name}</div>
                        {c.legal_name && c.legal_name !== c.name && (
                          <div className="text-[11px] text-muted-foreground truncate">{c.legal_name}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {c.email && (
                        <div className="text-xs text-foreground flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-muted-foreground" />{c.email}
                        </div>
                      )}
                      {c.phone && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />{c.phone}
                        </div>
                      )}
                      {!c.email && !c.phone && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono">{c.tax_id ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{c.payment_terms ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {c.default_currency}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {c.is_active ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-0 text-[10px]">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Archivado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-3" onClick={(e) => e.stopPropagation()}>
                    {c.is_active ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => setActive.mutate({ id: c.id, is_active: false })}
                        title="Archivar"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => setActive.mutate({ id: c.id, is_active: true })}
                        title="Reactivar"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) resetForm();
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl p-0 flex flex-col"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/[0.08] flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-base">
                  {editing ? editing.name : "Nuevo cliente de facturación"}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {editing ? "Edita los datos o gestiona ubicaciones" : "Completa los datos para empezar"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-6 mt-3 grid grid-cols-2 w-auto">
              <TabsTrigger value="details" className="text-xs">Datos</TabsTrigger>
              <TabsTrigger value="locations" disabled={!editing} className="text-xs">
                Ubicaciones
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="details" className="px-6 py-4 space-y-5 m-0">
                <section className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Identidad
                  </h4>
                  <div>
                    <Label className="text-xs">Nombre comercial *</Label>
                    <Input
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="Acme Corp"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Razón social</Label>
                    <Input
                      value={form.legal_name}
                      onChange={e => setForm({ ...form, legal_name: e.target.value })}
                      placeholder="Acme Corporation Inc."
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs flex items-center gap-1.5">
                        <Hash className="h-3 w-3" /> Tax ID
                      </Label>
                      <Input
                        value={form.tax_id}
                        onChange={e => setForm({ ...form, tax_id: e.target.value })}
                        placeholder="EIN / RFC / NIT"
                        className="h-9 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1.5">
                        <Globe2 className="h-3 w-3" /> Moneda
                      </Label>
                      <Select
                        value={form.default_currency}
                        onValueChange={v => setForm({ ...form, default_currency: v })}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Contacto
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        placeholder="billing@acme.com"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Teléfono</Label>
                      <Input
                        value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value })}
                        placeholder="+1 555 0100"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Términos de pago
                  </h4>
                  <div>
                    <Label className="text-xs flex items-center gap-1.5">
                      <CreditCard className="h-3 w-3" /> Payment terms
                    </Label>
                    <Select
                      value={form.payment_terms}
                      onValueChange={v => setForm({ ...form, payment_terms: v })}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TERMS.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Dirección de facturación
                  </h4>
                  <div>
                    <Label className="text-xs">Línea 1</Label>
                    <Input
                      value={form.billing_address_line1}
                      onChange={e => setForm({ ...form, billing_address_line1: e.target.value })}
                      placeholder="123 Main St"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Línea 2</Label>
                    <Input
                      value={form.billing_address_line2}
                      onChange={e => setForm({ ...form, billing_address_line2: e.target.value })}
                      placeholder="Suite 400"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Ciudad</Label>
                      <Input
                        value={form.billing_city}
                        onChange={e => setForm({ ...form, billing_city: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Estado</Label>
                      <Input
                        value={form.billing_state}
                        onChange={e => setForm({ ...form, billing_state: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">ZIP</Label>
                      <Input
                        value={form.billing_zip}
                        onChange={e => setForm({ ...form, billing_zip: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">País</Label>
                    <Input
                      value={form.billing_country}
                      onChange={e => setForm({ ...form, billing_country: e.target.value })}
                      placeholder="USA"
                      className="h-9 text-sm"
                    />
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Link2 className="h-3 w-3" /> Cliente operativo (opcional)
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Vincula con un cliente de operaciones de la misma empresa.
                    </p>
                  </div>
                  <Popover open={opLinkOpen} onOpenChange={setOpLinkOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between h-9 text-sm font-normal"
                      >
                        {linkedOpClient ? linkedOpClient.name : "Sin vínculo"}
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar cliente operativo…" className="h-9 text-sm" />
                        <CommandList>
                          <CommandEmpty>Sin resultados</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none"
                              onSelect={() => {
                                setForm({ ...form, operational_client_id: null });
                                setOpLinkOpen(false);
                              }}
                            >
                              <X className="mr-2 h-3.5 w-3.5" />
                              <span className="text-sm">Sin vínculo</span>
                              {!form.operational_client_id && <Check className="ml-auto h-3.5 w-3.5" />}
                            </CommandItem>
                            {opClients.map(c => (
                              <CommandItem
                                key={c.id}
                                value={c.name}
                                onSelect={() => {
                                  setForm({ ...form, operational_client_id: c.id });
                                  setOpLinkOpen(false);
                                }}
                              >
                                <Building2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm truncate">{c.name}</span>
                                {form.operational_client_id === c.id && (
                                  <Check className="ml-auto h-3.5 w-3.5" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </section>

                <Separator />

                <section className="space-y-3">
                  <Label className="text-xs">Notas internas</Label>
                  <Textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    placeholder="Información adicional…"
                    className="text-sm"
                  />
                </section>
              </TabsContent>

              <TabsContent value="locations" className="px-6 py-4 m-0">
                {editing ? (
                  <BillingClientLocationsManager clientId={editing.id} />
                ) : (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    Guarda el cliente para gestionar ubicaciones.
                  </p>
                )}
              </TabsContent>
            </ScrollArea>

            <div className="px-6 py-3 border-t bg-card flex items-center justify-between gap-3">
              {editing ? (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editing.is_active}
                    onCheckedChange={(checked) => setActive.mutate({ id: editing.id, is_active: checked })}
                    id="is-active-toggle"
                  />
                  <Label htmlFor="is-active-toggle" className="text-xs cursor-pointer">
                    {editing.is_active ? "Activo" : "Archivado"}
                  </Label>
                </div>
              ) : <div />}
              {tab === "details" && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={create.isPending || update.isPending || !form.name.trim()}
                    className="press-scale gap-2"
                  >
                    {(create.isPending || update.isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {editing ? "Guardar cambios" : "Crear cliente"}
                  </Button>
                </div>
              )}
              {tab === "locations" && (
                <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)} className="ml-auto">
                  Cerrar
                </Button>
              )}
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}
