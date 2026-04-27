/**
 * Inbox view — list of conversation threads with a side panel chat.
 * Splits messages into client-visible vs internal-only timeline.
 */
import { useMemo, useState } from "react";
import {
  useClientThreads,
  useClientMessages,
  useSendMessage,
  type ClientThread,
} from "@/hooks/useClientExperience";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Inbox, Send, Eye, Lock, MessageSquare, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function ClientExperienceInbox() {
  const { data: threads = [], isLoading } = useClientThreads();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = threads.find((t) => t.id === selectedId) ?? threads[0] ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 min-h-[60vh]">
      <Card className="overflow-hidden">
        <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
          <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Conversations</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {threads.length}
          </Badge>
        </div>
        <div className="divide-y divide-border/60 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 mx-auto mb-2 animate-spin" /> Loading…
            </div>
          ) : threads.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <MessageSquare className="h-6 w-6 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs text-muted-foreground">
                Threads appear here as clients message you or as you start one.
              </p>
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors",
                  selected?.id === t.id && "bg-primary/5",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold truncate flex-1">
                    {t.subject ?? (t.context === "service_request" ? "Service request" : "General")}
                  </span>
                  {t.unread_admin_count > 0 && (
                    <Badge className="h-4 px-1.5 text-[10px]">{t.unread_admin_count}</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {t.last_message_preview ?? "No messages yet"}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {t.last_message_at
                    ? formatDistanceToNow(new Date(t.last_message_at), {
                        addSuffix: true,
                        locale: enUS,
                      })
                    : "—"}
                </p>
              </button>
            ))
          )}
        </div>
      </Card>

      {selected ? (
        <ThreadPanel thread={selected} key={selected.id} />
      ) : (
        <Card className="flex items-center justify-center text-sm text-muted-foreground">
          Select a conversation
        </Card>
      )}
    </div>
  );
}

function ThreadPanel({ thread }: { thread: ClientThread }) {
  const { data: messages = [], isLoading } = useClientMessages(thread.id);
  const send = useSendMessage();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"client_visible" | "internal_only">(
    "client_visible",
  );

  const filtered = useMemo(() => messages, [messages]);

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    await send.mutateAsync({ thread_id: thread.id, body: trimmed, visibility });
    setBody("");
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {thread.subject ?? (thread.context === "service_request" ? "Service request" : "General")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {thread.context === "service_request" ? "Tied to a service request" : "Direct line"}
          </p>
        </div>
        <Badge variant={thread.is_open ? "default" : "outline"} className="text-[10px]">
          {thread.is_open ? "Open" : "Closed"}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[55vh] bg-muted/10">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-12">
            No messages yet — start the conversation below.
          </p>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex flex-col gap-1",
                m.sender_type === "admin" ? "items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                  m.sender_type === "admin"
                    ? m.visibility === "internal_only"
                      ? "bg-amber-50 text-amber-950 border border-amber-200"
                      : "bg-primary text-primary-foreground"
                    : "bg-background border border-border",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {m.visibility === "internal_only" ? (
                  <>
                    <Lock className="h-2.5 w-2.5" /> Internal note
                  </>
                ) : (
                  <>
                    <Eye className="h-2.5 w-2.5" /> Visible to client
                  </>
                )}
                <span>·</span>
                <span>
                  {formatDistanceToNow(new Date(m.created_at), {
                    addSuffix: true,
                    locale: enUS,
                  })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border/60 p-3 space-y-2 bg-background">
        <ToggleGroup
          type="single"
          size="sm"
          value={visibility}
          onValueChange={(v) => v && setVisibility(v as typeof visibility)}
          className="justify-start"
        >
          <ToggleGroupItem value="client_visible" className="text-[11px] gap-1.5 h-7">
            <Eye className="h-3 w-3" /> Reply to client
          </ToggleGroupItem>
          <ToggleGroupItem value="internal_only" className="text-[11px] gap-1.5 h-7">
            <Lock className="h-3 w-3" /> Internal note
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              visibility === "internal_only"
                ? "Internal note — not visible to the client"
                : "Reply to the client…"
            }
            rows={2}
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
          <Button
            onClick={handleSend}
            disabled={!body.trim() || send.isPending}
            size="sm"
            className="gap-1.5"
          >
            {send.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          ⌘/Ctrl + Enter to send. Internal notes never reach the client.
        </p>
      </div>
    </Card>
  );
}
