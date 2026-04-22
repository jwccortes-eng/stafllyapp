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
 *  - Bucket `employee-documents` (private). Path convention: `<employee_id>/<filename>`
 *    so the existing storage RLS allows reads for the worker's own folder.
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
  Loader2, Eye, Trash2, FileWarning, Sparkles, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import {
  DOCUMENT_CATEGORIES,
  getRequiredDocumentsForCompany,
  type DocumentCategory,
} from "@/lib/onboarding/required-documents";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PROFILE_STATUS_LABELS } from "@/lib/onboarding/profile-status";

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
      .select("id, name, file_url, file_type, file_size, category, created_at, review_status, rejection_reason, reviewed_at")
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

  const handleUpload = async (category: DocumentCategory, file: File) => {
    if (!employeeId || !companyId) return;
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: "File too large", description: "Max 15 MB per document.", variant: "destructive" });
      return;
    }
    setUploadingCat(category);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
      const path = `${employeeId}/${category}-${Date.now()}-${safeBase}`;

      const { error: upErr } = await supabase.storage
        .from("employee-documents")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;

      const { error: rowErr } = await (supabase.from("employee_documents" as any) as any).insert({
        employee_id: employeeId,
        company_id: companyId,
        name: file.name,
        file_url: path,
        file_type: file.type || ext,
        file_size: file.size,
        category,
      });
      if (rowErr) throw rowErr;

      toast({ title: "Document uploaded", description: DOCUMENT_CATEGORIES[category].label });
      await refresh();
      // Refresh readiness so banners across the portal update without a hard reload.
      readiness.refresh();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Try again.", variant: "destructive" });
    } finally {
      setUploadingCat(null);
    }
  };

  const handleDelete = async (doc: DocRow) => {
    if (!employeeId) return;
    if (!confirm(`Delete "${doc.name}"?`)) return;
    try {
      // file_url stores the path inside the bucket
      if (doc.file_url) {
        await supabase.storage.from("employee-documents").remove([doc.file_url]);
      }
      await supabase.from("employee_documents" as any).delete().eq("id", doc.id);
      await refresh();
      readiness.refresh();
      toast({ title: "Document removed" });
    } catch (err: any) {
      toast({ title: "Could not delete", description: err?.message ?? "Try again.", variant: "destructive" });
    }
  };

  const handleView = async (doc: DocRow) => {
    if (!doc.file_url) return;
    try {
      const { data, error } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(doc.file_url, 60);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({ title: "Could not open file", description: err?.message ?? "Try again.", variant: "destructive" });
    }
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
        <ArrowLeft className="h-3.5 w-3.5" /> Profile
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
              My documents
            </h1>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {allRequiredDone
                ? "All required documents are on file."
                : `${uploadedCount} of ${required.length} required uploaded.`}
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
                width: `${Math.round((uploadedCount / Math.max(required.length, 1)) * 100)}%`,
              }}
            />
          </div>
        )}

        <p className="text-[10.5px] text-muted-foreground/70 mt-3 flex items-start gap-1.5">
          <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />
          Your files are private. Only your company admins can review them.
        </p>
      </div>

      {/* Required categories */}
      <div className="space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-1">
          Required
        </p>
        {required.length === 0 ? (
          <div className="rounded-2xl border border-border/40 bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Your company hasn't required any documents yet.
            </p>
          </div>
        ) : (
          required.map((cat) => {
            const items = docsByCategory.get(cat) ?? [];
            const meta = DOCUMENT_CATEGORIES[cat];
            const uploaded = items.length > 0;
            const isUploading = uploadingCat === cat;

            return (
              <div
                key={cat}
                className={cn(
                  "rounded-2xl border bg-card p-3.5 shadow-xs transition-all",
                  uploaded ? "border-earning/20" : "border-warning/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                      uploaded ? "bg-earning/12" : "bg-warning/12",
                    )}
                  >
                    {uploaded ? (
                      <CheckCircle2 className="h-4 w-4 text-earning" />
                    ) : (
                      <FileText className="h-4 w-4 text-warning" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground leading-tight">
                        {meta.label}
                      </p>
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full",
                          uploaded
                            ? "bg-earning/10 text-earning"
                            : "bg-warning/10 text-warning",
                        )}
                      >
                        {uploaded ? "Uploaded" : "Missing"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-snug">
                      {meta.hint}
                    </p>
                  </div>
                </div>

                {/* Uploaded file list */}
                {uploaded && (
                  <div className="mt-3 space-y-1.5 pl-1">
                    {items.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-2 rounded-xl bg-muted/30 px-2.5 py-2"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11.5px] text-foreground truncate flex-1">
                          {d.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleView(d)}
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background"
                          aria-label="View"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload action */}
                <div className="mt-3">
                  <input
                    ref={(el) => { inputsRef.current[cat] = el; }}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(cat, f);
                      if (e.target) e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant={uploaded ? "outline" : "default"}
                    size="sm"
                    className="w-full h-9 text-xs gap-1.5"
                    disabled={isUploading}
                    onClick={() => inputsRef.current[cat]?.click()}
                  >
                    {isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {uploaded ? "Replace / add another" : "Upload document"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Other / optional documents */}
      <div className="space-y-2.5 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-1">
          Other documents
        </p>
        <div className="rounded-2xl border border-border/40 bg-card p-3.5 shadow-xs">
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Anything else your company asked for? Upload it here.
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
                    aria-label="View"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    aria-label="Delete"
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
              Upload another document
            </Button>
          </div>
        </div>

        {!canDrive && (
          <p className="text-[10px] text-muted-foreground/60 px-1 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            If you'll be driving for the company, ask your supervisor to enable that
            in your profile so your driver's license becomes a required document.
          </p>
        )}
      </div>
    </div>
  );
}
