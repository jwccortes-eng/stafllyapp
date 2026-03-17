import { useLocation } from "react-router-dom";

const PAGE_TITLES: Record<string, string> = {
  "/portal": "Inicio",
  "/portal/shifts": "Mis Turnos",
  "/portal/clock": "Reloj",
  "/portal/payments": "Mis Pagos",
  "/portal/profile": "Perfil",
  "/portal/availability": "Disponibilidad",
  "/portal/announcements": "Anuncios",
  "/portal/chat": "Chat",
  "/portal/resources": "Recursos",
  "/portal/w9": "W-9",
};

export function PortalPageTitle() {
  const location = useLocation();

  // Exact match first, then prefix match
  const title =
    PAGE_TITLES[location.pathname] ||
    Object.entries(PAGE_TITLES).find(([path]) =>
      location.pathname.startsWith(path + "/")
    )?.[1];

  if (!title || location.pathname === "/portal") return null;

  return (
    <span className="text-sm font-semibold text-foreground/80 truncate max-w-[160px]">
      {title}
    </span>
  );
}
