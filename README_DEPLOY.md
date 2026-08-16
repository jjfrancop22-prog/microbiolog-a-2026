# MICROBIOLOGÍA ERP V3.5.4-A2 — Cloud Delete Propagation Fix

Base: V3.5.4-A1.

Corrección:
- Los listeners Firestore ahora procesan `removed`.
- Cuando un documento se elimina en Firebase, se elimina también su copia de IndexedDB.
- La vista y el Dashboard se actualizan automáticamente.
- La eliminación se propaga a todas las computadoras/navegadores conectados.
- Al iniciar sesión, el ERP reconcilia los dominios operativos locales con Firebase aunque la computadora ya tenga datos locales.
- Registros locales obsoletos que ya no existen en Firebase se eliminan.
- Si una entidad tiene una operación pendiente en outbox, la reconciliación NO la elimina, protegiendo trabajo offline todavía no sincronizado.
- Catálogos/configuraciones no se depuran por ausencia cloud; la reconciliación destructiva se limita a dominios operativos.
- Se mantienen Authentication, permisos, auditoría, Production Clean Start y la arquitectura Multi-PC.

Prueba:
1. Abrir JJF y NS en dos navegadores.
2. Confirmar FIREBASE en ambos.
3. Si JJF ya ejecutó Production Clean Start, cerrar/reabrir sesión en NS o esperar la reconciliación.
4. Ambos Dashboard deben quedar 0 / 0 / 0 / 0.
5. Crear luego un único registro nuevo y verificar que aparezca en ambas computadoras.
