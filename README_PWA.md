# MICROBIOLOGÍA ERP — PWA instalable

Base funcional: V3.5.4-A3.2 PRODUCTION CLEAN.

Esta edición agrega únicamente la capa PWA: manifest, iconos, Service Worker seguro, runtime de instalación/actualización y compatibilidad de despliegue Netlify/GitHub. No sustituye ni modifica el motor Firebase/IndexedDB de `app.js`.

## Netlify
Publique esta carpeta completa. `netlify.toml` y `_redirects` ya están incluidos.

## GitHub
Suba el contenido completo del paquete al repositorio. Para instalación PWA, el sitio debe servirse por HTTPS (Netlify u otro hosting compatible).

## Instalación
Abra el sitio publicado en Chrome/Edge. Cuando el navegador habilite la instalación aparecerá el botón **Instalar MICROBIOLOGÍA ERP**. En Safari de macOS puede utilizar **Archivo → Añadir al Dock**.

## Actualizaciones
`index.html`, JavaScript y CSS se solicitan con `no-store` desde el Service Worker. Solo manifest e iconos usan caché estática. Cuando exista un Service Worker nuevo, la aplicación ofrece **Actualizar ahora**.
