# Root-Cause Review · Screenshot Pack

**Sprint 24** · Capturas oficiales del flujo Root-Cause Review para demos,
onboarding y material comercial. **Documentación/assets only** — cero código
de producto, cero queries, cero cambios de lógica.

> ⚠️ **Solo QA/staging.** Está prohibido tomar o subir screenshots contra
> `staflyapp.lovable.app` o `staflyapps.com`. Ver "Reglas" abajo.

---

## Cómo generar las capturas

Las screenshots se producen con el harness Playwright existente
(`tests/e2e/root-cause-deeplinks.spec.ts`), que ya corre en desktop
(1440×900) y mobile (Pixel 5 · 390×844) contra QA/staging.

### Opción A · Reusar screenshots del harness

El harness guarda evidencia en `test-results/root-cause/**` y
`playwright-report/`. Después de una corrida verde en CI o local:

```bash
E2E_BASE_URL=https://<qa-preview>.lovable.app \
E2E_STORAGE_STATE=./.playwright/auth.json \
E2E_PAY_PERIOD_ID=... \
E2E_EMPLOYEE_ID=... \
E2E_TIME_ENTRY_ID=... \
E2E_SHIFT_ID=... \
bunx playwright test --project=desktop --project=mobile
```

Copiar los `.png` relevantes desde `test-results/root-cause/` a esta
carpeta con los nombres canónicos de la tabla de abajo.

### Opción B · Captura manual QA

En un navegador logueado contra QA/staging, reproducir el paso, hacer
screenshot del viewport (desktop 1366 o 1440 de ancho, mobile 390×844),
y guardar con el nombre canónico.

---

## Nombres canónicos

| #   | Archivo                                       | Escena                                                                  | Viewport         |
| --- | --------------------------------------------- | ----------------------------------------------------------------------- | ---------------- |
| 1   | `01-explorer-checklist.png`                   | Root-Cause Explorer con checklist + evidencia visibles                  | Desktop 1440     |
| 2   | `02-timeclock-focus.png`                      | Time Clock abierto desde revisión con entry enfocada                    | Desktop 1440     |
| 3   | `03-attendance-focus.png`                     | Attendance abierto desde revisión con empleado enfocado                 | Desktop 1440     |
| 4   | `04-attendance-local-filter.png`              | Attendance con filtro local activo + nota "Vista filtrada localmente"   | Desktop 1440     |
| 5   | `05-shifts-detail-dialog.png`                 | Shifts con `ShiftDetailDialog` abierto desde revisión                   | Desktop 1440     |
| 6   | `06-review-queue-worker-focus.png`            | Payroll Review Queue con worker enfocado                                | Desktop 1440     |
| 7   | `07-review-queue-local-filter.png`            | Payroll Review Queue con filtro local activo + nota de vista filtrada   | Desktop 1440     |
| 8   | `08-amber-fallback-not-found.png`             | Fallback ámbar "No encontrado en el rango cargado"                      | Desktop 1440     |
| 9   | `09-mobile-timeclock-banner.png`              | Mobile Time Clock con banner compacto "Abierto desde revisión"          | Mobile 390×844   |
| 10  | `10-mobile-review-queue-focus.png`            | Mobile Payroll Review Queue con foco                                    | Mobile 390×844   |

Cada archivo debe entrar en el pack con **exactamente** ese nombre para que
los enlaces en `docs/root-cause-review-demo-pack.md` funcionen.

---

## Placeholders

Hasta que el harness se ejecute contra QA con secrets reales, esta carpeta
contiene únicamente este README y placeholders documentales (`.placeholder`)
con el nombre canónico. Reemplazar cada placeholder por el `.png` real:

```bash
# Ejemplo tras una corrida del harness
cp test-results/root-cause/desktop/attendance-focus.png \
   docs/assets/root-cause-review/03-attendance-focus.png
rm docs/assets/root-cause-review/03-attendance-focus.png.placeholder
```

No renombrar. No mover a otra carpeta. El demo pack los enlaza por ruta
relativa.

---

## Reglas obligatorias

- **Solo QA/staging.** Nunca capturar producción.
- **Cero PII.** Blur/tachar/redactar antes de commitear:
  - Nombres completos reales
  - Emails, teléfonos, direcciones
  - Rates, montos de payroll, totales monetarios
  - IDs de empleados que puedan cruzarse con producción
  - Números de identificación fiscal
- **Cero datos sensibles.** Usar seed data QA o cuentas demo.
- **Cero código.** Este sprint no modifica `src/`, ni queries, ni RLS, ni
  edge functions, ni `payrollDryRunReviewRouter`, ni `RootCauseExplorer`.
- **Peso.** Preferir PNG optimizado (`pngquant`/`oxipng`) < 400 KB por
  imagen. Screenshots pesadas ralentizan clones y previews.

## Herramientas de redacción sugeridas

- Blur manual: cualquier editor de imagen (Preview, Figma, GIMP).
- CLI batch blur: `magick <in>.png -region <x>x<y>+<a>+<b> -blur 0x8 <out>.png`.
- Verificar antes de commitear: abrir el PNG y hacer zoom a cualquier zona
  con texto — si es legible y contiene PII, redactar.
