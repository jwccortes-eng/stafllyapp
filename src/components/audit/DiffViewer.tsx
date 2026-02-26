import { Badge } from "@/components/ui/badge";

interface DiffViewerProps {
  oldData: Record<string, any> | null;
  newData: Record<string, any> | null;
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "Nombre",
  last_name: "Apellido",
  email: "Email",
  phone_number: "Teléfono",
  is_active: "Activo",
  status: "Estado",
  name: "Nombre",
  title: "Título",
  body: "Contenido",
  start_date: "Fecha inicio",
  end_date: "Fecha fin",
  total_value: "Valor total",
  quantity: "Cantidad",
  rate: "Tarifa",
  base_total_pay: "Pago base total",
  total_work_hours: "Horas trabajadas",
  total_overtime: "Horas extra",
  enabled: "Habilitado",
  pinned: "Fijado",
  priority: "Prioridad",
  clock_in_time: "Entrada",
  clock_out_time: "Salida",
  notes: "Notas",
  published_at: "Publicado",
  closed_at: "Cerrado",
};

function formatValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Sí" : "No";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default function DiffViewer({ oldData, newData }: DiffViewerProps) {
  if (!oldData && !newData) return null;

  // For create actions (no oldData), show new values
  if (!oldData && newData) {
    const keys = Object.keys(newData).filter(k => !["id", "created_at", "updated_at", "company_id", "user_id"].includes(k));
    if (keys.length === 0) return null;
    return (
      <div className="mt-1.5 space-y-0.5">
        {keys.slice(0, 6).map(key => (
          <div key={key} className="flex items-center gap-1.5 text-[10px]">
            <span className="text-muted-foreground">{FIELD_LABELS[key] || key}:</span>
            <Badge variant="outline" className="text-[9px] bg-earning/10 text-earning border-earning/20 px-1 py-0">
              {formatValue(newData[key])}
            </Badge>
          </div>
        ))}
      </div>
    );
  }

  // For delete actions (no newData), show old values
  if (oldData && !newData) {
    const keys = Object.keys(oldData).filter(k => !["id", "created_at", "updated_at", "company_id", "user_id"].includes(k));
    if (keys.length === 0) return null;
    return (
      <div className="mt-1.5 space-y-0.5">
        {keys.slice(0, 6).map(key => (
          <div key={key} className="flex items-center gap-1.5 text-[10px]">
            <span className="text-muted-foreground">{FIELD_LABELS[key] || key}:</span>
            <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/20 px-1 py-0 line-through">
              {formatValue(oldData[key])}
            </Badge>
          </div>
        ))}
      </div>
    );
  }

  // For update actions, show diff
  if (oldData && newData) {
    const changedKeys = Object.keys(newData).filter(k => {
      if (["id", "created_at", "updated_at", "company_id", "user_id"].includes(k)) return false;
      return JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]);
    });
    if (changedKeys.length === 0) return null;
    return (
      <div className="mt-1.5 space-y-0.5">
        {changedKeys.slice(0, 6).map(key => (
          <div key={key} className="flex items-center gap-1.5 text-[10px] flex-wrap">
            <span className="text-muted-foreground">{FIELD_LABELS[key] || key}:</span>
            <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/20 px-1 py-0 line-through">
              {formatValue(oldData[key])}
            </Badge>
            <span className="text-muted-foreground">→</span>
            <Badge variant="outline" className="text-[9px] bg-earning/10 text-earning border-earning/20 px-1 py-0">
              {formatValue(newData[key])}
            </Badge>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
