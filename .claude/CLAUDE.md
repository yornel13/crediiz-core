# Project rules — `calls-core`

## Estado del proyecto: DESARROLLO ACTIVO

Estamos en fase de desarrollo. **No existen datos de producción** ni usuarios reales que dependan del estado actual del backend o de la base de datos.

## Implicaciones operativas

- **Prioriza calidad sobre velocidad.** Si una solución es subóptima pero funcional, propone y aplica la versión correcta. No tomes atajos para "salir del paso".
- **Refactoriza sin reservas.** No hace falta justificar refactors amplios ni preservar APIs internas. Si una capa, módulo o nombre debe cambiar para mejorar la arquitectura, hazlo.
- **No te preocupes por compatibilidad hacia atrás.** No hay clientes externos consumiendo este backend todavía. No agregues shims, fallbacks ni rutas deprecadas.
- **No te preocupes por migrar datos existentes.** La base de datos local/staging puede ser destruida y re-seedeada en cualquier momento. Tras un cambio de schema, basta con re-correr `npm run seed`.
- **Escalabilidad sí importa.** Aunque estemos en dev, todo lo que se construya debe estar diseñado para escalar (índices apropiados, queries eficientes, separación de concerns, módulos cohesivos). Lo que se haga mal hoy, se paga al primer cliente real.
- **Dedica el tiempo necesario.** No se penaliza tomarse más tiempo si el resultado es más limpio, mejor diseñado o más mantenible.

## Lo que SÍ se mantiene

- Las reglas globales del usuario en `~/.claude/CLAUDE.md` (SOLID, DRY, KISS, SoC, persona de Tech Lead, idiomas, comandos `!R`/`!LOCKDOWN`, regla de READ-ONLY ante preguntas, etc.) siguen aplicando completamente.
- Tests deben seguir pasando tras cada cambio.
- El typecheck (`npx tsc --noEmit`) debe quedar limpio.

## Convenciones específicas del proyecto

- **Schema `Client`:** los campos básicos del Excel (`name`, `phone`, `phoneNormalized`, `cedula`, `ssNumber`, `salary`) son **planos** en el documento. Solo lo que sea específico de un banco o no estandarizable va en `extraData`.
- **Requeridos:** `name`, `phone`, `phoneNormalized`. Resto opcional. (Mantener `ssNumber` opcional — los datos reales muestran ~22% de clientes sin SS).
- **Únicos sparse:** `cedula` y `ssNumber` tienen índice `unique + sparse`. Permite múltiples `null` pero bloquea duplicados reales.
- **Normalización de teléfono:** toda creación de cliente (seed, upload, API directa) debe poblar `phoneNormalized` usando `normalizePhone()` de `@/common/utils`.
- **Notas:** `Note.interactionId` es nullable a propósito — una nota puede o no estar asociada a una llamada (ej. comentario manual del agente, nota tras un WhatsApp).
