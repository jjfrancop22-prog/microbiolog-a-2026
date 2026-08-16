# MICROBIOLOGÍA ERP V3.5.3-C — Production Security & Deployment Ready

## Producción
Esta carpeta `production/` es la carpeta que debe subirse al repositorio GitHub que será conectado a Netlify.

Archivos de runtime:
- `index.html`
- `app.js`
- `styles.css`
- `netlify.toml`

Seguridad / Firebase:
- `FIRESTORE_RULES_V353C.rules`
- `firestore.rules`

## Cambio de seguridad de V3.5.3-C
La contraseña fija `CALIDAD` fue eliminada del JavaScript.

Para una eliminación:
1. El usuario debe ser Administrador.
2. Debe existir una sesión Firebase Authentication válida.
3. El sistema vuelve a solicitar la contraseña Firebase del Administrador.
4. Firebase reautentica al usuario.
5. Solo con reautenticación válida continúa la eliminación.
6. `DELETE_AUTHORIZED` o `DELETE_DENIED` queda en auditoría.

Esto evita publicar una contraseña administrativa fija dentro del JavaScript del sitio.

## Antes de publicar
1. Publicar `FIRESTORE_RULES_V353C.rules` en Firebase Firestore.
2. Confirmar que Email/Password sigue habilitado en Firebase Authentication.
3. Subir únicamente el contenido de `production/` al repositorio GitHub.
4. En Netlify conectar ese repositorio. No hay comando de build; el directorio de publicación es `.`.
5. Cuando Netlify entregue el dominio, agregar ese dominio en Firebase Authentication > Settings > Authorized domains.
6. Probar login, Multi-PC, permisos, auditoría y una eliminación administrativa controlada.
7. Si se configura un dominio propio, agregar también ese dominio a Firebase Authorized domains.

## Nota de frontend
La configuración web de Firebase (API key, projectId, appId, etc.) identifica el proyecto cliente; las protecciones reales dependen de Authentication y de las reglas Firestore. No guardar contraseñas privadas ni claves de servicio en este repositorio.

## Archivos no incluidos
Los README históricos de desarrollo fueron excluidos del paquete de producción para mantener limpio el repositorio/deploy.
