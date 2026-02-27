import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { Loader2, Send, Users, User, Image, X, MapPin, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Shift, Assignment, Employee } from "./types";

interface SendNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift;
  assignments: Assignment[];
  employees: Employee[];
}

interface NotificationTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  transaction_type: string;
}

export function SendNotificationDialog({
  open, onOpenChange, shift, assignments, employees,
}: SendNotificationDialogProps) {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [target, setTarget] = useState<"all" | "specific">("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [attachments, setAttachments] = useState<{ url: string; filename: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // Validation state
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);

  const shiftAssignments = assignments.filter(a => a.shift_id === shift.id);
  const assignedEmployees = shiftAssignments.map(a => {
    const emp = employees.find(e => e.id === a.employee_id);
    return emp ? { ...emp, assignmentId: a.id } : null;
  }).filter(Boolean) as (Employee & { assignmentId: string })[];

  const loadTemplates = useCallback(async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase
      .from("notification_templates")
      .select("id, name, subject, body, transaction_type")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true)
      .order("name");
    setTemplates((data ?? []) as NotificationTemplate[]);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (open) {
      loadTemplates();
      setTarget("all");
      setSelectedEmployeeId("");
      setSubject(`Turno: ${shift.title}`);
      setBody("");
      setMeetingPoint("");
      setAttachments([]);
      setSelectedTemplate("");
      setValidated(false);
      setValidationErrors([]);
    }
  }, [open, shift, loadTemplates]);

  const applyTemplate = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    setSelectedTemplate(templateId);

    // Replace variables in template
    let processedSubject = tmpl.subject
      .replace("{turno}", shift.title)
      .replace("{fecha}", shift.date)
      .replace("{hora_inicio}", shift.start_time.slice(0, 5))
      .replace("{hora_fin}", shift.end_time.slice(0, 5));

    let processedBody = tmpl.body
      .replace("{turno}", shift.title)
      .replace("{fecha}", shift.date)
      .replace("{hora_inicio}", shift.start_time.slice(0, 5))
      .replace("{hora_fin}", shift.end_time.slice(0, 5));

    setSubject(processedSubject);
    setBody(processedBody);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${selectedCompanyId}/${shift.id}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("shift-attachments")
        .upload(path, file);

      if (error) {
        toast.error(`Error subiendo ${file.name}: ${error.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("shift-attachments")
        .getPublicUrl(path);

      setAttachments(prev => [...prev, {
        url: urlData.publicUrl,
        filename: file.name,
        type: file.type,
      }]);
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const validate = () => {
    const errors: string[] = [];

    if (!subject.trim()) errors.push("El asunto es obligatorio.");
    if (!body.trim()) errors.push("El mensaje es obligatorio.");

    if (target === "all" && assignedEmployees.length === 0) {
      errors.push("No hay empleados asignados a este turno.");
    }

    if (target === "specific" && !selectedEmployeeId) {
      errors.push("Selecciona un empleado destinatario.");
    }

    setValidationErrors(errors);
    setValidated(true);
    return errors.length === 0;
  };

  const handleSend = async () => {
    if (!validate()) return;
    if (!selectedCompanyId) return;
    setSending(true);

    const recipientIds = target === "all"
      ? assignedEmployees.map(e => e.id)
      : [selectedEmployeeId];

    const fullBody = [
      body.trim(),
      meetingPoint.trim() ? `\n📍 Punto de encuentro: ${meetingPoint.trim()}` : "",
      attachments.length > 0 ? `\n📎 ${attachments.length} archivo(s) adjunto(s)` : "",
    ].filter(Boolean).join("");

    const notifications = recipientIds.map(eid => ({
      company_id: selectedCompanyId,
      recipient_id: eid,
      recipient_type: "employee",
      type: "shift_notification",
      title: subject.trim(),
      body: fullBody,
      metadata: {
        shift_id: shift.id,
        shift_title: shift.title,
        meeting_point: meetingPoint.trim() || null,
        attachments,
        sent_by: user?.id,
      },
      created_by: user?.id,
    }));

    const { error } = await supabase.from("notifications").insert(notifications as any);

    if (error) {
      toast.error(error.message);
      setSending(false);
      return;
    }

    // Log activity
    await supabase.rpc("log_activity_detailed", {
      _action: "enviar_notificacion_turno",
      _entity_type: "scheduled_shift",
      _entity_id: shift.id,
      _company_id: selectedCompanyId,
      _details: {
        target,
        recipient_count: recipientIds.length,
        has_attachments: attachments.length > 0,
        has_meeting_point: !!meetingPoint.trim(),
      },
    });

    toast.success(`Notificación enviada a ${recipientIds.length} empleado(s)`);
    setSending(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Enviar notificación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Shift info */}
          <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-semibold">{shift.title}</p>
            <p className="text-muted-foreground">
              {shift.date} · {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
            </p>
          </div>

          {/* Target */}
          <div>
            <Label className="text-xs text-muted-foreground">Destinatario</Label>
            <Select value={target} onValueChange={v => { setTarget(v as any); setValidated(false); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    Turno completo ({assignedEmployees.length} personas)
                  </span>
                </SelectItem>
                <SelectItem value="specific">
                  <span className="flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    Empleado específico
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Specific employee picker */}
          {target === "specific" && (
            <div>
              <Label className="text-xs text-muted-foreground">Empleado</Label>
              <Select value={selectedEmployeeId} onValueChange={v => { setSelectedEmployeeId(v); setValidated(false); }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar empleado..." />
                </SelectTrigger>
                <SelectContent>
                  {assignedEmployees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      <span className="flex items-center gap-2">
                        <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                        {emp.first_name} {emp.last_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Template selector */}
          {templates.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Plantilla predeterminada</Label>
              <Select value={selectedTemplate} onValueChange={applyTemplate}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar plantilla..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3" />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subject */}
          <div>
            <Label className="text-xs text-muted-foreground">Asunto</Label>
            <Input
              value={subject}
              onChange={e => { setSubject(e.target.value); setValidated(false); }}
              placeholder="Asunto de la notificación..."
              className="h-9 text-sm"
            />
          </div>

          {/* Body */}
          <div>
            <Label className="text-xs text-muted-foreground">Mensaje</Label>
            <Textarea
              value={body}
              onChange={e => { setBody(e.target.value); setValidated(false); }}
              placeholder="Escribe el mensaje para los empleados..."
              rows={4}
              className="text-sm resize-none"
            />
          </div>

          {/* Meeting point */}
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Punto de encuentro (opcional)
            </Label>
            <Input
              value={meetingPoint}
              onChange={e => setMeetingPoint(e.target.value)}
              placeholder="Ej: Entrada principal del edificio..."
              className="h-9 text-sm"
            />
          </div>

          {/* Attachments */}
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Image className="h-3 w-3" /> Adjuntos (fotos, evidencia)
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs mt-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Image className="h-3 w-3 mr-1" />}
              Agregar archivos
            </Button>
            {attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 rounded-lg px-2 py-1.5">
                    {att.type.startsWith("image/") ? (
                      <img src={att.url} alt={att.filename} className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{att.filename}</span>
                    <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Validation results */}
          {validated && (
            <div className={cn(
              "rounded-lg border p-3 space-y-1",
              validationErrors.length > 0
                ? "border-destructive/30 bg-destructive/5"
                : "border-earning/30 bg-earning/5"
            )}>
              {validationErrors.length > 0 ? (
                validationErrors.map((err, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {err}
                  </p>
                ))
              ) : (
                <p className="text-xs text-earning flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Validación exitosa. Listo para enviar.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={validated && validationErrors.length === 0 ? handleSend : validate}
            disabled={sending}
            className="gap-1.5"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {validated && validationErrors.length === 0 ? "Enviar notificación" : "Validar y enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
