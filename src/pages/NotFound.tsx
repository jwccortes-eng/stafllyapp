import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, SearchX } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) console.warn("404:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-sm space-y-6 animate-fade-in">
        <div className="mx-auto h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center">
          <SearchX className="h-10 w-10 text-muted-foreground/40" />
        </div>
        <div className="space-y-2">
          <h1 className="text-5xl font-bold font-heading text-foreground">404</h1>
          <p className="text-muted-foreground">
            La página que buscas no existe o fue movida.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Ir al inicio
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
