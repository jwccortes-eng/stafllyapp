/**
 * DocumentIntakeCenter — admin-only bulk document intake.
 *
 * Workers cannot reach this page. Admin uploads → AI suggests → admin confirms
 * → row written to employee_documents via SECURITY DEFINER RPC.
 *
 * No auto-approve. No auto-index. AI never truth.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OperationalWorkspace, WorkspaceTabs } from "@/components/stafly-ui/OperationalWorkspace";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { formatDateUS, todayIso } from "@/lib/date-format";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, CheckCircle2, XCircle, Clock, ShieldAlert, Sparkles, ExternalLink, User as UserIcon, Monitor } from "lucide-react";
import { resolveEmployeeDocumentUrl } from "@/lib/employee-documents";

type Item = any;
type Batch = any;

const CATEGORIES = [
  { value: "drivers_license", label: "Licencia de conducir" },
  { value: "id_card", label: "ID / Cédula" },
  { value: "passport", label: "Pasaporte" },
  { value: "permanent_resident_card", label: "Residencia permanente" },
  { value: "social_security_card", label: "Tarjeta SSN" },
  { value: "work_permit", label: "Permiso de trabajo" },
  { value: "w9", label: "W-9 (sensible)" },
  { value: "other", label: "Otro" },
];

const SIDES = [
  { value: "front", label: "Frente" },
  { value: "back", label: "Reverso" },
  { value: "full", label: "Documento completo" },
  { value: "unknown", label: "Desconocido" },
];

function ConfidenceBadge({ score, reason }: { score?: number | null; reason?: string | null }) {
  const level = score == null ? "none" : score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low";
  const cls =
    level === "high" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
    level === "medium" ? "border-amber-200 bg-amber-50 text-amber-700" :
    level === "low" ? "border-rose-200 bg-rose-50 text-rose-700" :
    "border-muted-foreground/20 bg-muted/30 text-muted-foreground";
  const label =
    level === "high" ? "Confianza alta" :
    level === "medium" ? "Confianza media" :
    level === "low" ? "Confianza baja" : "Sin sugerencia";
  return (
    <Badge variant="outline" className={cls} title={reason ?? undefined}>
      <Sparkles className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; icon: any }> = {
    pending_extraction: { cls: "border-muted-foreground/20 bg-muted/30 text-muted-foreground", label: "Pendiente de extracción", icon: Clock },
    extracted:          { cls: "border-sky-200 bg-sky-50 text-sky-700",                          label: "Sugerencia lista",       icon: Sparkles },
    needs_review:       { cls: "border-amber-200 bg-amber-50 text-amber-700",                    label: "Necesita revisión",      icon: ShieldAlert },
    indexed:            { cls: "border-emerald-200 bg-emerald-50 text-emerald-700",              label: "Indexado",               icon: CheckCircle2 },
    rejected:           { cls: "border-rose-200 bg-rose-50 text-rose-700",                       label: "Rechazado",              icon: XCircle },
    failed:             { cls: "border-rose-200 bg-rose-50 text-rose-700",                       label: "Falló",                  icon: XCircle },
  };
  const m = map[status] ?? map.pending_extraction;
  const Icon = m.icon;
  return <Badge variant="outline" className={m.cls}><Icon className="h-3 w-3 mr-1" />{m.label}</Badge>;
}

type QueueFilter = "pending" | "ready" | "indexed" | "rejected" | "all";

export default function DocumentIntakeCenter() {
  const { selectedCompanyId } = useCompany();
  const { user, canAccessAdminForCompany } = useAuth() as any;
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [uploading, setUploading] = useState(false);

  const isAdmin = !selectedCompanyId
    ? false
    : (canAccessAdminForCompany?.(selectedCompanyId) ?? false);

  // Items list (last 100, this company).
  const itemsQ = useQuery({
    queryKey: ["intake-items", selectedCompanyId],
    enabled: !!selectedCompanyId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_intake_items" as any)
        .select("*")
        .eq("company_id", selectedCompanyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  // Employees roster for the worker picker (lightweight).
  const empQ = useQuery({
    queryKey: ["intake-employees", selectedCompanyId],
    enabled: !!selectedCompanyId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, employer_identification")
        .eq("company_id", selectedCompanyId)
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const empById = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of empQ.data ?? []) m.set(e.id, e);
    return m;
  }, [empQ.data]);

  // Upload files → create batch + insert items + trigger extract per item.
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !selectedCompanyId || !user?.id) return;
    setUploading(true);
    try {
      const { data: batchData, error: bErr } = await (supabase
        .from("document_intake_batches" as any) as any)
        .insert({
          company_id: selectedCompanyId,
          uploaded_by: user.id,
          status: "processing",
          total_files: files.length,
        })
        .select()
        .single();
      const batch = batchData as { id: string } | null;
      if (bErr || !batch) throw bErr ?? new Error("Could not create batch");

      const created: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${selectedCompanyId}/intake/${batch.id}/${crypto.randomUUID()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("employee-documents")
          .upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) { console.error("upload error", upErr); continue; }

        const { data: itemRow, error: iErr } = await (supabase
          .from("document_intake_items" as any) as any)
          .insert({
            batch_id: batch.id,
            company_id: selectedCompanyId,
            storage_path: path,
            original_filename: f.name,
            mime_type: f.type || null,
            status: "pending_extraction",
          })
          .select()
          .single();
        if (iErr || !itemRow) { console.error("item insert error", iErr); continue; }
        created.push((itemRow as { id: string }).id);
      }

      await (supabase.from("document_intake_batches" as any) as any)
        .update({ status: "ready_for_review" }).eq("id", batch.id);


      toast({ title: `Subidos ${created.length} archivos`, description: "Extrayendo sugerencias…" });
      qc.invalidateQueries({ queryKey: ["intake-items", selectedCompanyId] });

      // Fire-and-forget extract per item (sequential to avoid rate limits).
      for (const id of created) {
        try {
          await supabase.functions.invoke("document-intake-extract", { body: { intake_item_id: id } });
        } catch (e) { console.warn("extract fail", id, e); }
        qc.invalidateQueries({ queryKey: ["intake-items", selectedCompanyId] });
      }
    } catch (e: any) {
      toast({ title: "Error al subir", description: e?.message ?? "Error desconocido", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">Selecciona una empresa para usar la bandeja de documentos.</div>;
  }
  if (!isAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Solo administradores pueden ver la bandeja de documentos.</div>;
  }

  const allItems = itemsQ.data ?? [];
  const counts = {
    pending: allItems.filter((i: any) => ["pending_extraction", "extracted", "needs_review", "failed"].includes(i.status)).length,
    ready: allItems.filter((i: any) => ["extracted", "needs_review"].includes(i.status)).length,
    indexed: allItems.filter((i: any) => i.status === "indexed").length,
    rejected: allItems.filter((i: any) => i.status === "rejected").length,
    all: allItems.length,
  };
  const filteredItems = allItems.filter((i: any) => {
    switch (filter) {
      case "pending": return ["pending_extraction", "extracted", "needs_review", "failed"].includes(i.status);
      case "ready": return ["extracted", "needs_review"].includes(i.status);
      case "indexed": return i.status === "indexed";
      case "rejected": return i.status === "rejected";
      default: return true;
    }
  });

  return (
    <OperationalWorkspace
      title="Bandeja de documentos"
      context="Sugerencias del sistema. No se guarda nada sin revisión humana."
      action={
        <div className="hidden md:block">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            Importar documentos
          </Button>
        </div>
      }
      tabs={
        <WorkspaceTabs
          items={[
            { key: "pending", label: "Pendientes", count: counts.pending },
            { key: "ready", label: "Listos para revisar", count: counts.ready },
            { key: "indexed", label: "Indexados", count: counts.indexed },
            { key: "rejected", label: "Rechazados", count: counts.rejected },
            { key: "all", label: "Todos", count: counts.all },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as QueueFilter)}
          ariaLabel="Estado del documento"
        />
      }
      adminTitle="Cómo funciona la importación"
      admin={
        <p className="text-xs text-muted-foreground leading-relaxed">
          La subida de documentos existentes (IDs, licencias, W-9, fotos, archivos sensibles)
          se hace desde computadora para proteger información sensible y evitar asignaciones
          incorrectas. Desde el móvil puedes revisar y aprobar documentos ya subidos.
        </p>
      }
    >
      <div className="pt-3">
        {itemsQ.isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            {allItems.length === 0
              ? "No hay documentos en la bandeja. Sube imágenes o PDFs para empezar."
              : filter === "pending"
                ? "Bandeja al día. No hay documentos pendientes de revisión."
                : "Sin documentos en esta vista."}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((it: any) => (
              <IntakeItemRow key={it.id} item={it} employees={empQ.data ?? []} empById={empById} onChanged={() => qc.invalidateQueries({ queryKey: ["intake-items", selectedCompanyId] })} />
            ))}
          </div>
        )}
      </div>
    </OperationalWorkspace>
  );
}

function IntakeItemRow({
  item, employees, empById, onChanged,
}: { item: Item; employees: any[]; empById: Map<string, any>; onChanged: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [empId, setEmpId] = useState<string>(item.suggested_employee_id ?? "");
  const [category, setCategory] = useState<string>(item.suggested_document_category ?? "");
  const [side, setSide] = useState<string>(item.suggested_document_side ?? "unknown");
  const [expires, setExpires] = useState<string>(item.suggested_expires_at ?? "");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveEmployeeDocumentUrl(item.storage_path).then((u) => { if (!cancelled) setPreviewUrl(u); });
    return () => { cancelled = true; };
  }, [item.storage_path]);

  const suggestedEmp = item.suggested_employee_id ? empById.get(item.suggested_employee_id) : null;
  const assignedEmp = empId ? empById.get(empId) : null;
  const isImg = (item.mime_type ?? "").startsWith("image/");
  const isW9 = category === "w9" || /w-?9|tax/i.test(item.original_filename ?? "");
  const isSocialSecurity = category === "social_security_card";
  const isIndexed = item.status === "indexed";
  const isRejected = item.status === "rejected";
  const locked = isIndexed || isRejected;

  const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? category ?? "—";
  const sideLabel = SIDES.find((s) => s.value === side)?.label ?? side;
  const expiresDisplay = expires ? formatDateUS(expires) : null;
  const isExpired = !!expires && expires < todayIso();

  async function confirm(approveDirect: boolean) {
    if (!empId) { toast({ title: "Falta el trabajador", description: "Selecciona el trabajador antes de indexar.", variant: "destructive" }); return; }
    if (!category) { toast({ title: "Falta el tipo", description: "Selecciona el tipo de documento.", variant: "destructive" }); return; }
    if (isW9) { toast({ title: "Documento sensible", description: "Los W-9 deben procesarse desde el flujo de W-9 guiado.", variant: "destructive" }); return; }
    if (isSocialSecurity) { toast({ title: "Documento restringido", description: "Social Security documents require a restricted handling policy. Do not import here.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const ts = Date.now();
      const safeName = (item.original_filename ?? "documento").replace(/[^a-zA-Z0-9._-]/g, "_");
      const sideSuffix = side && side !== "unknown" ? `_${side}` : "";
      const destPath = `${item.company_id}/${empId}/onboarding/${category}/${ts}${sideSuffix}_${safeName}`;
      const { error: cpErr } = await supabase.storage.from("employee-documents").copy(item.storage_path, destPath);
      if (cpErr) throw cpErr;

      // Managed display label: "Permiso de trabajo · Frente" — shown as document_type
      // in /app/documents instead of the raw filename. Original filename stays in
      // storage path for traceability.
      const catLabel = CATEGORIES.find((c) => c.value === category)?.label ?? category;
      const sideLbl = SIDES.find((s) => s.value === side)?.label ?? "";
      const managedName = side && side !== "unknown" && side !== "full"
        ? `${catLabel} · ${sideLbl}`
        : catLabel;

      const { error: rpcErr } = await supabase.rpc("intake_confirm_and_index" as any, {
        p_intake_item_id: item.id,
        p_employee_id: empId,
        p_category: category,
        p_file_url: destPath,
        p_file_name: managedName,
        p_file_type: item.mime_type ?? null,
        p_file_size: null,
        p_expires_at: expires || null,
        p_review_status: approveDirect ? "approved" : "pending",
      });
      if (rpcErr) throw rpcErr;
      toast({ title: "Documento indexado", description: "Ya está disponible en Documentos." });
      qc.invalidateQueries({ queryKey: ["employee-documents"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["intake-items"] });
      onChanged();
    } catch (e: any) {
      toast({ title: "No se pudo indexar", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(next: "rejected" | "needs_review") {
    setBusy(true);
    try {
      const { error } = await supabase.from("document_intake_items" as any).update({
        status: next, reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null, reviewed_at: new Date().toISOString(),
      }).eq("id", item.id);
      if (error) throw error;
      onChanged();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (hidden && isIndexed) return null;

  return (
    <Card className="p-4 grid gap-4 md:grid-cols-[200px_1fr]">
      <div className="space-y-2">
        <div className="rounded-md border bg-muted/20 h-40 flex items-center justify-center overflow-hidden">
          {previewUrl && isImg ? (
            <img src={previewUrl} alt={item.original_filename ?? ""} className="max-h-40 max-w-full object-contain" />
          ) : (
            <FileText className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate" title={item.original_filename ?? ""}>{item.original_filename}</p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          {!isIndexed && <ConfidenceBadge score={item.confidence_score} reason={item.confidence_reason} />}
          {isExpired && isIndexed && (
            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
              Vencido
            </Badge>
          )}
          {isW9 && !isIndexed && (
            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
              <ShieldAlert className="h-3 w-3 mr-1" /> Sensible — revisar manualmente
            </Badge>
          )}
        </div>

        {isIndexed ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-medium text-sm">
              <CheckCircle2 className="h-4 w-4" /> Documento indexado correctamente
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Trabajador</dt>
              <dd className="font-medium">
                {assignedEmp ? `${assignedEmp.first_name ?? ""} ${assignedEmp.last_name ?? ""}`.trim() : "—"}
                {assignedEmp?.employer_identification ? ` · #${assignedEmp.employer_identification}` : ""}
              </dd>
              <dt className="text-muted-foreground">Tipo</dt>
              <dd className="font-medium">{categoryLabel}</dd>
              <dt className="text-muted-foreground">Lado</dt>
              <dd className="font-medium">{sideLabel}</dd>
              <dt className="text-muted-foreground">Vencimiento</dt>
              <dd className={`font-medium ${isExpired ? "text-rose-700" : ""}`}>
                {expiresDisplay ?? "Sin fecha"}{isExpired ? " · Vencido" : ""}
              </dd>
            </dl>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="default" onClick={() => navigate(`/app/documents?employee=${empId}`)}>
                <ExternalLink className="h-4 w-4 mr-1.5" /> Ver en Documentos
              </Button>
              {empId && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/app/employees/${empId}`)}>
                  <UserIcon className="h-4 w-4 mr-1.5" /> Abrir trabajador
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setHidden(true)}>
                Ocultar de la bandeja
              </Button>
            </div>
          </div>
        ) : (
          <>
            {item.confidence_reason && (item.status === "needs_review" || item.status === "failed") && (
              <p className="text-xs text-muted-foreground">Motivo: {item.confidence_reason}</p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Trabajador {suggestedEmp && <span className="text-muted-foreground">· Sugerencia: {suggestedEmp.first_name} {suggestedEmp.last_name}</span>}</Label>
                <Select value={empId} onValueChange={setEmpId} disabled={locked}>
                  <SelectTrigger><SelectValue placeholder="Selecciona trabajador" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.first_name} {e.last_name}{e.employer_identification ? ` · #${e.employer_identification}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de documento</Label>
                <Select value={category} onValueChange={setCategory} disabled={locked}>
                  <SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c.value !== "social_security_card").map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSocialSecurity && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-2 text-rose-800 text-xs">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Social Security documents require a restricted handling policy. Do not import here.</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lado</Label>
                <Select value={side} onValueChange={setSide} disabled={locked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SIDES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vencimiento</Label>
                <SmartDateInput value={expires} onChange={setExpires} disabled={locked} />
              </div>
            </div>

            {item.suggested_document_number_masked && (
              <p className="text-xs text-muted-foreground">Número detectado (enmascarado): <span className="font-mono">{item.suggested_document_number_masked}</span></p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => confirm(false)} disabled={busy || locked || isW9}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar e indexar
              </Button>
              <Button size="sm" variant="outline" onClick={() => confirm(true)} disabled={busy || locked || isW9}>
                Confirmar y aprobar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus("needs_review")} disabled={busy || locked}>
                Dejar pendiente
              </Button>
              <Button size="sm" variant="ghost" className="text-rose-700 hover:text-rose-800" onClick={() => setStatus("rejected")} disabled={busy || locked}>
                <XCircle className="h-4 w-4 mr-1.5" /> Rechazar
              </Button>
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline text-muted-foreground self-center ml-auto">
                  Abrir archivo seguro
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

