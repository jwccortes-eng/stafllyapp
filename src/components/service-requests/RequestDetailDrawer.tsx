import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, MapPin, Phone, User, MessageSquareText, ArrowRight, Ban, X } from "lucide-react";
import { useServiceRequest, useUpdateServiceRequestStatus } from "@/hooks/useServiceRequests";
import { ROLE_LABELS, STATUS_LABELS, STATUS_TONE, CHANNEL_LABELS, GENDER_LABELS } from "@/lib/service-requests/types";
import { cn } from "@/lib/utils";
import { ConvertToShiftDialog } from "./ConvertToShiftDialog";
import { FulfillmentTable } from "./FulfillmentTable";
import { Link } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requestId: string | null;
}

export function RequestDetailDrawer({ open, onOpenChange, requestId }: Props) {
  const { data, isLoading } = useServiceRequest(requestId);
  const updateStatus = useUpdateServiceRequestStatus();
  const [convertOpen, setConvertOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-xl">
              {data?.request?.request_code ?? "Request"}
            </SheetTitle>
            {data?.request && (
              <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", STATUS_TONE[data.request.status])}>
                {STATUS_LABELS[data.request.status]}
              </span>
            )}
          </div>
          <SheetDescription>{data?.request?.client_name_snapshot ?? "Service request detail"}</SheetDescription>
        </SheetHeader>

        {isLoading || !data?.request ? (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Service summary */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Calendar className="size-4 text-muted-foreground" /> {data.request.service_date}</div>
                <div className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" />
                  {data.request.start_time?.slice(0, 5) ?? "—"} – {data.request.end_time?.slice(0, 5) ?? "—"}
                </div>
                <div className="flex items-center gap-2 col-span-2"><MapPin className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{data.request.service_address ?? "No address"}</span>
                </div>
                {data.request.onsite_contact_name && (
                  <div className="flex items-center gap-2"><User className="size-4 text-muted-foreground" /> {data.request.onsite_contact_name}</div>
                )}
                {data.request.onsite_contact_phone && (
                  <div className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" /> {data.request.onsite_contact_phone}</div>
                )}
                <div className="flex items-center gap-2 col-span-2 text-muted-foreground">
                  <MessageSquareText className="size-4" /> via {CHANNEL_LABELS[data.request.request_channel]} · {GENDER_LABELS[data.request.gender_requirement]}
                </div>
              </div>
              {data.request.notes && (
                <p className="text-sm text-muted-foreground border-t border-border pt-2 mt-2">{data.request.notes}</p>
              )}
            </div>

            {/* Items requested */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Roles requested</div>
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {data.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">No roles defined.</p>
                ) : (
                  data.items.map(it => (
                    <div key={it.id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <div className="font-medium">{it.role_label || ROLE_LABELS[it.role_type]}</div>
                        {it.notes && <div className="text-xs text-muted-foreground">{it.notes}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-base font-semibold tabular-nums">{it.quantity_requested}</div>
                        {it.requested_bill_rate && (
                          <div className="text-xs text-muted-foreground">${it.requested_bill_rate} {it.billing_unit ?? ""}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Fulfillment view */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fulfillment</div>
              <div className="rounded-xl border border-border bg-card p-3">
                <FulfillmentTable requestId={requestId} />
              </div>
            </div>

            {/* Linked shifts */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Linked shifts ({data.links.length})
              </div>
              {data.links.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shifts linked yet. Convert this request to a shift to start operations.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.links.map(l => (
                    <Link
                      key={l.id}
                      to={`/app/shifts?shiftId=${l.shift_id}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-card hover:bg-accent/40 transition px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{l.shift_id.slice(0, 8)}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {(data.request.status === "new" || data.request.status === "reviewing" || data.request.status === "approved_for_scheduling") && (
                <Button onClick={() => setConvertOpen(true)} className="flex-1">
                  Convert to shift
                </Button>
              )}
              {data.request.status === "new" && (
                <Button variant="outline" onClick={() => updateStatus.mutate({ id: data.request!.id, status: "reviewing" })}>
                  Mark as reviewing
                </Button>
              )}
              {data.request.status === "reviewing" && (
                <Button variant="outline" onClick={() => updateStatus.mutate({ id: data.request!.id, status: "approved_for_scheduling" })}>
                  Approve
                </Button>
              )}
              {data.request.status === "converted_to_shift" && (
                <Button variant="outline" onClick={() => updateStatus.mutate({ id: data.request!.id, status: "in_progress" })}>
                  Mark in progress
                </Button>
              )}
              {data.request.status === "in_progress" && (
                <Button variant="outline" onClick={() => updateStatus.mutate({ id: data.request!.id, status: "pending_closure_review" })}>
                  Send to closure review
                </Button>
              )}
              {data.request.status !== "cancelled" && data.request.status !== "invoiced" && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    const reason = prompt("Cancellation reason?");
                    if (reason !== null) updateStatus.mutate({ id: data.request!.id, status: "cancelled", reason });
                  }}
                >
                  <Ban className="size-4 mr-1" /> Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        <ConvertToShiftDialog open={convertOpen} onOpenChange={setConvertOpen} request={data?.request ?? null} />
      </SheetContent>
    </Sheet>
  );
}
