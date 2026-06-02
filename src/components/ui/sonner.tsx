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
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
