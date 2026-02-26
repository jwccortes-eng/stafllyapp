import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MessageSquare, Plus, Send, Search, Users, User, Loader2, ArrowLeft,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";

interface Conversation { id: string; type: string; name: string | null; created_by: string; updated_at: string; }
interface Member { user_id: string; conversation_id: string; }
interface Profile { user_id: string; full_name: string | null; email: string | null; }
interface Message { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; deleted_at: string | null; }

export default function InternalChat() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
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
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newType, setNewType] = useState<"direct" | "group">("direct");
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userId = user?.id;

  const loadConversations = useCallback(async () => {
    if (!selectedCompanyId || !userId) return;
    setLoading(true);
    const [convRes, memRes, profRes] = await Promise.all([
      supabase.from("conversations").select("*").eq("company_id", selectedCompanyId).order("updated_at", { ascending: false }),
      supabase.from("conversation_members").select("user_id, conversation_id").eq("company_id", selectedCompanyId),
      supabase.from("profiles").select("user_id, full_name, email"),
    ]);
    setConversations((convRes.data ?? []) as unknown as Conversation[]);
    setMembers((memRes.data ?? []) as unknown as Member[]);
    const pMap = new Map<string, Profile>();
    (profRes.data ?? []).forEach((p: any) => pMap.set(p.user_id, p as Profile));
    setProfiles(pMap);
    setAllProfiles((profRes.data ?? []) as Profile[]);
    setLoading(false);
  }, [selectedCompanyId, userId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Realtime for messages
  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase
      .channel("internal-messages-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "internal_messages" }, (payload) => {
        const msg = payload.new as Message;
        if (msg.conversation_id === selectedConvo) {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
        }
        // Update conversation order
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
  }, [selectedCompanyId, selectedConvo]);

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
    if (!input.trim() || !selectedConvo || !userId || !selectedCompanyId) return;
    setSending(true);
    const { error } = await supabase.from("internal_messages").insert({
      company_id: selectedCompanyId,
      conversation_id: selectedConvo,
      sender_id: userId,
      content: input.trim(),
    } as any);
    if (error) toast.error(error.message);
    else setInput("");
    setSending(false);
  };

  const createConversation = async () => {
    if (!userId || !selectedCompanyId || selectedUsers.length === 0) return;
    const type = newType === "group" || selectedUsers.length > 1 ? "group" : "direct";
    const name = type === "group" ? (newGroupName.trim() || "Grupo") : null;

    const { data: convo, error } = await supabase.from("conversations").insert({
      company_id: selectedCompanyId,
      type,
      name,
      created_by: userId,
    } as any).select("id").single();

    if (error || !convo) { toast.error(error?.message ?? "Error"); return; }

    // Add members
    const memberInserts = [userId, ...selectedUsers].map(uid => ({
      company_id: selectedCompanyId,
      conversation_id: convo.id,
      user_id: uid,
      role: uid === userId ? "admin" : "member",
    }));
    await supabase.from("conversation_members").insert(memberInserts as any);

    toast.success("Conversación creada");
    setNewDialogOpen(false);
    setSelectedUsers([]);
    setNewGroupName("");
    loadConversations();
    selectConvo(convo.id);
  };

  const getConvoName = (convo: Conversation | undefined) => {
    if (!convo) return "Conversación";
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

  return (
    <div className="flex h-[calc(100vh-8rem)] border rounded-lg overflow-hidden">
      {/* Sidebar */}
      <div className={cn("w-80 border-r flex flex-col bg-card", selectedConvo && "hidden md:flex")}>
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Chat interno</h2>
            <Button variant="ghost" size="icon" onClick={() => setNewDialogOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={searchConvo} onChange={e => setSearchConvo(e.target.value)} placeholder="Buscar..." className="pl-8 h-8 text-xs" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConvos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No hay conversaciones</p>
          ) : (
            filteredConvos.map(c => (
              <button
                key={c.id}
                onClick={() => selectConvo(c.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center gap-2.5",
                  selectedConvo === c.id && "bg-accent"
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {c.type === "group" ? <Users className="h-3.5 w-3.5" /> : getInitials(getConvoName(c))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{getConvoName(c)}</p>
                  <p className="text-[10px] text-muted-foreground">{formatMsgDate(c.updated_at)}</p>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Messages */}
      <div className={cn("flex-1 flex flex-col", !selectedConvo && "hidden md:flex")}>
        {!selectedConvo ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecciona una conversación</p>
            </div>
          </div>
        ) : (
          <>
            <div className="h-12 border-b flex items-center px-3 gap-2">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedConvo(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <p className="text-sm font-semibold truncate">
                {getConvoName(myConversations.find(c => c.id === selectedConvo)!)}
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
                        "max-w-[70%] rounded-2xl px-3 py-2",
                        isMine ? "bg-primary text-primary-foreground" : "bg-muted"
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
              className="border-t p-3 flex gap-2"
            >
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="flex-1"
                disabled={sending}
              />
              <Button type="submit" size="icon" disabled={sending || !input.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </>
        )}
      </div>

      {/* New conversation dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva conversación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={newType === "direct" ? "default" : "outline"} size="sm" onClick={() => setNewType("direct")}>
                <User className="h-4 w-4 mr-1" /> Directo
              </Button>
              <Button variant={newType === "group" ? "default" : "outline"} size="sm" onClick={() => setNewType("group")}>
                <Users className="h-4 w-4 mr-1" /> Grupo
              </Button>
            </div>
            {newType === "group" && (
              <div>
                <Label>Nombre del grupo</Label>
                <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Nombre..." />
              </div>
            )}
            <div>
              <Label>Seleccionar participantes</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto p-2 mt-1 space-y-1">
                {allProfiles.filter(p => p.user_id !== userId).map(p => (
                  <label key={p.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedUsers.includes(p.user_id)}
                      onCheckedChange={() => {
                        setSelectedUsers(prev =>
                          prev.includes(p.user_id) ? prev.filter(id => id !== p.user_id) : [...prev, p.user_id]
                        );
                      }}
                    />
                    {p.full_name || p.email || "Usuario"}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createConversation} disabled={selectedUsers.length === 0}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
