# MICROBIOLOGÍA ERP V3.5.3-C2 — Fast Production Bootstrap

Corrección para el primer acceso en Netlify / navegador nuevo:

- Authentication y Firestore conectan primero.
- El indicador cambia rápidamente a `FIREBASE`.
- Los listeners Multi-PC se activan inmediatamente.
- La descarga inicial de colecciones se ejecuta en segundo plano y en paralelo.
- Un dominio con error o timeout no deja todo el ERP eternamente en `SINCRONIZANDO`.
- El Estado técnico informa si la carga fue completa, parcial o vacía.
- Cada dominio tiene un timeout de bootstrap de 15 segundos.
- El outbox ya no cambia toda la cabecera a `SINCRONIZANDO` durante cada envío rutinario.
- Se conserva V3.5.3-C1: configuración Firebase de producción precargada.
- No se modifican Authentication, permisos, auditoría, reglas de negocio ni estructura Firestore.

## Actualizar Netlify
Reemplace en GitHub los archivos de la versión C1 por los de esta C2. Netlify desplegará el nuevo commit automáticamente.

Prueba recomendada:
1. Abrir `https://microbiologia-erp.netlify.app` en ventana privada.
2. Iniciar sesión.
3. Confirmar que la cabecera pase de `SINCRONIZANDO` a `FIREBASE` rápidamente.
4. Esperar unos segundos y verificar que los datos cloud aparezcan.
5. Revisar Administración > Estado técnico para confirmar el resultado del bootstrap.
