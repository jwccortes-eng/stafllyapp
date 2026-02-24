import { Navigate, Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { useAuth } from "@/hooks/useAuth";

export default function AdminLayout() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== 'owner' && role !== 'admin' && role !== 'manager') return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <main className="ml-60 p-6 lg:p-8 animate-fade-in">
        <Outlet />
      </main>
    </div>
  );
}
