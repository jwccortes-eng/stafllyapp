import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useSoundContext } from "@/hooks/useSound";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Lock, Unlock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, subDays, addDays, isAfter, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  content: string;
  sender_type: string;
  sender_employee_id: string | null;
  sender_user_id: string | null;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string | null;
  sender_gender?: string | null;
}

interface ShiftChatPanelProps {
  shiftId: string;
  shiftDate: string;
  companyId: string;
  /** Force admin mode. If omitted, role is derived from useAuth + company scope. */
  isAdmin?: boolean;
}

export function ShiftChatPanel({ shiftId, shiftDate, companyId, isAdmin: isAdminProp }: ShiftChatPanelProps) {
  const { user, allRoles, resolveEmployeeForCompany } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const allRolesArray = useMemo(() => Array.from(allRoles), [allRoles]);
  const [isCompanyScopedAdmin, setIsCompanyScopedAdmin] = useState(false);
  const isAdmin = isAdminProp ?? isCompanyScopedAdmin;
  const employeeId = effectiveEmployeeId ?? resolveEmployeeForCompany(companyId);
  const { play } = useSoundContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [chatConfig, setChatConfig] = useState<{ is_open: boolean; id?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Determine if chat should be auto-open based on date
  const shiftDateObj = parseISO(shiftDate);
  const autoOpenDate = subDays(shiftDateObj, 1);
  const autoCloseDate = addDays(shiftDateObj, 1);
  const now = new Date();
  const isInAutoWindow = isAfter(now, autoOpenDate) && isBefore(now, autoCloseDate);

  const loadMessages = useCallback(async () => {
    setLoading(true);

    const { data: config } = await supabase
      .from("shift_chat_config")
      .select("id, is_open")
      .eq("shift_id", shiftId)
      .maybeSingle();

    if (config) {
      setChatConfig(config);
    } else {
      setChatConfig({ is_open: isInAutoWindow });
    }

    const { data } = await supabase
      .from("shift_chat_messages")
      .select("id, content, sender_type, sender_employee_id, sender_user_id, created_at")
      .eq("shift_id", shiftId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    if (data && data.length > 0) {
      const empIds = [...new Set(data.filter(m => m.sender_employee_id).map(m => m.sender_employee_id!))];
      const userIds = [...new Set(data.filter(m => m.sender_user_id).map(m => m.sender_user_id!))];

      let empMap: Record<string, { first_name: string; last_name: string; avatar_url: string | null; gender: string | null }> = {};
      let userMap: Record<string, string> = {};

      if (empIds.length > 0) {
        const { data: emps } = await supabase
          .from("employees")
          .select("id, first_name, last_name, avatar_url, gender")
          .in("id", empIds);
        (emps ?? []).forEach(e => { empMap[e.id] = e; });
      }

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        (profiles ?? []).forEach(p => { userMap[p.user_id] = p.full_name || "Admin"; });
      }

      setMessages(data.map(m => {
        const emp = m.sender_employee_id ? empMap[m.sender_employee_id] : null;
        return {
          ...m,
          sender_name: emp ? `${emp.first_name} ${emp.last_name}` : (m.sender_user_id ? (userMap[m.sender_user_id] || "Admin") : "Sistema"),
          sender_avatar: emp?.avatar_url,
          sender_gender: emp?.gender,
        };
      }));
    } else {
      setMessages([]);
    }

    setLoading(false);
  }, [shiftId, isInAutoWindow]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    let cancelled = false;

    const resolveScopedAdmin = async () => {
      if (!user?.id || !companyId) {
        if (!cancelled) setIsCompanyScopedAdmin(false);
        return;
      }

      if (allRoles.has("developer") || allRoles.has("owner")) {
        if (!cancelled) setIsCompanyScopedAdmin(true);
        return;
      }

      const { data, error } = await supabase.rpc("user_is_company_admin", {
        _company_id: companyId,
        _user_id: user.id,
      });

      if (cancelled) return;

      if (error) {
        console.error("[shift-chat] admin scope resolution failed", {
          companyId,
          authUserId: user.id,
          error,
        });
        setIsCompanyScopedAdmin(false);
        return;
      }

      setIsCompanyScopedAdmin(Boolean(data));
    };

    void resolveScopedAdmin();

    return () => {
      cancelled = true;
    };
  }, [allRoles, companyId, user?.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`shift-chat-${shiftId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "shift_chat_messages",
        filter: `shift_id=eq.${shiftId}`,
      }, (payload) => {
        const senderId = (payload.new as any)?.sender_user_id || (payload.new as any)?.sender_employee_id;
        const isOwnMessage = senderId === user?.id || senderId === employeeId;
        if (!isOwnMessage) {
          void play("chat");
        }
        loadMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [shiftId, loadMessages, play, user, employeeId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isChatOpen = chatConfig?.is_open ?? isInAutoWindow;

  const handleSend = async () => {
    if (!text.trim() || !isChatOpen) return;
    if (!isAdmin && !employeeId) {
      console.info("[shift-chat] send blocked before insert", {
        authUserId: user?.id ?? null,
        employeeId,
        selectedCompanyId,
        shiftCompanyId: companyId,
        isAdmin,
        allRoles: allRolesArray,
        reason: "missing employee identity for employee sender",
      });
      toast.error("No tienes acceso a este chat");
      return;
    }
    setSending(true);

    if (!chatConfig?.id) {
      const { data: created, error: cfgErr } = await supabase
        .from("shift_chat_config")
        .upsert(
          { shift_id: shiftId, company_id: companyId, is_open: true } as any,
          { onConflict: "shift_id" }
        )
        .select("id, is_open")
        .maybeSingle();
      if (cfgErr || !created) {
        console.error("[shift-chat] thread init failed", cfgErr);
        toast.error("No se pudo inicializar el chat del turno");
        setSending(false);
        return;
      }
      setChatConfig(created);
    }

    const sender_type = isAdmin ? "admin" : "employee";
    const msg: any = {
      shift_id: shiftId,
      company_id: companyId,
      content: text.trim(),
      sender_type,
    };
    if (sender_type === "admin" && user) msg.sender_user_id = user.id;
    else if (employeeId) msg.sender_employee_id = employeeId;

    console.info("[shift-chat] insert attempt", {
      authUserId: user?.id ?? null,
      employeeId,
      selectedCompanyId,
      shiftCompanyId: companyId,
      isAdmin,
      allRoles: allRolesArray,
      sender_type,
      sender_user_id: msg.sender_user_id ?? null,
      sender_employee_id: msg.sender_employee_id ?? null,
      payload: msg,
    });

    const { error } = await supabase.from("shift_chat_messages").insert(msg);
    if (error) {
      console.error("[shift-chat] send failed", {
        code: (error as any)?.code ?? null,
        message: error.message ?? null,
        details: (error as any)?.details ?? null,
        hint: (error as any)?.hint ?? null,
        payload: msg,
        authUserId: user?.id ?? null,
        employeeId,
        selectedCompanyId,
        shiftCompanyId: companyId,
        isAdmin,
        allRoles: allRolesArray,
        sender_type,
        sender_user_id: msg.sender_user_id ?? null,
        sender_employee_id: msg.sender_employee_id ?? null,
      });
      const code = (error as any)?.code;
      const m = (error.message || "").toLowerCase();
      if (code === "42501" || m.includes("row-level security") || m.includes("policy")) {
        toast.error(isAdmin ? "No tienes permisos para escribir en este chat" : "No estás asignado a este turno");
      } else if (m.includes("foreign key") || m.includes("violates")) {
        toast.error("El turno o el chat no es válido");
      } else {
        toast.error("Error al enviar mensaje");
      }
    } else {
      setText("");
    }
    setSending(false);
  };

  const toggleChat = async () => {
    if (!isAdmin) return;
    const newState = !isChatOpen;
    const payload: any = {
      shift_id: shiftId,
      company_id: companyId,
      is_open: newState,
      ...(newState ? { reopened_by: user?.id, reopened_at: new Date().toISOString() } : {}),
    };
    const { data, error } = await supabase
      .from("shift_chat_config")
      .upsert(payload, { onConflict: "shift_id" })
      .select("id, is_open")
      .maybeSingle();
    if (error) {
      console.error("[shift-chat] toggle failed", error);
      toast.error("No se pudo actualizar el estado del chat");
      return;
    }
    if (data) setChatConfig(data);
    toast.success(newState ? "Chat reabierto" : "Chat cerrado");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentUserId = user?.id;
  const currentEmployeeId = employeeId;

  return (
    <div className="flex flex-col h-full min-h-0">
      {isAdmin && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            {isChatOpen ? (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-earning">
                <span className="h-1.5 w-1.5 rounded-full bg-earning animate-pulse" /> Chat activo
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                <Lock className="h-3 w-3" /> Chat cerrado
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleChat}
            className="text-[10px] gap-1"
          >
            {isChatOpen ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            {isChatOpen ? "Cerrar" : "Reabrir"}
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0" style={{ maxHeight: "300px" }}>
        {messages.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">Sin mensajes aún</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              {isChatOpen ? "Sé el primero en escribir" : "El chat está cerrado"}
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isOwn = (msg.sender_type === "admin" && msg.sender_user_id === currentUserId) ||
                          (msg.sender_type === "employee" && msg.sender_employee_id === currentEmployeeId);
            const nameParts = (msg.sender_name || "?").split(" ");

            return (
              <div key={msg.id} className={cn("flex gap-2", isOwn && "flex-row-reverse")}>
                {!isOwn && (
                  <EmployeeAvatar
                    firstName={nameParts[0] || "?"}
                    lastName={nameParts[1] || "?"}
                    avatarUrl={msg.sender_avatar}
                    gender={msg.sender_gender}
                    size="sm"
                  />
                )}
                <div className={cn("max-w-[75%] space-y-0.5", isOwn && "items-end")}>
                  {!isOwn && (
                    <p className="text-[10px] font-semibold text-muted-foreground px-1">
                      {msg.sender_name}
                      {msg.sender_type === "admin" && (
                        <span className="ml-1 text-[8px] bg-primary/10 text-primary px-1 py-0.5 rounded-full font-bold">ADMIN</span>
                      )}
                    </p>
                  )}
                  <div className={cn(
                    "rounded-2xl px-3 py-2 text-xs leading-relaxed",
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted/60 text-foreground rounded-bl-md"
                  )}>
                    {msg.content}
                  </div>
                  <p className={cn("text-[9px] text-muted-foreground/50 px-1", isOwn && "text-right")}>
                    {format(parseISO(msg.created_at), "HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isChatOpen ? (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/30 bg-background shrink-0">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Escribe un mensaje..."
            className="h-9 text-xs rounded-full bg-muted/40 border-0 focus-visible:ring-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="h-9 w-9 rounded-full shrink-0"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 px-3 py-3 border-t border-border/30 bg-muted/10 shrink-0">
          <Lock className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/60">Chat cerrado</span>
        </div>
      )}
    </div>
  );
}
