# MICROBIOLOGÍA ERP V3.5.4-A1 — Sync State Fix

Corrección puntual sobre V3.5.4-A.

Problema corregido:
- El login principal y `onAuthStateChanged` podían terminar en distinto orden.
- Firestore alcanzaba estado `FIREBASE`, pero al finalizar `secureLoginSubmit()` se volvía a ejecutar `markAuthenticatedState()`.
- Ese último llamado cambiaba nuevamente la cabecera a `SINCRONIZANDO` aunque Firebase ya estuviera conectado.

Corrección:
- `onAuthStateChanged` queda como único responsable de iniciar/conectar Firestore.
- `secureLoginSubmit` ya no degrada el estado después de una conexión correcta.
- `markAuthenticatedState()` es idempotente: si `state.connected === true`, mantiene `FIREBASE`.
- No se modifica el motor Multi-PC, bootstrap, datos, permisos, auditoría ni Production Clean Start.

Prueba:
1. Abrir Netlify.
2. Iniciar sesión.
3. Debe pasar brevemente por `SINCRONIZANDO`.
4. Luego debe quedar en `FIREBASE`.
5. Entrar en Administración y ejecutar Inicio Limpio de Producción solo cuando la cabecera indique `FIREBASE`.
