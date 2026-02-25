import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Lock, Unlock, CalendarPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { format, addDays, nextWednesday, isWednesday } from "date-fns";
import { useCompany } from "@/hooks/useCompany";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";

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
  const [yearOpen, setYearOpen] = useState(false);
  const [yearValue, setYearValue] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingYear, setGeneratingYear] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<PayPeriod | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
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
    const end = addDays(start, 6);
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

  const handleGenerateYear = async () => {
    if (!selectedCompanyId) return;
    setGeneratingYear(true);

    // Find first Wednesday of the year
    let d = new Date(yearValue, 0, 1); // Jan 1
    while (d.getDay() !== 3) { // 3 = Wednesday
      d = addDays(d, 1);
    }

    const rows: { start_date: string; end_date: string; company_id: string }[] = [];
    while (d.getFullYear() === yearValue) {
      const end = addDays(d, 6);
      rows.push({
        start_date: format(d, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
        company_id: selectedCompanyId,
      });
      d = addDays(d, 7);
    }

    // Insert in batches to avoid issues
    let created = 0;
    let skipped = 0;
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      const { error, data } = await supabase.from("pay_periods").insert(batch).select();
      if (error) {
        // Likely duplicate — try one by one
        for (const row of batch) {
          const { error: singleErr } = await supabase.from("pay_periods").insert(row);
          if (singleErr) skipped++;
          else created++;
        }
      } else {
        created += (data?.length ?? batch.length);
      }
    }

    toast({
      title: `${created} periodos creados`,
      description: skipped > 0 ? `${skipped} ya existían y fueron omitidos` : `Año ${yearValue} completo`,
    });
    setYearOpen(false);
    fetchPeriods();
    setGeneratingYear(false);
  };

  const requestToggle = (period: PayPeriod) => {
    setPendingToggle(period);
    setPasswordOpen(true);
  };

  const toggleStatus = async () => {
    if (!pendingToggle) return;
    const newStatus = pendingToggle.status === "open" ? "closed" : "open";
    const { error } = await supabase
      .from("pay_periods")
      .update({ status: newStatus, closed_at: newStatus === "closed" ? new Date().toISOString() : null })
      .eq("id", pendingToggle.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: newStatus === "closed" ? "Periodo cerrado" : "Periodo reabierto" });
      fetchPeriods();
    }
    setPendingToggle(null);
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Periodos de pago</h1>
          <p className="page-subtitle">Miércoles a Martes — ciclo semanal</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={yearOpen} onOpenChange={setYearOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><CalendarPlus className="h-4 w-4 mr-2" />Generar año</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generar periodos de un año</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Se crearán ~52 periodos semanales (miércoles a martes) para el año seleccionado. Los periodos que ya existan serán omitidos.
                </p>
                <div>
                  <Label>Año</Label>
                  <Input type="number" value={yearValue} onChange={e => setYearValue(Number(e.target.value))} min={2020} max={2030} className="mt-1" />
                </div>
                <Button className="w-full" onClick={handleGenerateYear} disabled={generatingYear}>
                  {generatingYear ? "Generando..." : `Crear periodos ${yearValue}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

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
                    <Button variant="ghost" size="icon" onClick={() => requestToggle(p)} title={p.status === "open" ? "Cerrar periodo" : "Reabrir periodo"}>
                      {p.status === "open" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PasswordConfirmDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        title={pendingToggle?.status === "open" ? "Cerrar periodo" : "Reabrir periodo"}
        description={pendingToggle?.status === "open"
          ? "Cerrar un periodo bloquea la creación y eliminación de novedades e importaciones. Confirma tu contraseña para continuar."
          : "Reabrir un periodo permite modificar datos nuevamente. Confirma tu contraseña para continuar."}
        onConfirm={toggleStatus}
      />
    </div>
  );
}