import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useDir } from "@/i18n";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const dir = useDir();
  // Mirror toast position so it stays on the leading edge in RTL.
  const position: ToasterProps["position"] = dir === "rtl" ? "bottom-left" : "bottom-right";

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      dir={dir}
      position={position}
      // OX-1 — nunca apilar más de 3 mensajes a la vez (anti-spam).
      visibleToasts={3}
      gap={10}
      toastOptions={{
        classNames: {
          // Ancho contenido en móvil (sin overflow) y legible (>=13px).
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:max-w-[calc(100vw-2rem)] group-[.toaster]:text-[13px]",
          title: "group-[.toast]:text-[13.5px] group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[12.5px] group-[.toast]:leading-snug",
          // Área táctil mínima 44px en móvil para el CTA.
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:min-h-11 group-[.toast]:px-4 group-[.toast]:rounded-lg group-[.toast]:font-medium",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:min-h-11 group-[.toast]:px-4",
          closeButton: "group-[.toast]:min-h-11 group-[.toast]:min-w-11",
          // Severidad expresada con borde tokenizado — nunca solo por color:
          // el copy siempre lleva prefijo textual ("Error ·", "Crítico ·").
          success: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-success",
          error: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-destructive",
          warning: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-warning",
          info: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
