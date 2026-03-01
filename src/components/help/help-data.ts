import {
  LogIn, Clock, CalendarDays, DollarSign, AlertTriangle, CreditCard,
} from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

export interface HelpCategory {
  id: string;
  icon: any;
  title: { es: string; en: string };
  description: { es: string; en: string };
  color: string;
  faqs: { es: FaqItem[]; en: FaqItem[] };
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "access",
    icon: LogIn,
    title: { es: "Acceso y cuenta", en: "Login & Access" },
    description: { es: "Inicio de sesión y recuperación", en: "Sign in and recovery" },
    color: "bg-primary/10 text-primary",
    faqs: {
      es: [
        { q: "¿Soy empleado, dónde inicio sesión?", a: "En **Portal Empleados**: /portal\nIngresas con **teléfono + código de 4 dígitos**." },
        { q: "¿Soy admin/manager, dónde inicio sesión?", a: "En **Admin**: /auth\nIngresas con **correo + contraseña**." },
        { q: "Olvidé mi código (empleado)", a: "Contacta a tu **Manager o Admin**. Por seguridad, los empleados **no pueden cambiar** su propio código.\nEl Manager/Admin lo regenera en: **Employees → Profile → Access**." },
        { q: "Mi número de teléfono cambió", a: "Solicita a tu Manager/Admin que actualice tu teléfono en tu perfil." },
      ],
      en: [
        { q: "I'm an employee. Where do I log in?", a: "Employee Portal: /portal\nLogin with **phone + 4-digit code**." },
        { q: "I'm an admin/manager. Where do I log in?", a: "Admin: /auth\nLogin with **email + password**." },
        { q: "I forgot my employee code", a: "Contact your **Manager or Admin**. For security reasons, employees **can't change** their own code.\nManager/Admin can regenerate it in: **Employees → Profile → Access**." },
        { q: "My phone number changed", a: "Ask your Manager/Admin to update it in your profile." },
      ],
    },
  },
  {
    id: "timeclock",
    icon: Clock,
    title: { es: "Reloj y GPS", en: "Time Clock & GPS" },
    description: { es: "Fichajes y ubicación", en: "Punches and location" },
    color: "bg-success/10 text-success",
    faqs: {
      es: [
        { q: "¿Por qué StaflyApps pide ubicación?", a: "Para registrar GPS **solo** cuando haces **Clock In / Clock Out**.\nStaflyApps **no** hace tracking continuo." },
        { q: "No me deja fichar / no aparece el GPS", a: "1. Activa Location Services en tu teléfono\n2. Permite ubicación para el navegador (Safari/Chrome)\n3. Verifica internet (Wi-Fi o datos)\n4. Cierra y abre el navegador e intenta de nuevo" },
        { q: "Olvidé hacer Clock Out", a: "Contacta a tu Manager/Admin para que aplique **Force clock-out** o ajuste el registro." },
      ],
      en: [
        { q: "Why does StaflyApps ask for location?", a: "To capture GPS **only** when you **Clock In/Out**.\nStaflyApps does **not** track you continuously." },
        { q: "I can't clock in / GPS doesn't show", a: "1. Enable Location Services\n2. Allow browser location permission\n3. Check internet connection\n4. Restart the browser and try again" },
        { q: "I forgot to Clock Out", a: "Contact your Manager/Admin to **force clock-out** or adjust the entry." },
      ],
    },
  },
  {
    id: "shifts",
    icon: CalendarDays,
    title: { es: "Turnos", en: "Shifts" },
    description: { es: "Asignaciones y calendario", en: "Assignments and schedule" },
    color: "bg-accent text-accent-foreground",
    faqs: {
      es: [
        { q: "¿Dónde veo mis turnos?", a: "En el portal del empleado: **Mis turnos**." },
        { q: "No veo el turno que me dijeron", a: "Puede estar pendiente de asignación, o hubo un cambio. Contacta a tu Manager/Admin." },
      ],
      en: [
        { q: "Where can I see my shifts?", a: "Employee Portal → **My Shifts**." },
        { q: "I don't see a shift I was told about", a: "It may not be assigned yet or it was changed. Contact your Manager/Admin." },
      ],
    },
  },
  {
    id: "payroll",
    icon: DollarSign,
    title: { es: "Pagos y PayStubs", en: "Payroll & PayStubs" },
    description: { es: "Nómina y recibos de pago", en: "Payroll and pay receipts" },
    color: "bg-earning/10 text-earning",
    faqs: {
      es: [
        { q: "¿Cuándo veo mis pagos?", a: "Cuando la empresa publique la nómina (**Published**).\nLuego puede marcarse como **Paid** cuando confirmen el pago." },
        { q: "No veo mi PayStub", a: "• Puede que el periodo aún no esté publicado\n• O tu perfil no está vinculado correctamente\nContacta a tu Manager/Admin.\n\n💡 \"Paid\" es confirmación administrativa. El pago puede reflejarse en tu banco unos días después." },
      ],
      en: [
        { q: "When will I see my pay?", a: "When payroll is **Published**.\nIt may later be marked as **Paid**." },
        { q: "I can't see my PayStub", a: "• Payroll may not be published yet\n• Or your profile is not linked correctly\nContact your Manager/Admin.\n\n💡 \"Paid\" is an administrative confirmation. Deposits may appear a few days later." },
      ],
    },
  },
  {
    id: "troubleshooting",
    icon: AlertTriangle,
    title: { es: "Problemas comunes", en: "Troubleshooting" },
    description: { es: "Soluciones rápidas", en: "Quick fixes" },
    color: "bg-warning/10 text-warning",
    faqs: {
      es: [
        { q: "No puedo iniciar sesión", a: "Confirma si eres empleado (**/portal**) o admin (**/auth**). Son accesos diferentes." },
        { q: "Código inválido (empleado)", a: "Pide a tu Manager/Admin que regenere tu código en **Employees → Profile → Access**." },
        { q: "Fichaje duplicado", a: "Reporta a tu Manager/Admin. Ellos pueden corregirlo desde el panel de administración." },
        { q: "Fichaje abierto", a: "El Admin/Manager puede cerrarlo con **Force clock-out** desde la vista Today." },
      ],
      en: [
        { q: "Can't log in", a: "Confirm whether you're an employee (**/portal**) or admin (**/auth**). They are separate logins." },
        { q: "Invalid employee code", a: "Ask your Manager/Admin to regenerate your code in **Employees → Profile → Access**." },
        { q: "Duplicate punch", a: "Contact your Manager/Admin. They can correct it from the admin panel." },
        { q: "Open entry", a: "Admin/Manager can close it with **Force clock-out** from the Today view." },
      ],
    },
  },
  {
    id: "billing",
    icon: CreditCard,
    title: { es: "Facturación", en: "Billing" },
    description: { es: "Planes y suscripción", en: "Plans and subscription" },
    color: "bg-destructive/10 text-destructive",
    faqs: {
      es: [
        { q: "¿Qué planes hay disponibles?", a: "• **Free** — Funciones básicas\n• **Pro** ($49/mes) — Funciones avanzadas\n• **Enterprise** ($149/mes) — Todo incluido + soporte prioritario" },
        { q: "¿Cómo gestiono mi suscripción?", a: "Desde el panel Admin → **Billing**. Puedes cambiar de plan, ver facturas y actualizar tu método de pago a través del **Stripe Customer Portal**." },
      ],
      en: [
        { q: "What plans are available?", a: "• **Free** — Basic features\n• **Pro** ($49/mo) — Advanced features\n• **Enterprise** ($149/mo) — Everything + priority support" },
        { q: "How do I manage my subscription?", a: "From Admin → **Billing**. You can change plans, view invoices, and update payment methods through the **Stripe Customer Portal**." },
      ],
    },
  },
];
