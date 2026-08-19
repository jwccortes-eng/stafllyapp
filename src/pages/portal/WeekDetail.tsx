/**
 * WeekDetail — ruta legada del detalle semanal.
 *
 * El detalle de dinero vive ahora en el recibo publicado (`PayStub`), que lee
 * el statement congelado. Esta ruta redirige para evitar dos verdades.
 */
import { Navigate, useParams } from "react-router-dom";

export default function WeekDetail() {
  const { periodId } = useParams();
  if (!periodId) return <Navigate to="/portal/pay-reports" replace />;
  return <Navigate to={`/portal/paystub/${periodId}`} replace />;
}
