import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Activity, CheckCircle2, AlertTriangle, Clock, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncRecord {
  id: string;
  sync_type: string;
  file_name: string;
  status: string;
  rows_processed: number;
  rows_matched: number;
  rows_errors: number;
  created_at: string;
}

interface Props {
  companyId: string | null;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  completed: { label: "Complete", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "In Progress", variant: "secondary", icon: Clock },
  error: { label: "Error", variant: "destructive", icon: AlertTriangle },
  pending: { label: "Pending", variant: "outline", icon: Clock },
};

export default function SyncStatusPanel({ companyId }: Props) {
  const [history, setHistory] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dualSyncActive, setDualSyncActive] = useState(false);

  const fetchHistory = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("migration_pilot_status")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    setDualSyncActive(data?.sync_active || false);

    // Fetch recent imports as sync history
    const { data: imports } = await supabase
      .from("imports")
      .select("id, file_name, status, created_at, total_rows, matched_rows, error_rows, import_type")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20);

    setHistory((imports || []).map(i => ({
      id: i.id,
      sync_type: i.import_type || "unknown",
      file_name: i.file_name || "",
      status: i.status || "pending",
      rows_processed: i.total_rows || 0,
      rows_matched: i.matched_rows || 0,
      rows_errors: i.error_rows || 0,
      created_at: i.created_at,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchHistory(); }, [companyId]);

  const totalProcessed = history.reduce((a, h) => a + h.rows_processed, 0);
  const totalMatched = history.reduce((a, h) => a + h.rows_matched, 0);
  const matchRate = totalProcessed > 0 ? Math.round((totalMatched / totalProcessed) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Dual Sync Status */}
      <Card className={cn("border-l-4", dualSyncActive ? "border-l-primary" : "border-l-muted-foreground/30")}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {dualSyncActive ? (
                <div className="p-2 rounded-lg bg-primary/10">
                  <Wifi className="h-5 w-5 text-primary animate-pulse" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-muted">
                  <WifiOff className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <div className="font-medium text-sm">Dual-Sync Mode</div>
                <div className="text-xs text-muted-foreground">
                  {dualSyncActive
                    ? "Active — Connecteam and StaflyApps running in parallel"
                    : "Inactive — Enable to run both systems simultaneously"}
                </div>
              </div>
            </div>
            <Badge variant={dualSyncActive ? "default" : "outline"}>
              {dualSyncActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Overall Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <div className="text-2xl font-bold text-foreground">{history.length}</div>
          <div className="text-xs text-muted-foreground">Total Syncs</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-bold text-foreground">{totalProcessed.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Records Processed</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-bold text-primary">{matchRate}%</div>
          <div className="text-xs text-muted-foreground">Match Rate</div>
          <Progress value={matchRate} className="h-1 mt-1.5" />
        </Card>
      </div>

      {/* Recent Sync History */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Sync History
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No sync history yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.map(h => {
                const sm = STATUS_MAP[h.status] || STATUS_MAP.pending;
                const Icon = sm.icon;
                return (
                  <div key={h.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-sm">
                    <Icon className={cn("h-4 w-4 shrink-0", h.status === "completed" ? "text-primary" : h.status === "error" ? "text-destructive" : "text-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{h.file_name || h.sync_type}</div>
                      <div className="text-xs text-muted-foreground">
                        {h.rows_processed} rows · {new Date(h.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant={sm.variant} className="text-xs shrink-0">{sm.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
