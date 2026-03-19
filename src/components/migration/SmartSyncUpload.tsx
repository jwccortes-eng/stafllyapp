import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { safeRead, safeSheetToJson, getSheetNames } from "@/lib/safe-xlsx";
import {
  Upload, FileSpreadsheet, CalendarDays, Clock, DollarSign,
  CheckCircle2, AlertCircle, Loader2, X, Zap, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type FileType = "scheduling" | "timeclock" | "payroll" | "unknown";

interface DetectedFile {
  file: File;
  type: FileType;
  confidence: number;
  rowCount: number;
  headers: string[];
  preview: Record<string, any>[];
}

const FILE_TYPE_META: Record<FileType, { label: string; icon: typeof CalendarDays; color: string; description: string }> = {
  scheduling: { label: "Scheduling", icon: CalendarDays, color: "text-primary", description: "Shift dates, roles, locations, employee assignments" },
  timeclock: { label: "Time Clock", icon: Clock, color: "text-amber-500", description: "Clock in/out timestamps, worked hours" },
  payroll: { label: "Payroll", icon: DollarSign, color: "text-emerald-500", description: "Final paid amounts, adjustments, totals" },
  unknown: { label: "Unknown", icon: AlertCircle, color: "text-destructive", description: "Could not auto-detect file type" },
};

const SCHEDULING_MARKERS = ["shift number", "scheduled shift title", "job code", "sub-job", "start date", "end date", "start - location", "end - location"];
const TIMECLOCK_MARKERS = ["clock in", "clock out", "clock in - time", "clock out - time", "shift hours", "daily total hours", "clock in - device"];
const PAYROLL_MARKERS = ["total pay", "total pay usd", "total paid hours", "total regular", "total overtime", "weekly total hours", "total work hours"];

function detectFileType(headers: string[]): { type: FileType; confidence: number } {
  const lower = headers.map(h => h.toLowerCase().trim());

  const scheduleHits = SCHEDULING_MARKERS.filter(m => lower.some(h => h.includes(m))).length;
  const clockHits = TIMECLOCK_MARKERS.filter(m => lower.some(h => h.includes(m))).length;
  const payrollHits = PAYROLL_MARKERS.filter(m => lower.some(h => h.includes(m))).length;

  const scores: [FileType, number][] = [
    ["scheduling", scheduleHits / SCHEDULING_MARKERS.length],
    ["timeclock", clockHits / TIMECLOCK_MARKERS.length],
    ["payroll", payrollHits / PAYROLL_MARKERS.length],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = scores[0];

  if (bestScore < 0.15) return { type: "unknown", confidence: 0 };
  return { type: bestType, confidence: Math.round(bestScore * 100) };
}

interface Props {
  companyId: string | null;
  onRefresh: () => void;
}

export default function SmartSyncUpload({ companyId, onRefresh }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<DetectedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncLog, setSyncLog] = useState<string[]>([]);

  const handleFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    setProcessing(true);
    const detected: DetectedFile[] = [];

    for (const file of selected) {
      try {
        const buffer = await file.arrayBuffer();
        const wb = await safeRead(buffer);
        const sheetNames = getSheetNames(wb);
        const rows = safeSheetToJson(wb.getWorksheet(sheetNames[0])!);
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        const { type, confidence } = detectFileType(headers);

        detected.push({
          file,
          type,
          confidence,
          rowCount: rows.length,
          headers,
          preview: rows.slice(0, 3),
        });
      } catch {
        detected.push({
          file,
          type: "unknown",
          confidence: 0,
          rowCount: 0,
          headers: [],
          preview: [],
        });
      }
    }

    setFiles(detected);
    setProcessing(false);
    e.target.value = "";
  }, []);

  const removeFile = (idx: number) => setFiles(f => f.filter((_, i) => i !== idx));

  const overrideType = (idx: number, type: FileType) => {
    setFiles(f => f.map((df, i) => i === idx ? { ...df, type, confidence: 100 } : df));
  };

  const startSync = async () => {
    if (!companyId || !user) return;
    setSyncing(true);
    setSyncProgress(0);
    setSyncLog([]);

    const total = files.filter(f => f.type !== "unknown").length;
    let done = 0;

    for (const df of files) {
      if (df.type === "unknown") continue;

      setSyncLog(prev => [...prev, `📂 Processing ${df.file.name} as ${df.type}...`]);

      try {
        const buffer = await df.file.arrayBuffer();
        const wb = await safeRead(buffer);
        const rows = safeSheetToJson(wb.getWorksheet(getSheetNames(wb)[0])!);

        if (df.type === "scheduling") {
          const { error } = await supabase.functions.invoke("migration-schedule-sync", {
            body: { company_id: companyId, rows, file_name: df.file.name, source: "connecteam" },
          });
          if (error) throw error;
          setSyncLog(prev => [...prev, `✅ ${rows.length} scheduling rows synced`]);
        } else if (df.type === "timeclock") {
          const { error } = await supabase.functions.invoke("migration-schedule-sync", {
            body: { company_id: companyId, rows, file_name: df.file.name, source: "connecteam", data_type: "timeclock" },
          });
          if (error) throw error;
          setSyncLog(prev => [...prev, `✅ ${rows.length} clock records synced`]);
        } else if (df.type === "payroll") {
          const { error } = await supabase.functions.invoke("migration-schedule-sync", {
            body: { company_id: companyId, rows, file_name: df.file.name, source: "connecteam", data_type: "payroll" },
          });
          if (error) throw error;
          setSyncLog(prev => [...prev, `✅ ${rows.length} payroll records synced`]);
        }
      } catch (err: any) {
        setSyncLog(prev => [...prev, `❌ Error in ${df.file.name}: ${err.message || "Unknown error"}`]);
      }

      done++;
      setSyncProgress(Math.round((done / total) * 100));
    }

    setSyncLog(prev => [...prev, "🎉 Sync complete! Refreshing stats..."]);
    onRefresh();
    setSyncing(false);
    toast({ title: "Sync complete", description: `${done} files processed successfully.` });
  };

  const hasValidFiles = files.some(f => f.type !== "unknown");
  const typeGroups = { scheduling: files.filter(f => f.type === "scheduling"), timeclock: files.filter(f => f.type === "timeclock"), payroll: files.filter(f => f.type === "payroll") };
  const hasDuplicateTypes = Object.values(typeGroups).some(g => g.length > 1);

  return (
    <div className="space-y-5">
      {/* Upload Zone */}
      <Card className="border-dashed border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Smart Sync Engine</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload up to 3 Connecteam files at once — Scheduling, Time Clock, and Payroll.
                <br />The system auto-detects each file type and processes them together.
              </p>
            </div>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xls,.xlsx,.csv"
                multiple
                className="hidden"
                onChange={handleFiles}
                disabled={processing || syncing}
              />
              <Button variant="default" size="lg" className="gap-2 cursor-pointer" asChild>
                <span>
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {processing ? "Analyzing files..." : "Select Files"}
                </span>
              </Button>
            </label>
            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              {(["scheduling", "timeclock", "payroll"] as FileType[]).map(t => {
                const meta = FILE_TYPE_META[t];
                const Icon = meta.icon;
                const hasIt = files.some(f => f.type === t);
                return (
                  <div key={t} className={cn("flex items-center gap-1.5", hasIt && "text-foreground font-medium")}>
                    {hasIt ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Icon className={cn("h-3.5 w-3.5", meta.color)} />}
                    {meta.label}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detected Files */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Detected Files ({files.length})
          </h4>

          {hasDuplicateTypes && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-400">
              ⚠️ Multiple files detected as the same type. Please correct the type assignment below.
            </div>
          )}

          <div className="grid gap-3">
            {files.map((df, idx) => {
              const meta = FILE_TYPE_META[df.type];
              const Icon = meta.icon;
              return (
                <Card key={idx} className={cn("relative overflow-hidden", df.type === "unknown" && "border-destructive/40")}>
                  <div className={cn("absolute left-0 top-0 bottom-0 w-1",
                    df.type === "scheduling" && "bg-primary",
                    df.type === "timeclock" && "bg-warning",
                    df.type === "payroll" && "bg-earning",
                    df.type === "unknown" && "bg-destructive"
                  )} />
                  <CardContent className="py-4 pl-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 p-2 rounded-lg bg-muted">
                          <Icon className={cn("h-5 w-5", meta.color)} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{df.file.name}</div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant={df.type === "unknown" ? "destructive" : "secondary"} className="text-xs">
                              {meta.label}
                            </Badge>
                            {df.confidence > 0 && (
                              <span className="text-xs text-muted-foreground">{df.confidence}% confidence</span>
                            )}
                            <span className="text-xs text-muted-foreground">{df.rowCount.toLocaleString()} rows</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                          {df.type === "unknown" && (
                            <div className="flex gap-1.5 mt-2">
                              {(["scheduling", "timeclock", "payroll"] as FileType[]).map(t => (
                                <Button key={t} variant="outline" size="xs" onClick={() => overrideType(idx, t)}>
                                  {FILE_TYPE_META[t].label}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" onClick={() => setFiles([])}>Clear All</Button>
            <Button
              size="lg"
              className="gap-2"
              disabled={!hasValidFiles || syncing || !companyId}
              onClick={startSync}
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {syncing ? "Syncing..." : `Start Sync (${files.filter(f => f.type !== "unknown").length} files)`}
            </Button>
          </div>
        </div>
      )}

      {/* Sync Progress */}
      {syncing && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Sync Progress</span>
              <span className="text-muted-foreground">{syncProgress}%</span>
            </div>
            <Progress value={syncProgress} className="h-2" />
            <div className="max-h-40 overflow-y-auto space-y-1 text-xs font-mono bg-muted/50 rounded-lg p-3">
              {syncLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Log (after completion) */}
      {!syncing && syncLog.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Last Sync Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-y-auto space-y-1 text-xs font-mono bg-muted/50 rounded-lg p-3">
              {syncLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {files.length === 0 && !syncing && syncLog.length === 0 && (
        <EmptyState
          icon={Upload}
          title="No files uploaded"
          description="Upload your Connecteam export files to begin the smart sync process. The system will auto-detect Scheduling, Time Clock, and Payroll files."
        />
      )}
    </div>
  );
}
