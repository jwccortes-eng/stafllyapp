import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, Send, Users, Pin, Loader2, Zap, MapPin,
  MoreVertical, UserPlus, Bell, BellOff,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface ChannelMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  message_type: string;
  metadata: any;
  reactions: any;
  is_pinned: boolean;
  created_at: string;
  // Joined
  profile_name?: string;
}

interface ChannelData {
  id: string;
  name: string;
  zone: string;
  category: string;
  description: string | null;
  icon: string;
  member_count: number;
}

export default function ChannelView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [joining, setJoining] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!id) return;
    loadChannel();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const loadChannel = async () => {
    if (!id || !user) return;
    setLoading(true);

    const [chRes, memberRes, msgsRes] = await Promise.all([
      supabase.from("community_channels").select("*").eq("id", id).single(),
      supabase.from("channel_members").select("id").eq("channel_id", id).eq("user_id", user.id).maybeSingle(),
      supabase.from("channel_messages").select("*").eq("channel_id", id).order("created_at", { ascending: true }).limit(100),
    ]);

    setChannel(chRes.data as ChannelData | null);
    setIsMember(!!memberRes.data);
    setMessages((msgsRes.data as ChannelMessage[]) ?? []);

    // Load profile names for message authors
    const uniqueUserIds = [...new Set((msgsRes.data ?? []).map((m: any) => m.user_id))];
    if (uniqueUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", uniqueUserIds);
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => { map[p.user_id] = p.full_name || "Usuario"; });
      setProfileNames(map);
    }

    setLoading(false);

    // Auto-join if not member
    if (!memberRes.data && chRes.data) {
      await handleJoin();
    }

    // Subscribe to realtime messages
    const sub = supabase
      .channel(`channel-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "channel_messages", filter: `channel_id=eq.${id}` }, (payload) => {
        const msg = payload.new as ChannelMessage;
        setMessages((prev) => [...prev, msg]);
        // Load profile name if missing
        if (!profileNames[msg.user_id]) {
          supabase.from("profiles").select("user_id, full_name").eq("user_id", msg.user_id).single().then(({ data }) => {
            if (data) setProfileNames((prev) => ({ ...prev, [data.user_id]: data.full_name || "Usuario" }));
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  };

  const handleJoin = async () => {
    if (!id || !user) return;
    setJoining(true);
    await supabase.from("channel_members").insert({ channel_id: id, user_id: user.id });
    setIsMember(true);
    setJoining(false);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !id || !user || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    await supabase.from("channel_messages").insert({
      channel_id: id,
      user_id: user.id,
      content,
      message_type: "text",
    });

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-lg font-bold text-foreground">Canal no encontrado</h1>
        <Button variant="outline" onClick={() => navigate("/parceros")} className="mt-4">Volver</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Channel Header — branded */}
      <header
        className="sticky top-0 z-20 px-3 py-2.5 safe-top border-b border-border/40 backdrop-blur-xl"
        style={{ background: "hsl(var(--card) / 0.85)" }}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate("/parceros")}
            className="text-muted-foreground hover:text-foreground active:scale-95 transition-all h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/40"
            aria-label="Volver"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-2xl">{channel.icon}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate font-heading">{channel.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[8px] h-3.5 border-primary/30 text-primary bg-primary/10">
                {channel.zone}
              </Badge>
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Users className="h-2.5 w-2.5" /> {channel.member_count}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-3 py-4 max-w-2xl mx-auto w-full">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <span className="text-4xl">{channel.icon}</span>
              <h3 className="text-sm font-bold text-foreground mt-3">Bienvenido a #{channel.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">Sé el primero en escribir aquí.</p>
            </div>
          )}
          {messages.map((msg) => {
            const isOwn = msg.user_id === user?.id;
            const name = profileNames[msg.user_id] ?? "Usuario";
            const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

            return (
              <div key={msg.id} className={cn("flex gap-2", isOwn && "flex-row-reverse")}>
                {/* Avatar */}
                <div className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                  isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {initials}
                </div>
                <div className={cn(
                  "max-w-[75%] px-3 py-2 rounded-2xl",
                  isOwn
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-card border border-border/60 text-foreground rounded-tl-sm"
                )}>
                  {!isOwn && (
                    <p className="text-[10px] font-bold text-primary mb-0.5">{name}</p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  <p className={cn("text-[9px] mt-1", isOwn ? "text-white/60" : "text-muted-foreground")}>
                    {format(new Date(msg.created_at), "HH:mm")}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      {isMember ? (
        <footer className="sticky bottom-0 bg-card border-t border-border/40 px-3 py-2.5 safe-bottom">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              className="flex-1 h-10 rounded-xl text-sm"
              maxLength={2000}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="h-10 w-10 rounded-xl shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      ) : (
        <footer className="sticky bottom-0 bg-card border-t border-border/40 px-3 py-3 safe-bottom">
          <div className="max-w-2xl mx-auto">
            <Button onClick={handleJoin} disabled={joining} className="w-full h-11 rounded-xl text-primary-foreground">
              {joining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Unirse al canal
            </Button>
          </div>
        </footer>
    </div>
  );
}
