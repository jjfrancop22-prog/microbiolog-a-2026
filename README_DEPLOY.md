# MICROBIOLOGÍA ERP V3.5.4-A3 — Full Product Catalog Reset

Base: V3.5.4-A2.

Corrección solicitada:
- `productCatalog` ahora forma parte del Inicio Limpio de Producción.
- La tabla **Productos configurados** queda vacía después del reset.
- Se elimina `productCatalog` tanto de Firebase como de IndexedDB.
- Las demás computadoras también eliminan sus copias locales antiguas gracias a la reconciliación cloud.
- Se mantienen Authentication, usuarios, roles/permisos, configuraciones técnicas, criterios, auditoría y arquitectura Multi-PC.

Después de publicar esta versión:
1. Entrar como Administrador.
2. Esperar estado `FIREBASE`.
3. Administración → Inicio limpio de producción.
4. Ejecutar una sola vez.
5. Verificar:
   - Dashboard 0 / 0 / 0 / 0.
   - Productos configurados: vacío.
   - Lotes activos: 0.
   - Otra computadora/navegador debe reconciliarse y quedar también vacío.
