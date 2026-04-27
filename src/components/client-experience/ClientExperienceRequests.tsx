/**
 * Service Requests view — list + filters + side detail with timeline,
 * quick actions and an embedded conversation thread.
 */
import { useMemo, useState } from "react";
import {
  useClientServiceRequests,
  useUpdateServiceRequest,
  useGetOrCreateThread,
  useClientMessages,
  useSendMessage,
  type ServiceRequestRow,
} from "@/hooks/useClientExperience";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ClipboardList, Search, Eye, Lock, Send, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_OPTS: ServiceRequestRow["status"][] = [
  "new",
  "reviewing",
  "approved_for_scheduling",
  "converted_to_shift",
  "in_progress",
  "ready_for_billing",
  "pending_closure_review",
  "invoiced",
  "cancelled",
];

const PRIORITY_COLORS: Record<ServiceRequestRow["priority"], string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
};

export default function ClientExperienceRequests() {
  const [status, setStatus] = useState<ServiceRequestRow["status"] | "">("");
  const [priority, setPriority] = useState<ServiceRequestRow["priority"] | "">("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useClientServiceRequests({
    status: status || undefined,
    priority: priority || undefined,
    search: search || undefined,
  });

  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? requests[0] ?? null,
    [requests, selectedId],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, client, code…"
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs capitalize">
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            {(["low", "normal", "high", "urgent"] as const).map((p) => (
              <SelectItem key={p} value={p} className="text-xs capitalize">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(status || priority || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setStatus("");
              setPriority("");
              setSearch("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <Card className="overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">Requests</span>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {requests.length}
            </Badge>
          </div>
          <div className="divide-y divide-border/60 max-h-[68vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 mx-auto mb-2 animate-spin" /> Loading…
              </div>
            ) : requests.length === 0 ? (
              <div className="p-12 text-center space-y-1">
                <AlertCircle className="h-6 w-6 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium">No requests match your filters</p>
              </div>
            ) : (
              requests.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors",
                    selected?.id === r.id && "bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">
                          {r.title ?? r.client_name_snapshot ?? r.request_code}
                        </span>
                        <Badge
                          className={cn("text-[9px] capitalize border-0", PRIORITY_COLORS[r.priority])}
                        >
                          {r.priority}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {r.request_code} · {r.client_name_snapshot ?? "—"}
                        {r.service_date ? ` · ${r.service_date}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize whitespace-nowrap">
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {selected ? (
          <RequestDetail request={selected} key={selected.id} />
        ) : (
          <Card className="flex items-center justify-center text-sm text-muted-foreground p-12">
            Select a request to see details
          </Card>
        )}
      </div>
    </div>
  );
}

function RequestDetail({ request }: { request: ServiceRequestRow }) {
  const update = useUpdateServiceRequest();
  const getOrCreate = useGetOrCreateThread();
  const [threadId, setThreadId] = useState<string | null>(null);

  const ensureThread = async () => {
    if (threadId) return threadId;
    if (!request.client_id) return null;
    const t = await getOrCreate.mutateAsync({
      client_id: request.client_id,
      context: "service_request",
      service_request_id: request.id,
      subject: request.title ?? request.request_code,
    });
    setThreadId(t.id);
    return t.id;
  };

  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border/60 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold truncate">
            {request.title ?? request.request_code}
          </p>
          <Badge variant="outline" className="text-[10px] capitalize">
            {request.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {request.request_code} · {request.client_name_snapshot ?? "—"}
        </p>
      </div>

      <div className="p-4 space-y-3 text-xs">
        {request.description && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Description
            </p>
            <p className="whitespace-pre-wrap">{request.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" value={request.request_type.replace(/_/g, " ")} />
          <Field label="Priority" value={request.priority} />
          <Field label="Service date" value={request.service_date ?? "—"} />
          <Field
            label="Headcount"
            value={request.headcount_requested ? String(request.headcount_requested) : "—"}
          />
          <Field
            label="Window"
            value={
              request.start_time && request.end_time
                ? `${request.start_time.slice(0, 5)} – ${request.end_time.slice(0, 5)}`
                : "—"
            }
          />
          <Field
            label="Created"
            value={format(new Date(request.created_at), "MMM d, yyyy HH:mm")}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Update status
          </p>
          <div className="flex flex-wrap gap-1">
            {(
              [
                "reviewing",
                "approved_for_scheduling",
                "in_progress",
                "ready_for_billing",
                "cancelled",
              ] as const
            ).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={request.status === s ? "default" : "outline"}
                className="h-7 text-[11px] capitalize"
                disabled={update.isPending}
                onClick={() => update.mutate({ id: request.id, patch: { status: s } })}
              >
                {s.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 flex-1 min-h-[280px] flex flex-col">
        <div className="px-4 py-2 flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20">
          <span className="text-[11px] font-semibold">Conversation</span>
          {!threadId && request.client_id && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px]"
              disabled={getOrCreate.isPending}
              onClick={ensureThread}
            >
              {getOrCreate.isPending ? "Opening…" : "Open thread"}
            </Button>
          )}
        </div>
        {threadId ? (
          <RequestThreadChat threadId={threadId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground p-6 text-center">
            {request.client_id
              ? "No thread opened yet — open one to message the client."
              : "This request has no client linked."}
          </div>
        )}
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-medium capitalize">{value}</p>
    </div>
  );
}

function RequestThreadChat({ threadId }: { threadId: string }) {
  const { data: messages = [] } = useClientMessages(threadId);
  const send = useSendMessage();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"client_visible" | "internal_only">(
    "client_visible",
  );

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    await send.mutateAsync({ thread_id: threadId, body: trimmed, visibility });
    setBody("");
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[280px] bg-muted/5">
        {messages.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">
            No messages yet.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-xl px-2.5 py-1.5 text-xs",
                m.sender_type === "admin"
                  ? m.visibility === "internal_only"
                    ? "bg-amber-50 text-amber-950 border border-amber-200 ml-auto"
                    : "bg-primary text-primary-foreground ml-auto"
                  : "bg-background border border-border",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p
                className={cn(
                  "text-[9px] mt-0.5 opacity-70 flex items-center gap-1",
                  m.sender_type === "admin" && m.visibility === "client_visible"
                    ? "text-primary-foreground"
                    : "",
                )}
              >
                {m.visibility === "internal_only" ? (
                  <>
                    <Lock className="h-2 w-2" /> Internal
                  </>
                ) : (
                  <>
                    <Eye className="h-2 w-2" /> Client
                  </>
                )}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-border/60 p-2 space-y-1.5 bg-background">
        <ToggleGroup
          type="single"
          size="sm"
          value={visibility}
          onValueChange={(v) => v && setVisibility(v as typeof visibility)}
          className="justify-start"
        >
          <ToggleGroupItem value="client_visible" className="text-[10px] gap-1 h-6">
            <Eye className="h-2.5 w-2.5" /> Client
          </ToggleGroupItem>
          <ToggleGroupItem value="internal_only" className="text-[10px] gap-1 h-6">
            <Lock className="h-2.5 w-2.5" /> Internal
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-end gap-1.5">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder={visibility === "internal_only" ? "Internal note…" : "Reply…"}
            className="resize-none text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
          <Button
            onClick={handleSend}
            disabled={!body.trim() || send.isPending}
            size="sm"
            className="h-8 px-2"
          >
            {send.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
