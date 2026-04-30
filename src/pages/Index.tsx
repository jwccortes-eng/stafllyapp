import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Production hotfix (2026-04-30):
 * Public landing was showing legacy copy on staflyapps.com. Decision: do NOT
 * render any landing here. `/` is now a thin redirect:
 *   - hash with auth tokens  -> /auth/callback
 *   - authenticated user     -> /app or /portal (per role/mode)
 *   - everyone else          -> /login
 *
 * No landing, no marketing copy, no lazy chunks.
 */
export default function Index() {
  const { user, loading, canAccessAdmin, canAccessPortal, activeMode } = useAuth();
  const navigate = useNavigate();

  // Handle Supabase auth redirects that land on `/#access_token=...`
  useEffect(() => {
    const hash = window.location.hash;
    if (
      hash &&
      (hash.includes("access_token") ||
        hash.includes("refresh_token") ||
        hash.includes("type=") ||
        hash.includes("error"))
    ) {
      navigate(`/auth/callback${hash}`, { replace: true });
      return;
    }
    if (hash === "#") {
      window.history.replaceState(null, "", window.location.pathname || "/");
    }
  }, [navigate]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    if (canAccessAdmin && canAccessPortal) {
      navigate(activeMode === "employee" ? "/portal" : "/app", { replace: true });
    } else if (canAccessAdmin) {
      navigate("/app", { replace: true });
    } else if (canAccessPortal) {
      navigate("/portal", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate, canAccessAdmin, canAccessPortal, activeMode]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  );
}
