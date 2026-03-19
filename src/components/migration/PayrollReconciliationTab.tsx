import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign } from "lucide-react";

interface Props { companyId: string | null; onRefresh: () => void; }

export default function PayrollReconciliationTab({ companyId, onRefresh }: Props) {
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    supabase
      .from("migration_period_reconciliation")
      .select("*")
      .eq("company_id", companyId)
      .order("week_start", { ascending: false })
      .then(({ data }) => { setPeriods(data || []); setLoading(false); });
  }, [companyId]);

  const fmt = (v: number | null) => v != null ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

  return (
    <div className="space-y-4">
      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : periods.length === 0 ? (
        <EmptyState icon={DollarSign} title="No payroll reconciliation" description="Import payroll data and run reconciliation to see variances." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Week</TableHead>
                <TableHead>CT Gross</TableHead>
                <TableHead>Stafly Gross</TableHead>
                <TableHead>Variance</TableHead>
                <TableHead>Weekend Jobs</TableHead>
                <TableHead>Pay Ride</TableHead>
                <TableHead>Unresolved</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map(p => {
                const ct = p.connecteam_totals || {};
                const sf = p.stafly_totals || {};
                const vd = p.variance_details || {};
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-muted-foreground">{p.period_code || "—"}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{p.week_start} → {p.week_end}</TableCell>
                    <TableCell>{fmt(ct.gross)}</TableCell>
                    <TableCell>{fmt(sf.gross)}</TableCell>
                    <TableCell className={Math.abs(p.total_variance || 0) > 10 ? "text-destructive font-medium" : ""}>
                      {fmt(p.total_variance)}
                    </TableCell>
                    <TableCell>{vd.weekend_jobs_variance != null ? fmt(vd.weekend_jobs_variance) : "—"}</TableCell>
                    <TableCell>{vd.pay_ride_variance != null ? fmt(vd.pay_ride_variance) : "—"}</TableCell>
                    <TableCell>{p.unresolved_count || 0}</TableCell>
                    <TableCell>
                      <Badge variant={
                        p.status === "locked" ? "default" :
                        p.status === "reconciled" ? "secondary" :
                        p.status === "under_review" ? "outline" : "outline"
                      }>
                        {p.status?.replace(/_/g, " ")}
                      </Badge>
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
