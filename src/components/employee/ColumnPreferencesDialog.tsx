import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Settings2, GripVertical } from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
}

export const EMPLOYEE_COLUMNS: ColumnDef[] = [
  { key: "employer_identification", label: "ID Empleado", defaultVisible: true },
  { key: "phone_number", label: "Teléfono", defaultVisible: true },
  { key: "email", label: "Email", defaultVisible: true },
  { key: "employee_role", label: "Rol", defaultVisible: true },
  { key: "groups", label: "Grupo", defaultVisible: false },
  { key: "status", label: "Estado", defaultVisible: true },
  { key: "last_login", label: "Último login", defaultVisible: true },
  { key: "start_date", label: "Fecha inicio", defaultVisible: false },
  { key: "onboarding_status", label: "Onboarding", defaultVisible: false },
  { key: "address_city", label: "Ciudad", defaultVisible: false },
  { key: "address_state", label: "Estado (dir.)", defaultVisible: false },
  { key: "can_drive", label: "Conduce", defaultVisible: false },
  { key: "has_vehicle", label: "Vehículo", defaultVisible: false },
  { key: "english_level", label: "Inglés", defaultVisible: false },
];

interface ColumnPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleColumns: string[];
  onSave: (columns: string[]) => void;
}

export function useColumnPreferences(pageKey = "employees") {
  const { user } = useAuth();
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    EMPLOYEE_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("user_column_preferences" as any)
        .select("visible_columns")
        .eq("user_id", user.id)
        .eq("page_key", pageKey)
        .maybeSingle() as any;
      if (data?.visible_columns && Array.isArray(data.visible_columns)) {
        setVisibleColumns(data.visible_columns);
      }
      setLoaded(true);
    })();
  }, [user?.id, pageKey]);

  const savePreferences = async (cols: string[]) => {
    setVisibleColumns(cols);
    if (!user?.id) return;
    await supabase
      .from("user_column_preferences" as any)
      .upsert({
        user_id: user.id,
        page_key: pageKey,
        visible_columns: cols,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id,page_key" });
  };

  return { visibleColumns, savePreferences, loaded };
}

export function ColumnPreferencesDialog({ open, onOpenChange, visibleColumns, onSave }: ColumnPreferencesDialogProps) {
  const [selected, setSelected] = useState<string[]>(visibleColumns);

  useEffect(() => {
    if (open) setSelected(visibleColumns);
  }, [open, visibleColumns]);

  const toggle = (key: string) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Columnas visibles
          </DialogTitle>
          <DialogDescription>Selecciona qué columnas mostrar en la lista de empleados</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {EMPLOYEE_COLUMNS.map(col => (
            <label
              key={col.key}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <Checkbox
                checked={selected.includes(col.key)}
                onCheckedChange={() => toggle(col.key)}
              />
              <span className="text-sm">{col.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(EMPLOYEE_COLUMNS.filter(c => c.defaultVisible).map(c => c.key))}
            className="text-xs"
          >
            Restaurar
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => { onSave(selected); onOpenChange(false); }}
            className="text-xs"
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
