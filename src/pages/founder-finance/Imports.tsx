import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileText, CheckCircle2, XCircle, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseCsv, inferTransactions } from "@/lib/finance/csv-parser";
import { FOUNDER_FINANCE_BUCKET } from "@/lib/finance/founder-access";
import { toast } from "sonner";

type Batch = {
  id: string;
  source_type: string;
  source_label: string | null;
  status: string;
  detected_count: number | null;
  approved_count: number | null;
  created_at: string;
};

export default function FounderFinanceImports() {
  const { user } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadBatches = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("finance_import_batches" as any)
      .select("id, source_type, source_label, status, detected_count, approved_count, created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setBatches((data as any) ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleFile = async (file: File) => {
    if (!user?.id) return;
    setUploading(true);
    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const sourceType = isCsv ? "csv" : file.type === "application/pdf" ? "pdf" : "other";

      // 1) Upload to private bucket
      const path = `${user.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage
        .from(FOUNDER_FINANCE_BUCKET)
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      // 2) Create batch row
      const { data: batch, error: bErr } = await (supabase.from("finance_import_batches" as any).insert({
        owner_user_id: user.id,
        source_type: sourceType,
        source_label: file.name,
        storage_path: path,
        status: isCsv ? "parsing" : "pending_parser",
      }).select("id").single() as any);
      if (bErr) throw bErr;

      // 3) If CSV, parse and stage extracted items
      if (isCsv) {
        const text = await file.text();
        const rows = parseCsv(text);
        const items = inferTransactions(rows);
        if (items.length > 0) {
          await supabase.from("finance_import_extracted_items" as any).insert(
            items.map((it) => ({
              batch_id: batch.id,
              owner_user_id: user.id,
              raw: it.raw,
              occurred_at: it.occurred_at,
              merchant: it.merchant,
              description: it.description,
              amount: it.amount,
              direction: it.direction,
              suggested_category: it.suggested_category,
              status: "pending_review",
            }))
          );
        }
        await supabase.from("finance_import_batches" as any)
          .update({ status: "ready_for_review", detected_count: items.length })
          .eq("id", batch.id);
        toast.success(`Parsed ${items.length} transactions from ${file.name}`);
      } else {
        toast.message("File uploaded", { description: "PDF/image parsing coming soon — file is stored." });
      }

      await loadBatches();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { v: any; label: string }> = {
      parsing: { v: "secondary", label: "Parsing" },
      pending_parser: { v: "outline", label: "Pending parser" },
      ready_for_review: { v: "default", label: "Ready for review" },
      approved: { v: "default", label: "Approved" },
      rejected: { v: "destructive", label: "Rejected" },
    };
    const x = map[s] ?? { v: "outline", label: s };
    return <Badge variant={x.v}>{x.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Upload className="h-4 w-4" /> Smart Import</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Upload a CSV statement (bank or credit card). PDF / image parsing coming soon.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="finance-file" className="cursor-pointer">
              <input
                id="finance-file"
                type="file"
                className="hidden"
                accept=".csv,.pdf,image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = "";
                }}
              />
              <Button asChild disabled={uploading}>
                <span>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload file
                </span>
              </Button>
            </Label>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="text-sm font-medium">Import history</h3>
          <Button variant="ghost" size="sm" onClick={loadBatches} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
          </Button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No imports yet. Upload your first statement above.
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {batches.map((b) => (
              <li key={b.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {b.source_type === "csv" ? <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" /> : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{b.source_label ?? "(untitled)"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleString()} · {b.detected_count ?? 0} detected
                      {b.approved_count ? ` · ${b.approved_count} approved` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(b.status)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
