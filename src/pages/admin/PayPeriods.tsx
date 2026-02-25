import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Lock, Unlock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { format, addDays, nextWednesday, previousWednesday, isWednesday } from "date-fns";
import { useCompany } from "@/hooks/useCompany";

interface PayPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  closed_at: string | null;
}

export default function PayPeriods() {
  const { selectedCompanyId } = useCompany();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchPeriods = async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase.from("pay_periods").select("*").eq("company_id", selectedCompanyId).order("start_date", { ascending: false });
    setPeriods((data as PayPeriod[]) ?? []);
  };

  useEffect(() => { fetchPeriods(); }, [selectedCompanyId]);

  const suggestNextWednesday = () => {
    const today = new Date();
    const wed = isWednesday(today) ? today : nextWednesday(today);
    setStartDate(format(wed, "yyyy-MM-dd"));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const start = new Date(startDate + "T00:00:00");
    const end = addDays(start, 6); // Wed to Tue
    const { error } = await supabase.from("pay_periods").insert({
      start_date: format(start, "yyyy-MM-dd"),
      end_date: format(end, "yyyy-MM-dd"),
      company_id: selectedCompanyId,
    });
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Periodo creado" });
      setOpen(false);
      setStartDate("");
      fetchPeriods();
    }
    setLoading(false);
  };

  const toggleStatus = async (period: PayPeriod) => {
    const newStatus = period.status === "open" ? "closed" : "open";
    const { error } = await supabase
      .from("pay_periods")
      .update({ status: newStatus, closed_at: newStatus === "closed" ? new Date().toISOString() : null })
      .eq("id", period.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      fetchPeriods();
    }
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Periodos de pago</h1>
          <p className="page-subtitle">Miércoles a Martes — ciclo semanal</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nuevo periodo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear periodo semanal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Fecha inicio (miércoles)</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                  <Button type="button" variant="outline" size="sm" onClick={suggestNextWednesday}>Próx. miércoles</Button>
                </div>
              </div>
              {startDate && (
                <p className="text-sm text-muted-foreground">
                  Periodo: {startDate} → {format(addDays(new Date(startDate + "T00:00:00"), 6), "yyyy-MM-dd")}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creando..." : "Crear periodo"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="data-table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inicio</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cerrado</TableHead>
              <TableHead className="w-20">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay periodos</TableCell></TableRow>
            ) : (
              periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.start_date}</TableCell>
                  <TableCell>{p.end_date}</TableCell>
                  <TableCell>
                    <span className={p.status === "open" ? "earning-badge" : "deduction-badge"}>
                      {p.status === "open" ? "Abierto" : "Cerrado"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.closed_at ? format(new Date(p.closed_at), "yyyy-MM-dd HH:mm") : "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => toggleStatus(p)}>
                      {p.status === "open" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
