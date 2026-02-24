import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
  connecteam_employee_id: string | null;
  verification_ssn_ein: string | null;
  is_active: boolean;
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone_number: "", email: "", connecteam_employee_id: "", verification_ssn_ein: "" });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*").order("first_name");
    setEmployees((data as Employee[]) ?? []);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("employees").insert({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone_number: form.phone_number.trim() || null,
      email: form.email.trim() || null,
      connecteam_employee_id: form.connecteam_employee_id.trim() || null,
      verification_ssn_ein: form.verification_ssn_ein.trim() || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empleado creado" });
      setOpen(false);
      setForm({ first_name: "", last_name: "", phone_number: "", email: "", connecteam_employee_id: "", verification_ssn_ein: "" });
      fetchEmployees();
    }
    setLoading(false);
  };

  const filtered = employees.filter((e) =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Empleados</h1>
          <p className="page-subtitle">Gestiona los empleados de nómina</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nuevo empleado</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo empleado</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nombre</Label><Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required /></div>
                <div><Label>Apellido</Label><Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required /></div>
              </div>
              <div><Label>Teléfono</Label><Input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Connecteam ID</Label><Input value={form.connecteam_employee_id} onChange={e => setForm(f => ({ ...f, connecteam_employee_id: e.target.value }))} /></div>
              <div><Label>SSN/EIN</Label><Input value={form.verification_ssn_ein} onChange={e => setForm(f => ({ ...f, verification_ssn_ein: e.target.value }))} /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Crear"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="data-table-wrapper">
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Connecteam ID</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay empleados</TableCell></TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.first_name} {e.last_name}</TableCell>
                  <TableCell>{e.phone_number ?? "—"}</TableCell>
                  <TableCell>{e.email ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{e.connecteam_employee_id ?? "—"}</TableCell>
                  <TableCell>
                    <span className={e.is_active ? "earning-badge" : "deduction-badge"}>
                      {e.is_active ? "Activo" : "Inactivo"}
                    </span>
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
