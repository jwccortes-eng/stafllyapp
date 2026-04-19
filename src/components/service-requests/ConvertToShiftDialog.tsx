import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConvertRequestToShift } from "@/hooks/useServiceRequests";
import type { ServiceRequest } from "@/lib/service-requests/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: ServiceRequest | null;
}

export function ConvertToShiftDialog({ open, onOpenChange, request }: Props) {
  const [title, setTitle] = useState("");
  const [payType, setPayType] = useState<"hourly" | "daily">("hourly");
  const convert = useConvertRequestToShift();

  useEffect(() => {
    if (request) {
      const code = request.request_code;
      const client = request.client_name_snapshot ?? "Service";
      setTitle(`${client} — ${code}`);
    }
  }, [request]);

  if (!request) return null;

  const submit = async () => {
    await convert.mutateAsync({
      request_id: request.id,
      title: title.trim() || `Service ${request.request_code}`,
      pay_type: payType,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert request to shift</DialogTitle>
          <DialogDescription>
            A new shift will be created on {request.service_date} {request.start_time?.slice(0, 5) ?? ""}–{request.end_time?.slice(0, 5) ?? ""} and linked to this request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="t">Shift title</Label>
            <Input id="t" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Pay type</Label>
            <Select value={payType} onValueChange={(v) => setPayType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily / Flat</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={convert.isPending}>
            {convert.isPending ? "Creating…" : "Create shift & link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
