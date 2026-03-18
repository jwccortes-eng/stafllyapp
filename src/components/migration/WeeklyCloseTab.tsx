import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { CalendarCheck, Lock, Eye } from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft_imported: { label: "Draft", variant: "outline" },
  partially_matched: { label: "Partial", variant: "outline" },
  under_review: { label: "Reviewing", variant: "secondary" },
  reconciled: { label: "Reconciled", variant: "default" },
  locked: { label: "Locked 🔒", variant: "default" },
};

interface Props { companyId: string | null; onRefresh: () => void; }

export default function WeeklyCloseTab({ companyId, onRefresh }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    supabase
      .from("migration_period_reconciliation")
      .select("*")
      .eq("company_id", companyId)
      .order("week_start")
      .then(({ data }) => { setPeriods(data || []); setLoading(false); });
  }, [companyId]);

  async function markStatus(id: string, status: string) {
    const update: any = { status, updated_at: new Date().toISOString() };
    if (status === "locked") {
      update.locked_by = user?.id;
      update.locked_at = new Date().toISOString();
    }
    if (status === "reconciled" || status === "under_review") {
      update.reviewed_by = user?.id;
      update.reviewed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("migration_period_reconciliation").update(update).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Period marked as ${status.replace(/_/g, " ")}` });
      onRefresh();
      // Re-fetch local
      setPeriods(prev => prev.map(p => p.id === id ? { ...p, ...update } : p));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Badge variant="secondary">{periods.length} periods</Badge>
        <Badge variant="default">{periods.filter(p => p.status === "reconciled" || p.status === "locked").length} closed</Badge>
        <Badge variant="outline">{periods.filter(p => p.status === "draft_imported").length} draft</Badge>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : periods.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No weekly periods" description="Import data and create weekly periods to start the close process." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Variance</TableHead>
                <TableHead>Unresolved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map(p => {
                const s = STATUS_BADGE[p.status] || STATUS_BADGE.draft_imported;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium whitespace-nowrap">{p.week_start} → {p.week_end}</TableCell>
                    <TableCell className={Math.abs(p.total_variance || 0) > 10 ? "text-destructive font-medium" : ""}>
                      ${(p.total_variance || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>{p.unresolved_count || 0}</TableCell>
                    <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      {p.status !== "locked" && (
                        <>
                          {p.status === "draft_imported" && (
                            <Button variant="ghost" size="sm" onClick={() => markStatus(p.id, "under_review")}>
                              <Eye className="h-4 w-4 mr-1" /> Review
                            </Button>
                          )}
                          {(p.status === "under_review" || p.status === "partially_matched") && (
                            <Button variant="ghost" size="sm" onClick={() => markStatus(p.id, "reconciled")}>
                              Reconcile
                            </Button>
                          )}
                          {p.status === "reconciled" && (
                            <Button variant="ghost" size="sm" onClick={() => markStatus(p.id, "locked")}>
                              <Lock className="h-4 w-4 mr-1" /> Lock
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
