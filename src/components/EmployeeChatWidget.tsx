import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "¿Cuánto fue mi último pago?",
  "¿Cuántas horas trabajé?",
  "¿Qué deducciones tengo?",
];

export default function EmployeeChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, []);

  // Load history when chat opens for the first time
  useEffect(() => {
    if (!open || historyLoaded || !user) return;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(50);
      if (data && data.length > 0) {
        setMessages(data.map((m: any) => ({ id: m.id, role: m.role, content: m.content })));
      }
      setHistoryLoaded(true);
    })();
  }, [open, historyLoaded, user]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const persistMessage = async (role: "user" | "assistant", content: string) => {
    if (!user) return;
    await supabase.from("chat_messages").insert({ user_id: user.id, role, content });
  };

  const clearHistory = async () => {
    if (!user) return;
    await supabase.from("chat_messages").delete().eq("user_id", user.id);
    setMessages([]);
    toast({ title: "Historial borrado" });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    persistMessage("user", trimmed);

    try {
      const { data, error } = await supabase.functions.invoke("employee-chat", {
        body: { message: trimmed },
      });

      if (error) throw new Error(error.message || "Error al contactar al asistente");
      if (data?.error) throw new Error(data.error);

      const reply = data?.reply || "No pude generar una respuesta.";
      const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: reply };
      setMessages((prev) => [...prev, assistantMsg]);
      persistMessage("assistant", reply);
    } catch (e: any) {
      const errorMessage = e?.message || "Error desconocido";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      const errMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${errorMessage}` };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed z-50 rounded-full shadow-lg transition-all duration-300",
          "bg-primary text-primary-foreground hover:shadow-xl hover:scale-105",
          "h-14 w-14 flex items-center justify-center",
          "bottom-24 right-5 md:bottom-8 md:right-8"
        )}
        aria-label={open ? "Cerrar chat" : "Abrir asistente"}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col bg-background border rounded-2xl shadow-2xl overflow-hidden",
            "transition-all duration-300 animate-fade-in",
            "bottom-40 right-4 left-4 h-[60vh] max-h-[500px]",
            "md:bottom-24 md:right-8 md:left-auto md:w-[400px] md:h-[520px]"
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b bg-card">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Asistente de Nómina</p>
              <p className="text-[11px] text-muted-foreground">Pregunta sobre tus pagos</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Borrar historial"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
                  <MessageCircle className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">¡Hola! 👋</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
                    Soy tu asistente de nómina. Pregunta sobre tus pagos, horas o deducciones.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-[11px] px-3 py-1.5 rounded-full border bg-card hover:bg-accent text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="m-0">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 justify-start">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t px-4 py-3 flex gap-2 items-center bg-card">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta..."
              disabled={loading}
              maxLength={1000}
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center transition-all",
                input.trim() && !loading
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
