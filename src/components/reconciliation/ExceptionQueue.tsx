import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Eye, XCircle } from "lucide-react";

interface Props {
  companyId: string | null;
  periodStatusId?: string | null;
  onRefresh: () => void;
}

interface Exception {
  id: string;
  exception_type: string;
  severity: string;
  source_type: string | null;
  description: string | null;
  source_data: any;
  status: string;
  resolution_action: string | null;
  resolution_note: string | null;
  employee_id: string | null;
  created_at: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

export default function ExceptionQueue({ companyId, onRefresh }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [resolving, setResolving] = useState<Exception | null>(null);
  const [resNote, setResNote] = useState("");
  const [resAction, setResAction] = useState("resolved");

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    let q = supabase
      .from("reconciliation_exceptions" as any)
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    q.then(({ data }) => {
      setExceptions((data || []) as any);
      setLoading(false);
    });
  }, [companyId, filter]);

  const resolve = async () => {
    if (!resolving || !user?.id) return;
    const { error } = await supabase
      .from("reconciliation_exceptions" as any)
      .update({
        status: resAction,
        resolution_action: resAction,
        resolution_note: resNote,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      } as any)
      .eq("id", resolving.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setExceptions(prev => prev.filter(e => e.id !== resolving.id));
      toast({ title: "Excepción resuelta" });
      onRefresh();
    }
    setResolving(null);
    setResNote("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="open">Abiertas</SelectItem>
            <SelectItem value="reviewing">En revisión</SelectItem>
            <SelectItem value="resolved">Resueltas</SelectItem>
            <SelectItem value="ignored">Ignoradas</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary">{exceptions.length} excepciones</Badge>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : exceptions.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Sin excepciones" description="No hay excepciones pendientes de resolución." />
      ) : (
        <Card>
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map(exc => (
                  <TableRow key={exc.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{exc.exception_type.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={SEVERITY_COLOR[exc.severity] as any} className="text-xs">{exc.severity}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{exc.source_type || "—"}</TableCell>
                    <TableCell className="text-xs max-w-64 truncate">{exc.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={exc.status === "open" ? "destructive" : "secondary"} className="text-xs">{exc.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {exc.status === "open" || exc.status === "reviewing" ? (
                        <Button variant="ghost" size="sm" onClick={() => { setResolving(exc); setResNote(""); setResAction("resolved"); }}>
                          <Eye className="h-4 w-4 mr-1" /> Resolver
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{exc.resolution_note || "—"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Resolve dialog */}
      <Dialog open={!!resolving} onOpenChange={() => setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Excepción</DialogTitle>
          </DialogHeader>
          {resolving && (
            <div className="space-y-4">
              <div className="text-sm">
                <strong>Tipo:</strong> {resolving.exception_type.replace(/_/g, " ")}
              </div>
              <div className="text-sm">
                <strong>Descripción:</strong> {resolving.description}
              </div>
              {resolving.source_data && (
                <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-32">
                  {JSON.stringify(resolving.source_data, null, 2)}
                </pre>
              )}
              <Select value={resAction} onValueChange={setResAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">Resolver</SelectItem>
                  <SelectItem value="ignored">Ignorar</SelectItem>
                  <SelectItem value="escalated">Escalar</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Nota de resolución..."
                value={resNote}
                onChange={e => setResNote(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancelar</Button>
            <Button onClick={resolve}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
