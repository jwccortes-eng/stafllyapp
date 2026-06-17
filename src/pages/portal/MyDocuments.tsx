/**
 * MyDocuments — worker self-service for required onboarding documents.
 *
 * Premium mobile-first UX:
 *  - Header card with progress + status pill driven by `useEmployeeReadiness`.
 *  - One row per required category with explicit state:
 *      • Uploaded → green pill, file name, view + delete actions
 *      • Missing  → amber pill, big "Upload" CTA
 *  - "Other documents" section for ad-hoc uploads (category=other).
 *
 * Storage:
 *  - Bucket `employee-documents` (private). Path convention:
 *    `<company_id>/<employee_id>/onboarding/<document_type>/<timestamp>_<filename>`.
 *    Files are stored as private storage paths and opened with signed URLs.
 *  - Files are listed via signed URLs on demand.
 *
 * Permissions:
 *  - RLS already lets workers SELECT/INSERT/DELETE their own rows in
 *    `employee_documents` (via `e.user_id = auth.uid()`). Admin uploads remain
 *    available from the admin onboarding page.
 */
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, FileText, Upload, CheckCircle2, AlertTriangle,
  Loader2, Eye, Trash2, FileWarning, Sparkles, ShieldCheck, CalendarClock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import {
  DOCUMENT_CATEGORIES,
  getRequiredDocumentsForCompany,
  type DocumentCategory,
} from "@/lib/onboarding/required-documents";
import {
  expirationPolicyFor,
  classifyExpiration,
  EXPIRATION_STATE_LABEL,
} from "@/lib/onboarding/document-expiration-policy";
import {
  policyFor,
  uploadHintFor,
  nameForSide,
  inferDocumentSide,
  missingSidesFor,
  SIDE_LABEL,
  type DocumentSide,
} from "@/lib/documents/document-policy";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PROFILE_STATUS_LABELS } from "@/lib/onboarding/profile-status";
import { resolveEmployeeDocumentUrl } from "@/lib/employee-documents";
import { formatDateUS } from "@/lib/date-format";
import DocumentPreviewDialog from "@/components/documents/DocumentPreviewDialog";
import { W9EntryCard } from "@/components/portal/W9EntryCard";
import { isEmployeeDriver } from "@/components/shifts/types";

type ReviewStatus = "pending" | "approved" | "rejected";

interface DocRow {
  id: string;
  name: string;
  file_url: string; // storage path
  file_type: string | null;
  file_size: number | null;
  category: DocumentCategory;
  created_at: string;
  review_status: ReviewStatus;
  rejection_reason: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
}

/** Aggregate state for a required category, picking the most favorable doc state. */
type CategoryState = "approved" | "pending" | "rejected" | "missing";
function categoryState(items: DocRow[]): CategoryState {
  if (!items || items.length === 0) return "missing";
  if (items.some((d) => d.review_status === "approved")) return "approved";
  if (items.some((d) => d.review_status === "pending")) return "pending";
  return "rejected";
}

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export default function MyDocuments() {
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const readiness = useEmployeeReadiness(employeeId);
  const { toast } = useToast();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [canDrive, setCanDrive] = useState(false);
  const [required, setRequired] = useState<DocumentCategory[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingCat, setUploadingCat] = useState<DocumentCategory | null>(null);
  const [expirationDates, setExpirationDates] = useState<Record<string, string>>({});
  const [previewDoc, setPreviewDoc] = useState<DocRow | null>(null);

  // Hidden file inputs keyed by category — clicking a category's button triggers its input.
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);

    const { data: emp } = await supabase
      .from("employees")
      .select("company_id, has_car")
      .eq("id", employeeId)
      .maybeSingle();

    if (!emp) { setLoading(false); return; }
    setCompanyId(emp.company_id);
    setCanDrive(!!emp.has_car);

    const req = await getRequiredDocumentsForCompany(emp.company_id, { canDrive: !!emp.has_car });
    setRequired(req);

    const { data: rows } = await supabase
      .from("employee_documents" as any)
      .select("id, name, file_url, file_type, file_size, category, created_at, review_status, rejection_reason, reviewed_at, expires_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    setDocs((rows as any[] ?? []) as DocRow[]);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { refresh(); }, [refresh]);

  /** Group docs by category for quick lookup. */
  const docsByCategory = useMemo(() => {
    const m = new Map<DocumentCategory, DocRow[]>();
    for (const d of docs) {
      const arr = m.get(d.category) ?? [];
      arr.push(d);
      m.set(d.category, arr);
    }
    return m;
  }, [docs]);

  const otherDocs = docsByCategory.get("other") ?? [];

  // Approved is the only state that fulfills a requirement (matches readiness rule).
  const approvedCount = required.filter(
    (c) => categoryState(docsByCategory.get(c) ?? []) === "approved",
  ).length;
  const pendingReviewCount = required.filter(
    (c) => categoryState(docsByCategory.get(c) ?? []) === "pending",
  ).length;
  const allRequiredDone = required.length > 0 && approvedCount === required.length;

  const handleUpload = async (
    category: DocumentCategory,
    file: File,
    expiresAt?: string | null,
    side: DocumentSide = "full",
  ) => {
    if (!employeeId || !companyId) return;
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: "Archivo demasiado grande", description: "Máximo 15 MB por documento.", variant: "destructive" });
      return;
    }
    setUploadingCat(category);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
      const timestamp = Date.now();
      const sideTag = side === "front" ? "front" : side === "back" ? "back" : "full";
      const path = `${companyId}/${employeeId}/onboarding/${category}/${timestamp}_${sideTag}_${safeBase}`;

      const { error: upErr } = await supabase.storage
        .from("employee-documents")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;

      const displayName = nameForSide(file.name, side);

      const { error: rowErr } = await (supabase.from("employee_documents" as any) as any).insert({
        employee_id: employeeId,
        company_id: companyId,
        name: displayName,
        file_url: path,
        file_type: file.type || ext,
        file_size: file.size,
        category,
        review_status: "pending",
        expires_at: expiresAt || null,
      });
      if (rowErr) {
        await supabase.storage.from("employee-documents").remove([path]).catch(() => undefined);
        throw rowErr;
      }

      toast({ title: "Documento subido", description: "Revisaremos el documento antes de marcarlo como aprobado." });
      await refresh();
      readiness.refresh();
      // Auto-open preview so the worker can see what they uploaded.
      const { data: latest } = await supabase
        .from("employee_documents" as any)
        .select("id, name, file_url, file_type, file_size, category, created_at, review_status, rejection_reason, reviewed_at, expires_at")
        .eq("employee_id", employeeId)
        .eq("category", category)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) setPreviewDoc(latest as any);
    } catch (err: any) {
      toast({ title: "Error al subir", description: err?.message ?? "Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      setUploadingCat(null);
    }
  };

  const handleDelete = async (doc: DocRow) => {
    if (!employeeId) return;
    if (!confirm(`¿Eliminar "${doc.name}"?`)) return;
    try {
      // file_url stores the path inside the bucket
      if (doc.file_url) {
        await supabase.storage.from("employee-documents").remove([doc.file_url]);
      }
      await supabase.from("employee_documents" as any).delete().eq("id", doc.id);
      await refresh();
      readiness.refresh();
      toast({ title: "Documento eliminado" });
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err?.message ?? "Inténtalo de nuevo.", variant: "destructive" });
    }
  };

  const handleView = (doc: DocRow) => {
    if (!doc.file_url) return;
    setPreviewDoc(doc);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 pb-20">
        <div className="h-28 animate-pulse bg-muted rounded-2xl" />
        <div className="h-20 animate-pulse bg-muted rounded-2xl" />
        <div className="h-20 animate-pulse bg-muted rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Back link */}
      <Link
        to="/portal/profile"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Perfil
      </Link>

      {/* Header card */}
      <div
        className={cn(
          "rounded-2xl border-2 p-4 shadow-sm",
          allRequiredDone
            ? "border-earning/25 bg-earning/[0.05]"
            : "border-warning/25 bg-warning/[0.06]",
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              allRequiredDone ? "bg-earning/15" : "bg-warning/15",
            )}
          >
            {allRequiredDone ? (
              <Sparkles className="h-5 w-5 text-earning" />
            ) : (
              <FileWarning className="h-5 w-5 text-warning" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold font-heading text-foreground leading-tight">
              Mis documentos
            </h1>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {allRequiredDone
                ? "Todos los documentos requeridos están aprobados."
                : pendingReviewCount > 0
                  ? `${approvedCount} de ${required.length} aprobados · ${pendingReviewCount} en revisión`
                  : `${approvedCount} de ${required.length} requeridos aprobados.`}
            </p>
          </div>
          {readiness.status && (
            <span
              className={cn(
                "text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded-full border",
                allRequiredDone
                  ? "bg-earning/10 text-earning border-earning/20"
                  : "bg-warning/10 text-warning border-warning/20",
              )}
            >
              {PROFILE_STATUS_LABELS[readiness.status]}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {required.length > 0 && (
          <div className="mt-3 h-1.5 w-full rounded-full bg-background/60 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                allRequiredDone ? "bg-earning" : "bg-warning",
              )}
              style={{
                width: `${Math.round((approvedCount / Math.max(required.length, 1)) * 100)}%`,
              }}
            />
          </div>
        )}

        <p className="text-[10.5px] text-muted-foreground/70 mt-3 flex items-start gap-1.5">
          <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />
          Tus archivos son privados. Solo los administradores de tu compañía pueden revisarlos.
        </p>
      </div>

      {/* W-9 guided form entry */}
      <W9EntryCard />

      {/* Required categories */}
      <div className="space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-1">
          Requeridos
        </p>
        {required.length === 0 ? (
          <div className="rounded-2xl border border-border/40 bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Tu compañía aún no ha solicitado documentos.
            </p>
          </div>
        ) : (
          required.map((cat) => {
            const items = docsByCategory.get(cat) ?? [];
            const meta = DOCUMENT_CATEGORIES[cat];
            const state = categoryState(items);
            const isUploading = uploadingCat === cat;

            // Visual tokens per state
            const tone = {
              approved: { border: "border-earning/25", iconBg: "bg-earning/12", icon: "text-earning", badge: "bg-earning/10 text-earning", label: "Aprobado" },
              pending:  { border: "border-warning/25", iconBg: "bg-warning/12", icon: "text-warning", badge: "bg-warning/10 text-warning", label: "Pendiente de revisión" },
              rejected: { border: "border-deduction/30", iconBg: "bg-deduction/12", icon: "text-deduction", badge: "bg-deduction/10 text-deduction", label: "Rechazado" },
              missing:  { border: "border-warning/30", iconBg: "bg-muted", icon: "text-muted-foreground", badge: "bg-warning/10 text-warning", label: "Requerido" },
            }[state];

            const Icon =
              state === "approved" ? CheckCircle2 :
              state === "pending"  ? Loader2 :
              state === "rejected" ? AlertTriangle :
              FileText;

            // Most recent rejection reason (if any) — surfaced to the worker.
            const lastRejection = items.find((d) => d.review_status === "rejected" && d.rejection_reason);

            const ctaLabel =
              state === "approved" ? "Reemplazar o agregar otro" :
              state === "rejected" ? "Subir nuevo archivo" :
              state === "pending"  ? "Agregar otro archivo" :
              "Subir documento";

            return (
              <div
                key={cat}
                className={cn(
                  "rounded-2xl border bg-card p-3.5 shadow-xs transition-all",
                  tone.border,
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", tone.iconBg)}>
                    <Icon className={cn("h-4 w-4", tone.icon, state === "pending" && "animate-spin")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground leading-tight">{meta.label}</p>
                      <span className={cn("text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full", tone.badge)}>
                        {tone.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-snug">{meta.hint}</p>
                  </div>
                </div>

                {/* Rejection reason */}
                {state === "rejected" && lastRejection?.rejection_reason && (
                  <div className="mt-3 rounded-xl border border-deduction/20 bg-deduction/[0.05] p-2.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-deduction mb-1">
                      Motivo de rechazo
                    </p>
                    <p className="text-[11.5px] text-foreground/90 leading-snug">
                      {lastRejection.rejection_reason}
                    </p>
                  </div>
                )}

                {/* Uploaded file list */}
                {items.length > 0 && (
                  <div className="mt-3 space-y-1.5 pl-1">
                    {items.map((d) => {
                      const itemBadge =
                        d.review_status === "approved" ? "bg-earning/10 text-earning" :
                        d.review_status === "rejected" ? "bg-deduction/10 text-deduction" :
                        "bg-warning/10 text-warning";
                      const itemLabel =
                        d.review_status === "approved" ? "Aprobado" :
                        d.review_status === "rejected" ? "Rechazado" :
                        "Pendiente";
                      const expState = classifyExpiration(cat, d.expires_at);
                      const showExpRow =
                        d.expires_at ||
                        expState === "missing_expiration" ||
                        expState === "expired" ||
                        expState === "expiring_soon";
                      return (
                        <div key={d.id} className="rounded-xl bg-muted/30 px-2.5 py-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[11.5px] text-foreground truncate flex-1">{d.name}</span>
                            <span className={cn("text-[8.5px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full", itemBadge)}>
                              {itemLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleView(d)}
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background"
                              aria-label="Ver documento"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(d)}
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              aria-label="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {showExpRow && (
                            <div className="flex items-center gap-1.5 pl-5 text-[10.5px] text-muted-foreground">
                              <CalendarClock className="h-3 w-3 shrink-0" />
                              {d.expires_at ? (
                                <span>
                                  Vence {formatDateUS(new Date(d.expires_at)) || "—"} · {EXPIRATION_STATE_LABEL[expState]}
                                </span>
                              ) : (
                                <span className="text-amber-700">
                                  Falta fecha de vencimiento — vuelve a subir el archivo con la fecha o pídele a tu admin que la registre.
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Expiration date input — only for expiration-required/recommended categories */}
                {(expirationPolicyFor(cat) === "required" || expirationPolicyFor(cat) === "recommended") && (
                  <div className="mt-3 space-y-1">
                    <label className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      Fecha de vencimiento {expirationPolicyFor(cat) === "required" ? "(requerida)" : "(recomendada)"}
                    </label>
                    <SmartDateInput
                      value={expirationDates[cat] ?? ""}
                      onChange={(iso) => setExpirationDates((prev) => ({ ...prev, [cat]: iso }))}
                      allowClear
                      showCalendar
                      placeholder="MM/DD/YYYY"
                    />
                    <p className="text-[10px] text-muted-foreground/70">
                      Se aplicará al próximo archivo que subas en esta categoría.
                    </p>
                  </div>
                )}

                {/* Side requirements — Frente / Reverso slots when needed */}
                {(() => {
                  const pol = policyFor(cat);
                  const needsSides = pol.side === "front_back_required" || pol.side === "front_back_recommended";
                  const missingSides = missingSidesFor(cat, items.map((d) => d.name));
                  const inputKey = (s: DocumentSide) => `${cat}__${s}`;

                  if (!needsSides) {
                    return (
                      <div className="mt-3 space-y-2">
                        <p className="text-[10.5px] text-muted-foreground/80">
                          {uploadHintFor(cat)}
                        </p>
                        <input
                          ref={(el) => { inputsRef.current[cat] = el; }}
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(cat, f, expirationDates[cat] || null, "full");
                            if (e.target) e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant={state === "approved" ? "outline" : "default"}
                          size="sm"
                          className="w-full h-9 text-xs gap-1.5"
                          disabled={isUploading}
                          onClick={() => inputsRef.current[cat]?.click()}
                        >
                          {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {ctaLabel}
                        </Button>
                      </div>
                    );
                  }

                  const renderSlot = (side: "front" | "back", required: boolean) => {
                    const sideLabel = SIDE_LABEL[side];
                    const present = !missingSides.includes(side);
                    return (
                      <div key={side} className="rounded-xl border border-border/50 bg-muted/20 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-foreground">
                            {sideLabel}
                            <span className="ml-1.5 text-[9.5px] uppercase tracking-wider text-muted-foreground/70">
                              {required ? "Requerido" : "Recomendado"}
                            </span>
                          </span>
                          {present ? (
                            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-earning/10 text-earning">
                              Subido
                            </span>
                          ) : (
                            <span className={cn(
                              "text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full",
                              required ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
                            )}>
                              Falta
                            </span>
                          )}
                        </div>
                        <input
                          ref={(el) => { inputsRef.current[inputKey(side)] = el; }}
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(cat, f, expirationDates[cat] || null, side);
                            if (e.target) e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant={present ? "outline" : "default"}
                          size="sm"
                          className="w-full h-8 text-[11px] gap-1.5"
                          disabled={isUploading}
                          onClick={() => inputsRef.current[inputKey(side)]?.click()}
                        >
                          {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {present ? `Reemplazar ${sideLabel.toLowerCase()}` : `Sube el ${sideLabel.toLowerCase()}`}
                        </Button>
                      </div>
                    );
                  };

                  const backRequired = pol.side === "front_back_required";

                  return (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10.5px] text-muted-foreground/80">
                        {uploadHintFor(cat)}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {renderSlot("front", true)}
                        {renderSlot("back", backRequired)}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>


      {/* Other / optional documents */}
      <div className="space-y-2.5 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-1">
          Otros documentos
        </p>
        <div className="rounded-2xl border border-border/40 bg-card p-3.5 shadow-xs">
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Cualquier otro documento que tu compañía solicite. Súbelo aquí.
          </p>

          {otherDocs.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {otherDocs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 rounded-xl bg-muted/30 px-2.5 py-2"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11.5px] text-foreground truncate flex-1">{d.name}</span>
                  <button
                    type="button"
                    onClick={() => handleView(d)}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background"
                    aria-label="Ver documento"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3">
            <input
              ref={(el) => { inputsRef.current["other"] = el; }}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload("other", f);
                if (e.target) e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs gap-1.5"
              disabled={uploadingCat === "other"}
              onClick={() => inputsRef.current["other"]?.click()}
            >
              {uploadingCat === "other" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Subir otro documento
            </Button>
          </div>
        </div>

        {!canDrive && (
          <p className="text-[10px] text-muted-foreground/60 px-1 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            Si vas a manejar para la compañía, pídele a tu supervisor que lo active en tu perfil
            para que tu licencia de conducir sea un documento requerido.
          </p>
        )}
      </div>

      <DocumentPreviewDialog
        open={!!previewDoc}
        onOpenChange={(o) => { if (!o) setPreviewDoc(null); }}
        item={previewDoc ? {
          file_path: previewDoc.file_url,
          file_type: previewDoc.file_type,
          file_name: previewDoc.name,
          document_type: (DOCUMENT_CATEGORIES as any)[previewDoc.category]?.label ?? previewDoc.category,
          category: previewDoc.category,
          uploaded_at: previewDoc.created_at,
          expires_at: previewDoc.expires_at,
          review_status: previewDoc.review_status,
        } : null}
        banner={
          <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-[11px] px-2.5 py-1.5">
            Revisaremos el documento antes de marcarlo como aprobado.
          </div>
        }
      />
    </div>
  );
}
