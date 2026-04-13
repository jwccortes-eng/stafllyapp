import { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface SettingsField {
  key: string;
  label: string;
  description?: string;
  type: "toggle" | "number" | "text" | "select" | "time";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
}

export interface SettingsSection {
  title: string;
  description?: string;
  fields: SettingsField[];
}

interface ModuleSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon?: LucideIcon;
  sections: SettingsSection[];
  config: Record<string, unknown>;
  onUpdate: (partial: Record<string, unknown>) => void;
  loading?: boolean;
  children?: ReactNode;
}

export function ModuleSettingsSheet({
  open,
  onOpenChange,
  title,
  icon: Icon,
  sections,
  config,
  onUpdate,
  loading,
}: ModuleSettingsSheetProps) {
  const getValue = (key: string) => config[key];

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ [key]: value });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            {Icon && <Icon className="h-5 w-5 text-primary" />}
            {title}
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : (
          <div className="space-y-6 pb-8">
            {sections.map((section, si) => (
              <div key={si}>
                {si > 0 && <Separator className="mb-4" />}
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  {section.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                  )}
                </div>
                <div className="space-y-3">
                  {section.fields.map(field => (
                    <FieldRenderer
                      key={field.key}
                      field={field}
                      value={getValue(field.key)}
                      onChange={(v) => handleChange(field.key, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: SettingsField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "toggle") {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="flex-1 min-w-0">
          <Label className="text-sm font-medium">{field.label}</Label>
          {field.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{field.description}</p>
          )}
        </div>
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{field.label}</Label>
        {field.description && (
          <p className="text-[11px] text-muted-foreground">{field.description}</p>
        )}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={value as number ?? ""}
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              if (!isNaN(num)) {
                const clamped = Math.min(
                  Math.max(num, field.min ?? -Infinity),
                  field.max ?? Infinity,
                );
                onChange(clamped);
              }
            }}
            min={field.min}
            max={field.max}
            className="w-24 h-8 text-sm"
          />
          {field.suffix && (
            <span className="text-xs text-muted-foreground">{field.suffix}</span>
          )}
        </div>
      </div>
    );
  }

  if (field.type === "time") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{field.label}</Label>
        {field.description && (
          <p className="text-[11px] text-muted-foreground">{field.description}</p>
        )}
        <Input
          type="time"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 h-8 text-sm"
        />
      </div>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{field.label}</Label>
        {field.description && (
          <p className="text-[11px] text-muted-foreground">{field.description}</p>
        )}
        <Select
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-8 text-sm w-48">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // text
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{field.label}</Label>
      {field.description && (
        <p className="text-[11px] text-muted-foreground">{field.description}</p>
      )}
      <Input
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}
