import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, CheckCircle } from "lucide-react";

const SEVERITY_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "outline",
  low: "secondary",
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "outline",
  in_progress: "secondary",
  resolved: "default",
  ignored: "secondary",
};

interface Props { companyId: string | null; onRefresh: () => void; }

export default function ExceptionsTab({ companyId, onRefresh }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("open");

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    let query = supabase
      .from("migration_exceptions")
      .select("*")
      .eq("company_id", companyId)
      .order("severity")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filterStatus && filterStatus !== "all") {
      query = query.eq("status", filterStatus);
    }

    query.then(({ data }) => { setRecords(data || []); setLoading(false); });
  }, [companyId, filterStatus]);

  async function resolveException(id: string, action: string) {
    const { error } = await supabase.from("migration_exceptions").update({
      status: "resolved",
      resolution_action: action,
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Exception resolved" });
      setRecords(prev => prev.filter(r => r.id !== id));
      onRefresh();
    }
  }

  async function ignoreException(id: string) {
    await supabase.from("migration_exceptions").update({
      status: "ignored",
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setRecords(prev => prev.filter(r => r.id !== id));
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="secondary">{records.length} exceptions</Badge>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : records.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No exceptions" description={filterStatus === "open" ? "All exceptions have been resolved! 🎉" : "No exceptions match the current filter."} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.exception_type?.replace(/_/g, " ")}</TableCell>
                  <TableCell><Badge variant={SEVERITY_COLORS[r.severity] || "outline"}>{r.severity}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.source_record_type || "—"}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.source_record_ref?.slice(0, 16) || "—"}</TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[r.status] || "outline"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {r.status === "open" && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => resolveException(r.id, "expected_variance")}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Resolve
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => ignoreException(r.id)}>
                          Ignore
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
