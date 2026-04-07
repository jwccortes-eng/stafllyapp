import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Landing = React.lazy(() => import("./Landing"));

export default function Index() {
  const { user, loading, canAccessAdmin, canAccessPortal, activeMode } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout: if loading takes >5s, force show landing
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      console.warn("[index] Auth loading timed out after 5s, showing landing");
      setTimedOut(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    // Detect Supabase auth hash fragments at root and redirect to callback handler
    const hash = window.location.hash;
    if (hash && (hash.includes("access_token") || hash.includes("error") || hash.includes("type=") || hash.includes("refresh_token"))) {
      console.log("[index] Auth hash detected, redirecting to /auth/callback");
      navigate(`/auth/callback${hash}`, { replace: true });
      return;
    }
    // Clean stale empty hash
    if (hash === "#" || hash === "") {
      window.history.replaceState(null, "", window.location.pathname || "/");
    }
  }, [navigate]);

  useEffect(() => {
    if (loading && !timedOut) return;
    if (!user) return;
    if (canAccessAdmin && canAccessPortal) {
      navigate(activeMode === 'employee' ? "/portal" : "/app");
    } else if (canAccessAdmin) {
      navigate("/app");
    } else if (canAccessPortal) {
      navigate("/portal");
    }
  }, [user, loading, timedOut, navigate, canAccessAdmin, canAccessPortal, activeMode]);

  if (loading && !timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-muted-foreground text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <React.Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-background">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          }
        >
          <Landing />
        </React.Suspense>
      </ErrorBoundary>
    );
  }

  return null;
}
