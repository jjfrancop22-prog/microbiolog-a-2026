# MICROBIOLOGÍA ERP V3.5.4-A — Production Clean Start

Base exacta: V3.5.3-C3.

## Objetivo
Dejar el ERP listo para comenzar el uso oficial desde cero sin destruir la infraestructura ya estabilizada.

## Qué SE CONSERVA
- Firebase Authentication y usuarios.
- `erpDirectory` / perfiles cloud.
- Roles y permisos.
- Configuración Firebase.
- Catálogos maestros.
- Catálogo de personal.
- Criterios y versiones.
- Catálogos de equipos, medios, microorganismos y puntos.
- Configuraciones de equipos/ambiente.
- Historial `auditLog` y motor de auditoría.
- Arquitectura Multi-PC, Netlify y seguridad.

## Qué SE ELIMINA
Datos operativos de prueba:
- Muestras, análisis y duplicados.
- Lotes/uso/cierre/trazabilidad operativa de productos.
- Preparaciones, QC, liberaciones, lotes de frascos y rendimiento.
- Preparaciones/reactivaciones/eventos de crioviales.
- Controles microbiológicos y QC de muestras.
- Controles, limpiezas, lecturas e históricos operativos de equipos/áreas.
- Outbox, inbox, conflictos y metadatos de sincronización de la computadora que ejecuta el reset.

## Seguridad del reset
Solo Administrador:
1. Reautenticación con contraseña Firebase.
2. Frase exacta `INICIAR PRODUCCION`.
3. Confirmación final.
4. Primero limpia Firebase.
5. Solo si Firebase termina sin errores, limpia la base local.
6. Registra `PRODUCTION_CLEAN_START` en auditoría.

## Uso
Administración → Inicio limpio de producción → Reiniciar datos operativos para producción.

Ejecutar una sola vez antes del inicio oficial.
