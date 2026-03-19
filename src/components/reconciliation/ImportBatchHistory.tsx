import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";
import { format } from "date-fns";

interface Props {
  companyId: string | null;
}

interface Batch {
  id: string;
  batch_type: string;
  status: string;
  schedule_file_name: string | null;
  timeclock_file_name: string | null;
  payroll_file_name: string | null;
  created_at: string;
  source: string | null;
}

export default function ImportBatchHistory({ companyId }: Props) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    supabase
      .from("import_batches" as any)
      .select("id, batch_type, status, schedule_file_name, timeclock_file_name, payroll_file_name, created_at, source")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setBatches((data || []) as any);
        setLoading(false);
      });
  }, [companyId]);

  const fileName = (b: Batch) => b.schedule_file_name || b.timeclock_file_name || b.payroll_file_name || "—";
  const sourceLabel = (b: Batch) => {
    if (b.batch_type?.startsWith("recon_")) return b.batch_type.replace("recon_", "").toUpperCase();
    return b.source || b.batch_type || "—";
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : batches.length === 0 ? (
        <EmptyState icon={FileText} title="Sin importaciones" description="Aún no se han realizado importaciones." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Archivo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(b.created_at), "dd/MM/yy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{sourceLabel(b)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-48 truncate">{fileName(b)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={b.status === "completed" ? "default" : b.status === "processing" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {b.status}
                    </Badge>
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
