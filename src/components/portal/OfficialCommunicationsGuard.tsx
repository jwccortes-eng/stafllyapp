import { Navigate } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";
import { useOfficialCommunications } from "@/hooks/useOfficialCommunications";

/**
 * Acceso a Comunicados.
 *
 * Separa dos cosas que antes estaban pegadas:
 *  - MURO GENERAL (`my_announcements`): feed social/informativo, opcional.
 *  - COMUNICADO OFICIAL: obligación con acuse. Si la persona es destinataria
 *    de una versión publicada, SIEMPRE puede abrirla, aunque la empresa no
 *    haya habilitado el muro.
 *
 * No crea un segundo módulo ni una segunda ruta: es la misma pantalla.
 */
export function OfficialCommunicationsGuard({ children }: { children: React.ReactNode }) {
  const { isModuleEnabled, loading: modulesLoading } = usePortalModules();
  const { hasOfficialCommunications, loading: officialLoading } = useOfficialCommunications();

  const allowed = isModuleEnabled("my_announcements") || hasOfficialCommunications;

  if (!allowed && (modulesLoading || officialLoading)) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!allowed) return <Navigate to="/portal" replace />;

  return <>{children}</>;
}
