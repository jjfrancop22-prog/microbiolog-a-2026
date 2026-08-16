# MICROBIOLOGÍA ERP V3.5.3-C1 — Production Firebase Bootstrap Fix

Corrección para GitHub + Netlify:
- La configuración web pública de Firebase queda precargada en `app.js`.
- En un dominio nuevo (Netlify, otra PC o navegador limpio) el ERP ya no depende de un `localStorage` configurado previamente.
- Si existe una configuración válida en `localStorage`, se conserva.
- Si no existe, se carga automáticamente el proyecto `laboratorio-kardex`.
- Se mantiene Firebase Authentication, Firestore, Multi-PC, permisos, auditoría y cierre de sesión por inactividad.
- Se mantiene reautenticación Firebase para acciones críticas.
- Se añadió favicon vacío para evitar el 404 irrelevante de `/favicon.ico`.

Para Netlify:
1. Sustituir los archivos del repositorio por los de esta carpeta.
2. Confirmar que `microbiologia-erp.netlify.app` esté en Firebase Authentication > Authorized domains.
3. Netlify debe desplegar el nuevo commit automáticamente.
4. Probar inicio de sesión en una ventana privada o navegador limpio.
