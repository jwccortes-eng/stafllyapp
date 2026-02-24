import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth");
    } else if (role === "admin") {
      navigate("/admin");
    } else if (role === "employee") {
      navigate("/portal");
    } else {
      // User exists but no role assigned yet
      navigate("/auth");
    }
  }, [user, role, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-muted-foreground text-sm">Cargando...</p>
      </div>
    </div>
  );
};

export default Index;
