import { useEffect } from "react";
import { useSearchParams, useNavigate, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

/**
 * Legacy `/invite?token=...` entrypoint.
 *
 * The previous implementation only flipped `portal_access_enabled = true`,
 * which left employees with no PIN, no auth user, and no way to sign in.
 *
 * The premium activation wizard lives at `/activate/:token` — it creates the
 * PIN, the auth account, uploads the avatar, and then signs the worker in.
 *
 * This component now exists ONLY to keep older WhatsApp/email links working
 * by redirecting straight to the canonical route.
 */
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  useEffect(() => {
    if (!token) return;
    navigate(`/activate/${token}`, { replace: true });
  }, [token, navigate]);

  if (!token) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm">Opening your invitation…</p>
    </div>
  );
}
