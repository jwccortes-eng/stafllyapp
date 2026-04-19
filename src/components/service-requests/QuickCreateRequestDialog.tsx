import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useCreateServiceRequest } from "@/hooks/useServiceRequests";
import { ROLE_LABELS, type ServiceRequestRoleType } from "@/lib/service-requests/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface ItemDraft {
  role_type: ServiceRequestRoleType;
  quantity_requested: number;
}

const DEFAULT_ITEM: ItemDraft = { role_type: "waiter", quantity_requested: 1 };

export function QuickCreateRequestDialog({ open, onOpenChange }: Props) {
  const create = useCreateServiceRequest();
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("");
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [gender, setGender] = useState("none");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([DEFAULT_ITEM]);

  const reset = () => {
    setServiceDate(new Date().toISOString().slice(0, 10));
    setStartTime("17:00");
    setEndTime("");
    setClientName("");
    setAddress("");
    setContactName("");
    setContactPhone("");
    setChannel("whatsapp");
    setGender("none");
    setNotes("");
    setItems([DEFAULT_ITEM]);
  };

  const submit = async () => {
    await create.mutateAsync({
      service_date: serviceDate,
      start_time: startTime ? `${startTime}:00` : null,
      end_time: endTime ? `${endTime}:00` : null,
      client_name_snapshot: clientName || null,
      service_address: address || null,
      onsite_contact_name: contactName || null,
      onsite_contact_phone: contactPhone || null,
      request_channel: channel,
      gender_requirement: gender,
      notes: notes || null,
      items: items.filter(i => i.quantity_requested > 0),
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New service request</DialogTitle>
          <DialogDescription>Capture a client request. You can convert it into a shift right after.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sd">Service date *</Label>
            <Input id="sd" type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="st">Start</Label>
              <Input id="st" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et">End</Label>
              <Input id="et" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="cn">Client name</Label>
            <Input id="cn" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Fishman family" />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="addr">Service address</Label>
            <Input id="addr" value={address} onChange={e => setAddress(e.target.value)} placeholder="7 Stone Meadow Lane, Airmont NY 10901" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cname">On-site contact name</Label>
            <Input id="cname" value={contactName} onChange={e => setContactName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cphone">On-site contact phone</Label>
            <Input id="cphone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="client_link">Client link</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Gender requirement</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any</SelectItem>
                <SelectItem value="men_only">Men only</SelectItem>
                <SelectItem value="women_only">Women only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2 mt-2">
          <div className="flex items-center justify-between">
            <Label>Roles requested</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems(prev => [...prev, { ...DEFAULT_ITEM }])}>
              <Plus className="size-3.5 mr-1" /> Add role
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-7">
                  <Select
                    value={it.role_type}
                    onValueChange={(v) => setItems(prev => prev.map((x, i) => i === idx ? { ...x, role_type: v as ServiceRequestRoleType } : x))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    min={0}
                    value={it.quantity_requested}
                    onChange={(e) => setItems(prev => prev.map((x, i) => i === idx ? { ...x, quantity_requested: Number(e.target.value) } : x))}
                  />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={items.length === 1}
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 mt-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="e.g. men only, kosher kitchen, etc." />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !serviceDate}>
            {create.isPending ? "Creating…" : "Create request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
