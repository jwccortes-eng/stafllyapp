import { cn } from "@/lib/utils";
import { MOBILE_PAGE_PX } from "./mobile-admin-tokens";

export interface MobileAdminTab<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

interface MobileAdminTabsProps<K extends string> {
  tabs: MobileAdminTab<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}

/**
 * MobileAdminTabs — horizontal scrollable pills consistent with Mobile Shifts.
 */
export function MobileAdminTabs<K extends string>({
  tabs,
  value,
  onChange,
  className,
}: MobileAdminTabsProps<K>) {
  return (
    <div className={cn("overflow-x-auto no-scrollbar", className)}>
      <div className={cn(MOBILE_PAGE_PX, "flex items-center gap-2 pb-3")}>
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={cn(
                "h-9 px-3.5 rounded-full inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-all",
                "border",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-foreground/80 border-border/60 hover:border-border"
              )}
            >
              <span>{t.label}</span>
              {typeof t.count === "number" && t.count > 0 && (
                <span
                  className={cn(
                    "min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {t.count > 99 ? "99+" : t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
