import { useLocation } from "react-router-dom";

const PAGE_TITLES: Record<string, string> = {
  "/portal": "Home",
  "/portal/shifts": "My Shifts",
  "/portal/clock": "Clock",
  "/portal/payments": "My Payments",
  "/portal/profile": "Profile",
  "/portal/availability": "Availability",
  "/portal/announcements": "Announcements",
  "/portal/chat": "Chat",
  "/portal/resources": "Resources",
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
