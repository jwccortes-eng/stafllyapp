UPDATE public.role_templates
SET name = 'Shift Administrator',
    description = 'Operación diaria: crear, editar, publicar, duplicar, cancelar y asignar servicios.'
WHERE is_system = true AND name = 'Supervisor de Turnos';

UPDATE public.role_templates
SET name = 'Time & Closeout Administrator',
    description = 'Cierre operativo: revisar, ajustar y aprobar horas, asistencia y cierre de servicios.'
WHERE is_system = true AND name = 'Supervisor de Reloj';

UPDATE public.role_templates
SET name = 'Payroll Administrator',
    description = 'Prepara pagos, revisa novedades y genera periodos. No aprueba el lote.',
    actions = ARRAY['crear_nomina','editar_nomina','exportar_nomina','ver_salarios','ver_reportes']
WHERE is_system = true AND name = 'Gestor de Nómina';

INSERT INTO public.role_templates (company_id, name, description, actions, is_system)
SELECT NULL, 'Payroll Approver', 'Revisa y aprueba o rechaza el lote de pago. No ajusta horas históricas.',
       ARRAY['aprobar_nomina','ver_salarios','ver_reportes'], true
WHERE NOT EXISTS (SELECT 1 FROM public.role_templates WHERE is_system = true AND name = 'Payroll Approver');

INSERT INTO public.role_templates (company_id, name, description, actions, is_system)
SELECT NULL, 'Service Supervisor', 'Responsable en sitio de los servicios asignados: asistencia y revisión de horas de su equipo. El nombre visible puede cambiar por empresa (Supervisor, Captain, Headwaiter).',
       ARRAY['editar_clock'], true
WHERE NOT EXISTS (SELECT 1 FROM public.role_templates WHERE is_system = true AND name = 'Service Supervisor');