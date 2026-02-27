import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, QrCode, MessageCircle, Send, Search, CheckCircle2, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  is_active: boolean;
  access_pin: string | null;
}

export default function InviteEmployees() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showQR, setShowQR] = useState<string | null>(null);
  const [generatingPin, setGeneratingPin] = useState<string | null>(null);

  const companyName = selectedCompany?.name ?? "stafly";
  const baseUrl = window.location.hostname.includes("lovableproject.com") || window.location.hostname.includes("localhost")
    ? "https://staflyapp.lovable.app"
    : window.location.origin;
  const portalUrl = `${baseUrl}/auth`;

  useEffect(() => {
    if (!selectedCompanyId) return;
    fetchEmployees();
  }, [selectedCompanyId]);

  const fetchEmployees = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, is_active, access_pin")
      .eq("company_id", selectedCompanyId!)
      .eq("is_active", true)
      .order("first_name");
    setEmployees(data ?? []);
    setLoading(false);
  };

  const generatePin = async (empId: string) => {
    setGeneratingPin(empId);
    const { data, error } = await supabase.functions.invoke("employee-auth", {
      body: { action: "provision", employee_id: empId },
    });
    if (error) {
      toast({ title: "Error", description: "No se pudo generar PIN", variant: "destructive" });
    } else {
      toast({ title: "PIN generado", description: `Nuevo PIN: ${data.pin}` });
      fetchEmployees();
    }
    setGeneratingPin(null);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(portalUrl);
    toast({ title: "Link copiado", description: "El enlace se copió al portapapeles" });
  };

  const buildInviteMessage = (emp: Employee) => {
    const name = `${emp.first_name} ${emp.last_name}`;
    const pin = emp.access_pin ?? "[pendiente]";
    return `¡Hola ${name}! 👋\n\nTe damos la bienvenida a *${companyName}* en stafly, tu portal de pagos y gestión laboral.\n\n📱 Accede aquí: ${portalUrl}\n📞 Tu teléfono: ${emp.phone_number ?? "N/A"}\n🔑 Tu PIN: ${pin}\n\n💡 Tip: Guarda este enlace en tu pantalla de inicio para un acceso más rápido.\n\n— Equipo ${companyName}`;
  };

  const shareWhatsApp = (emp: Employee) => {
    if (!emp.phone_number) {
      toast({ title: "Sin teléfono", description: "Este empleado no tiene número registrado", variant: "destructive" });
      return;
    }
    const phone = emp.phone_number.replace(/[\s\-\(\)]/g, "");
    const msg = encodeURIComponent(buildInviteMessage(emp));
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const shareSMS = (emp: Employee) => {
    if (!emp.phone_number) {
      toast({ title: "Sin teléfono", description: "Este empleado no tiene número registrado", variant: "destructive" });
      return;
    }
    const msg = encodeURIComponent(buildInviteMessage(emp));
    window.open(`sms:${emp.phone_number}?body=${msg}`, "_blank");
  };

  const copyInvite = (emp: Employee) => {
    navigator.clipboard.writeText(buildInviteMessage(emp));
    toast({ title: "Invitación copiada" });
  };

  const filtered = useMemo(() => {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
        (e.phone_number ?? "").includes(q)
    );
  }, [employees, search]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Invitar Empleados — {companyName}</h1>
        <p className="page-subtitle">Comparte el acceso al portal de {companyName} con tus empleados</p>
      </div>

      {/* General link + QR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              Link del portal — {companyName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input value={portalUrl} readOnly className="text-xs" />
              <Button size="sm" variant="outline" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Los empleados de <strong>{companyName}</strong> ingresan con su número de teléfono y PIN
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              Código QR del portal
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="bg-white p-2 rounded-lg border">
              <QRCodeSVG value={portalUrl} size={80} />
            </div>
            <p className="text-xs text-muted-foreground">
              Imprime o muestra este código para que los empleados escaneen y accedan al portal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Employee list for individual invites */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-sm font-medium">Enviar invitaciones individuales</CardTitle>
            <div className="relative w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar empleado..."
                className="pl-8 h-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Empleado</TableHead>
                  <TableHead className="text-xs">Teléfono</TableHead>
                  <TableHead className="text-xs">PIN</TableHead>
                  <TableHead className="text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                      No se encontraron empleados
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="text-sm font-medium">
                        {emp.first_name} {emp.last_name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {emp.phone_number || <span className="text-destructive text-xs">Sin teléfono</span>}
                      </TableCell>
                      <TableCell>
                        {emp.access_pin ? (
                          <Badge variant="outline" className="text-xs font-mono">{emp.access_pin}</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-6 px-2"
                            onClick={() => generatePin(emp.id)}
                            disabled={generatingPin === emp.id}
                          >
                            {generatingPin === emp.id ? "Generando..." : "Generar PIN"}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => shareWhatsApp(emp)}
                            title="Enviar por WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => shareSMS(emp)}
                            title="Enviar por SMS"
                          >
                            <Send className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => copyInvite(emp)}
                            title="Copiar invitación"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setShowQR(showQR === emp.id ? null : emp.id)}
                            title="Mostrar QR individual"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {showQR === emp.id && (
                          <div className="mt-2 bg-white p-2 rounded-lg border inline-block">
                            <QRCodeSVG value={portalUrl} size={64} />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
