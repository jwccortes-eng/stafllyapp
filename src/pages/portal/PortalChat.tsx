import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Send, Search, Users, Loader2, ArrowLeft,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";

interface Conversation { id: string; type: string; name: string | null; created_by: string; updated_at: string; }
interface Member { user_id: string; conversation_id: string; }
interface Profile { user_id: string; full_name: string | null; email: string | null; }
interface Message { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; deleted_at: string | null; }

export default function PortalChat() {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [searchConvo, setSearchConvo] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const userId = user?.id;

  // Get employee's company_id
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from("employees").select("company_id").eq("user_id", userId).maybeSingle();
      if (data) setCompanyId(data.company_id);
    })();
  }, [userId]);

  const loadConversations = useCallback(async () => {
    if (!companyId || !userId) return;
    setLoading(true);
    const [convRes, memRes, profRes] = await Promise.all([
      supabase.from("conversations").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }),
      supabase.from("conversation_members").select("user_id, conversation_id").eq("company_id", companyId),
      supabase.from("profiles").select("user_id, full_name, email"),
    ]);
    setConversations((convRes.data ?? []) as unknown as Conversation[]);
    setMembers((memRes.data ?? []) as unknown as Member[]);
    const pMap = new Map<string, Profile>();
    (profRes.data ?? []).forEach((p: any) => pMap.set(p.user_id, p as Profile));
    setProfiles(pMap);
    setLoading(false);
  }, [companyId, userId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel("portal-chat-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "internal_messages" }, (payload) => {
        const msg = payload.new as Message;
        if (msg.conversation_id === selectedConvo) {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
        }
        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === msg.conversation_id);
          if (idx <= 0) return prev;
          const updated = [...prev];
          const [moved] = updated.splice(idx, 1);
          updated.unshift({ ...moved, updated_at: msg.created_at });
          return updated;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, selectedConvo]);

  const loadMessages = async (convoId: string) => {
    setLoadingMsgs(true);
    const { data } = await supabase.from("internal_messages").select("*")
      .eq("conversation_id", convoId).is("deleted_at", null)
      .order("created_at", { ascending: true }).limit(200);
    setMessages((data ?? []) as Message[]);
    setLoadingMsgs(false);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
  };

  const selectConvo = (id: string) => {
    setSelectedConvo(id);
    loadMessages(id);
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedConvo || !userId || !companyId) return;
    setSending(true);
    const { error } = await supabase.from("internal_messages").insert({
      company_id: companyId,
      conversation_id: selectedConvo,
      sender_id: userId,
      content: input.trim(),
    } as any);
    if (error) toast.error(error.message);
    else setInput("");
    setSending(false);
  };

  const getConvoName = (convo: Conversation | undefined) => {
    if (!convo) return "Chat";
    if (convo.name) return convo.name;
    const convoMembers = members.filter(m => m.conversation_id === convo.id && m.user_id !== userId);
    if (convoMembers.length === 0) return "Yo";
    return convoMembers.map(m => profiles.get(m.user_id)?.full_name ?? profiles.get(m.user_id)?.email ?? "Usuario").join(", ");
  };

  const getInitials = (name: string) => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const formatMsgDate = (d: string) => {
    const date = new Date(d);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return "Ayer " + format(date, "HH:mm");
    return format(date, "dd/MM HH:mm");
  };

  const myConversations = useMemo(() => {
    const myConvoIds = new Set(members.filter(m => m.user_id === userId).map(m => m.conversation_id));
    return conversations.filter(c => myConvoIds.has(c.id));
  }, [conversations, members, userId]);

  const filteredConvos = useMemo(() => {
    if (!searchConvo) return myConversations;
    const s = searchConvo.toLowerCase();
    return myConversations.filter(c => getConvoName(c).toLowerCase().includes(s));
  }, [myConversations, searchConvo]);

  // Mobile-first full-screen layout
  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] -mx-5 -mt-5">
      {!selectedConvo ? (
        // Conversation list
        <div className="flex flex-col flex-1">
          <div className="px-4 pt-4 pb-2 space-y-3">
            <h1 className="text-lg font-bold text-foreground">Mensajes</h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchConvo}
                onChange={e => setSearchConvo(e.target.value)}
                placeholder="Buscar conversación..."
                className="pl-9 h-10 rounded-xl"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConvos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                  <MessageSquare className="h-7 w-7 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">Sin conversaciones</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Aún no tienes mensajes. Un administrador puede iniciar una conversación contigo.
                </p>
              </div>
            ) : (
              filteredConvos.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectConvo(c.id)}
                  className="w-full text-left px-4 py-3 hover:bg-accent/50 active:bg-accent transition-colors flex items-center gap-3 border-b border-border/30 last:border-0"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {c.type === "group" ? <Users className="h-4 w-4" /> : getInitials(getConvoName(c))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{getConvoName(c)}</p>
                    <p className="text-[11px] text-muted-foreground">{formatMsgDate(c.updated_at)}</p>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>
      ) : (
        // Message view
        <div className="flex flex-col flex-1">
          <div className="h-12 border-b flex items-center px-3 gap-2 bg-card shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setSelectedConvo(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-semibold truncate">
              {getConvoName(myConversations.find(c => c.id === selectedConvo))}
            </p>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No hay mensajes aún</p>
            ) : (
              messages.map(msg => {
                const isMine = msg.sender_id === userId;
                const senderName = profiles.get(msg.sender_id)?.full_name ?? "Usuario";
                return (
                  <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2.5",
                      isMine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                    )}>
                      {!isMine && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{senderName}</p>}
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className={cn("text-[9px] mt-0.5", isMine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                        {formatMsgDate(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <form
            onSubmit={e => { e.preventDefault(); sendMessage(); }}
            className="border-t px-3 py-2.5 flex gap-2 bg-card shrink-0"
          >
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escribe un mensaje..."
              className="flex-1 rounded-xl"
              disabled={sending}
            />
            <Button type="submit" size="icon" className="rounded-xl shrink-0" disabled={sending || !input.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
