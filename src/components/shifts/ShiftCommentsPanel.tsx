import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { Loader2, Send, Image, X, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface ShiftComment {
  id: string;
  content: string;
  attachments: { url: string; filename: string; type: string }[];
  author_id: string;
  author_type: string;
  employee_id: string | null;
  created_at: string;
}

interface ShiftCommentsPanelProps {
  shiftId: string;
  companyId: string;
  employees: { id: string; first_name: string; last_name: string }[];
}

export function ShiftCommentsPanel({ shiftId, companyId, employees }: ShiftCommentsPanelProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [comments, setComments] = useState<ShiftComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<{ url: string; filename: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from("shift_comments")
      .select("id, content, attachments, author_id, author_type, employee_id, created_at")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    setComments((data ?? []).map((c: any) => ({
      ...c,
      attachments: Array.isArray(c.attachments) ? c.attachments : [],
    })));
    setLoading(false);
  }, [shiftId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${companyId}/${shiftId}/comments/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("shift-attachments").upload(path, file);
      if (error) { toast.error(`Error: ${error.message}`); continue; }
      const { data: urlData } = supabase.storage.from("shift-attachments").getPublicUrl(path);
      setAttachments(prev => [...prev, { url: urlData.publicUrl, filename: file.name, type: file.type }]);
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (!content.trim() && attachments.length === 0) return;
    setSending(true);

    const { error } = await supabase.from("shift_comments").insert({
      company_id: companyId,
      shift_id: shiftId,
      author_id: user?.id,
      author_type: "user",
      content: content.trim(),
      attachments: attachments,
    } as any);

    if (error) { toast.error(error.message); setSending(false); return; }

    setContent("");
    setAttachments([]);
    setSending(false);
    loadComments();
  };

  const getAuthorName = (comment: ShiftComment) => {
    if (comment.author_type === "employee" && comment.employee_id) {
      const emp = employees.find(e => e.id === comment.employee_id);
      return emp ? `${emp.first_name} ${emp.last_name}` : "Empleado";
    }
    return "Admin";
  };

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0]?.slice(0, 2) || "?";
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Comentarios</p>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Sin comentarios aún</p>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {comments.map(c => {
            const name = getAuthorName(c);
            const [firstName, lastName] = name.split(" ");
            return (
              <div key={c.id} className="flex gap-2">
                <EmployeeAvatar firstName={firstName || ""} lastName={lastName || ""} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold">{name}</span>
                    <span className="text-[9px] text-muted-foreground">
                      {format(parseISO(c.created_at), "d MMM HH:mm", { locale: es })}
                    </span>
                  </div>
                  {c.content && <p className="text-xs text-muted-foreground">{c.content}</p>}
                  {c.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.attachments.map((att, i) => (
                        att.type?.startsWith("image/") ? (
                          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
                            <img src={att.url} alt={att.filename} className="h-12 w-12 rounded object-cover border" />
                          </a>
                        ) : (
                          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-primary bg-primary/5 rounded px-2 py-1">
                            <FileText className="h-3 w-3" /> {att.filename}
                          </a>
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New comment */}
      <div className="space-y-2 border-t border-border/30 pt-2">
        <Textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Agregar comentario..."
          rows={2}
          className="text-xs resize-none"
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] bg-muted/30 rounded px-2 py-1">
                {att.type.startsWith("image/") ? (
                  <img src={att.url} alt="" className="h-6 w-6 rounded object-cover" />
                ) : <FileText className="h-3 w-3" />}
                <span className="truncate max-w-[80px]">{att.filename}</span>
                <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                  <X className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" onChange={handleFileUpload} className="hidden" />
          <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Image className="h-3 w-3 mr-1" />}
            Foto
          </Button>
          <Button size="sm" className="h-7 text-[10px] px-3 ml-auto" onClick={handleSend} disabled={sending || (!content.trim() && attachments.length === 0)}>
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
