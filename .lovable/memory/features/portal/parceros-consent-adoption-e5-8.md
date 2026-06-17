---
name: E5.8 Parceros Consent Adoption Flow
description: Worker-facing consent card in /portal/update-center surfacing 4 states for Parceros data_sharing consent. Visual PASS 2026-06-17.
type: feature
---
CLOSED 2026-06-17 as visual PASS inicial. `/portal/update-center` Comunidad Parceros section via rewritten `ConsentCenterCard`:
- 4 estados con copy aprobado: granted ("Parceros activo" + Pausar visibilidad), missing ("Únete a la comunidad Parceros" + Revisar y activar), revoked ("Tu perfil Parceros está pausado" + Reactivar), denied ("Has rechazado compartir tu perfil" + Activar).
- Writer paths intactos: INSERT en `worker_consent_records` para grant; UPDATE `revoked_at` para pausar. Sin nuevos writers.
- Lectura ampliada: ahora trae todas las rows (incluye revoked) para diferenciar revoked vs missing vs denied. Hook `useWorkerConsent` sin cambios.
- Sin banner Home, sin localStorage dismiss, sin nuevos hooks, sin post-onboarding nudge.
- Producción sigue en `PARCEROS_CONSENT_MODE=log_only`. Sin cambios en parceros-sync/payload/decider/forbidden-keys, RLS, schema, migrations, payroll, time_entries, W-9, SSN/EIN, PublicPassport.

Archivos: `src/components/portal/ConsentCenterCard.tsx` (rewrite presentacional).

QA pendiente live:
1. Click real "Pausar visibilidad" (granted→revoked).
2. Estado revoked → Reactivar funcional.
3. Estado missing → Activar funcional.
4. Mobile 390x844 sin overflow.
5. Monitorear `v_parceros_consent_adoption` 7–14 días.

No avanzar a E5.8.1 (banner Home) ni E5.7C (enforce) sin aprobación separada. Si adoption no sube tras 7–14 días, proponer E5.8.1.
