import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Landing from "./Landing";

export default function Index() {
  const { user, loading, canAccessAdmin, canAccessPortal, activeMode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (canAccessAdmin && canAccessPortal) {
      navigate(activeMode === 'employee' ? "/portal" : "/app");
    } else if (canAccessAdmin) {
      navigate("/app");
    } else if (canAccessPortal) {
      navigate("/portal");
    }
  }, [user, loading, navigate, canAccessAdmin, canAccessPortal, activeMode]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-muted-foreground text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Landing />;

  return null;
}
