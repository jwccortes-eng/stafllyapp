import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendiente", variant: "outline" },
  processing: { label: "Procesando", variant: "secondary" },
  completed: { label: "Completado", variant: "default" },
  error: { label: "Error", variant: "destructive" },
};

export default function PayrollImportReviewTab() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();

  const { data: batches, isLoading } = useQuery({
    queryKey: ["payroll-import-batches", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_import_batches")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("imported_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-8 text-center">
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">Importar archivo de nómina</p>
          <p className="text-xs text-muted-foreground mb-4">
            Sube un archivo Excel (.xlsx) con la hoja "payroll" para interpretar pagos automáticamente.
          </p>
          <Button size="sm" variant="outline" disabled>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Subir archivo (próximamente)
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Historial de importaciones</CardTitle>
          <CardDescription className="text-xs">Archivos de nómina importados y su estado de procesamiento</CardDescription>
        </CardHeader>
        <CardContent>
          {!batches || batches.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="Sin importaciones"
              description="Aún no se han importado archivos de nómina."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Procesados</TableHead>
                  <TableHead className="text-center">Warnings</TableHead>
                  <TableHead className="text-center">Errores</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b: any) => {
                  const sc = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium text-sm">{b.file_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(b.imported_at), "dd MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-center text-sm">{b.total_rows}</TableCell>
                      <TableCell className="text-center text-sm">{b.processed_rows}</TableCell>
                      <TableCell className="text-center">
                        {b.warnings_count > 0 ? (
                          <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">{b.warnings_count}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {b.errors_count > 0 ? (
                          <Badge variant="destructive" className="text-[10px]">{b.errors_count}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell><Badge variant={sc.variant} className="text-[10px]">{sc.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
