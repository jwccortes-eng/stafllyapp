/**
 * Contacts view — manages authorized client contacts (people on the
 * client side allowed to interact with us). Separate from employees.
 */
import { useMemo, useState } from "react";
import {
  useClientContacts,
  useUpsertClientContact,
  type ClientContact,
} from "@/hooks/useClientExperience";
import { useBillingClients } from "@/hooks/useBillingClients";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Users, Mail, Phone, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ClientContact["portal_status"], string> = {
  invited: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  disabled: "bg-muted text-muted-foreground",
};

export default function ClientExperienceContacts() {
  const { data: contacts = [], isLoading } = useClientContacts();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.email ?? "").toLowerCase().includes(s) ||
        (c.phone ?? "").includes(s),
    );
  }, [contacts, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 gap-1.5 text-xs ml-auto">
              <Plus className="h-3.5 w-3.5" /> New contact
            </Button>
          </DialogTrigger>
          <ContactDialog onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Contacts</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {filtered.length}
          </Badge>
        </div>
        <div className="divide-y divide-border/60 max-h-[68vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-1">
              <Users className="h-6 w-6 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-medium">No contacts yet</p>
              <p className="text-xs text-muted-foreground">
                Add the people on the client side authorized to talk to your team.
              </p>
            </div>
          ) : (
            filtered.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold">
                  {c.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{c.name}</span>
                    {c.is_primary && (
                      <Star className="h-3 w-3 text-amber-500 fill-amber-400" />
                    )}
                    {c.title && (
                      <span className="text-[11px] text-muted-foreground">· {c.title}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground mt-0.5">
                    {c.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </span>
                    )}
                  </div>
                </div>
                <Badge
                  className={cn("text-[10px] capitalize border-0", STATUS_TONE[c.portal_status])}
                >
                  {c.portal_status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function ContactDialog({ onClose }: { onClose: () => void }) {
  const upsert = useUpsertClientContact();
  const { data: clients = [] } = useBillingClients();
  const [form, setForm] = useState({
    client_id: "",
    name: "",
    email: "",
    phone: "",
    title: "",
    is_primary: false,
    portal_status: "invited" as ClientContact["portal_status"],
  });

  const handleSubmit = async () => {
    if (!form.client_id || !form.name.trim()) return;
    await upsert.mutateAsync({
      client_id: form.client_id,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      title: form.title.trim() || null,
      is_primary: form.is_primary,
      portal_status: form.portal_status,
    });
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>New client contact</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Client</Label>
          <Select
            value={form.client_id}
            onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-sm">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Jane Doe"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Title / Role</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Operations Manager"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-2.5">
          <div>
            <Label className="text-xs">Primary contact</Label>
            <p className="text-[11px] text-muted-foreground">
              Marks this person as the main point of contact for the client.
            </p>
          </div>
          <Switch
            checked={form.is_primary}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_primary: v }))}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} size="sm">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!form.client_id || !form.name.trim() || upsert.isPending}
          size="sm"
        >
          {upsert.isPending ? "Saving…" : "Save contact"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
