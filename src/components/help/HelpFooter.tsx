import { Link } from "react-router-dom";
import { HelpCircle, ExternalLink, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  lang: "es" | "en";
}

const links = [
  { label: "Landing", to: "/" },
  { label: "Portal Empleados", to: "/portal" },
  { label: "Admin", to: "/auth" },
];

export function HelpFooter({ lang }: Props) {
  const t = lang === "es"
    ? { linksTitle: "Links útiles", contactTitle: "¿No encontraste lo que buscas?", contactDesc: "Si tu empresa tiene soporte habilitado, contacta a tu Manager/Admin.", email: "soporte@staflyapps.com", manual: "Manual de Usuario" }
    : { linksTitle: "Useful links", contactTitle: "Didn't find what you need?", contactDesc: "If support is enabled, contact your Manager/Admin.", email: "support@staflyapps.com", manual: "User Manual" };

  return (
    <div className="space-y-6">
      {/* Useful links */}
      <div className="rounded-2xl border bg-card/50 p-5 space-y-3">
        <p className="text-sm font-semibold text-foreground">{t.linksTitle}</p>
        <div className="flex flex-wrap gap-2">
          {links.map(l => (
            <Link
              key={l.to}
              to={l.to}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              <ExternalLink className="h-3 w-3" /> {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Contact / Support */}
      <div className="rounded-2xl border bg-muted/20 p-6 text-center space-y-3">
        <HelpCircle className="h-7 w-7 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground font-medium">{t.contactTitle}</p>
        <p className="text-xs text-muted-foreground/70">{t.contactDesc}</p>
        <p className="text-xs text-muted-foreground/70">
          {lang === "es" ? "Escríbenos a" : "Email us at"}{" "}
          <span className="text-primary font-medium">{t.email}</span>
        </p>
        <Button variant="outline" size="sm" asChild className="mt-2">
          <Link to="/manual">
            <BookOpen className="h-4 w-4 mr-1.5" />
            {t.manual}
          </Link>
        </Button>
      </div>
    </div>
  );
}
