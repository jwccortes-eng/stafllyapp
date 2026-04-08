import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Landing = React.lazy(() => import("./Landing"));

/* Minimal fallback if Landing chunk fails to load */
function MinimalLanding() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8 text-center gap-6">
      <h1 className="text-3xl font-bold font-heading">StaflyApps</h1>
      <p className="text-muted-foreground max-w-md">Workforce management built for real operations.</p>
      <div className="flex gap-3">
        <Link to="/auth?register=true" className="inline-flex items-center rounded-full px-6 h-11 text-sm font-semibold bg-primary text-primary-foreground">Start free</Link>
        <Link to="/portal" className="inline-flex items-center rounded-full px-6 h-11 text-sm font-semibold border border-border">Employee access</Link>
      </div>
      <div className="flex gap-4 text-sm text-muted-foreground">
        <Link to="/apply/my-staff-solution" className="underline">My Staff Solution</Link>
        <Link to="/apply/quality-staff-by-keury" className="underline">Quality Staff by Keury</Link>
      </div>
    </div>
  );
}

export default function Index() {
  const { user, loading, canAccessAdmin, canAccessPortal, activeMode } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout: if auth loading takes >3s, force show landing
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      console.warn("[index] Auth loading timed out after 3s, showing landing");
      setTimedOut(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && (hash.includes("access_token") || hash.includes("error") || hash.includes("type=") || hash.includes("refresh_token"))) {
      navigate(`/auth/callback${hash}`, { replace: true });
      return;
    }
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

  // Not authenticated → show landing
  if (!user) {
    return (
      <ErrorBoundary fallback={<MinimalLanding />}>
        <React.Suspense fallback={<MinimalLanding />}>
          <Landing />
        </React.Suspense>
      </ErrorBoundary>
    );
  }

  // User is authenticated but redirect hasn't fired yet — show spinner briefly
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  );
}
