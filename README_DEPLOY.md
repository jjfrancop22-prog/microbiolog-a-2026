# MICROBIOLOGÍA ERP V3.5.3-C3 — Session Login/Logout Fix

Correcciones:
- Firebase Authentication usa `browserSessionPersistence`, no persistencia permanente.
- Al cerrar el navegador/sesión del navegador, el ERP vuelve a pedir correo y contraseña.
- La primera ejecución C3 elimina una sesión antigua restaurada desde `browserLocalPersistence`.
- El botón **Cerrar sesión** ya no depende de que termine la sincronización cloud.
- La auditoría de cierre se guarda localmente primero.
- El envío cloud durante logout tiene un máximo aproximado de 1,2 s y después continúa el cierre.
- Se limpia la identidad ERP activa y vuelve inmediatamente a la pantalla de acceso.
- El cierre automático por 30 minutos utiliza el mismo mecanismo fiable.
- Se conserva Fast Production Bootstrap de C2, permisos, auditoría y Firebase Bootstrap de C1.

## Actualización Netlify
Reemplace en GitHub los archivos de la C2 por los de esta C3 y espere el deploy automático de Netlify.

Prueba:
1. Abrir la web.
2. Debe pedir credenciales.
3. Iniciar sesión.
4. Pulsar Cerrar sesión: debe volver al login.
5. Cerrar la ventana/navegador y abrir de nuevo: debe pedir credenciales nuevamente.
