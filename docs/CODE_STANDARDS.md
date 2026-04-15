# Estandares De Codigo

## Objetivo

Mantener el codigo estable, legible y auditable sin romper comportamiento existente.

## Reglas

- Aplicar cambios pequenos y verificables.
- Evitar refactors masivos sin validacion incremental.
- No introducir dependencias innecesarias.
- Preferir utilidades compartidas antes de duplicar logica.
- Manejar errores con mensajes accionables.
- Evitar variables e imports no usados.

## React Y Next.js

- Mantener componentes enfocados y con responsabilidades claras.
- Evitar efectos con dependencias incompletas.
- Evitar logica de negocio compleja en JSX.
- Mantener API routes con validaciones explicitas.

## Seguridad

- No hardcodear secretos.
- Validar entradas externas.
- Sanitizar contenido de usuario cuando corresponda.

## Definicion De Hecho

- `npm run typecheck` pasa.
- `npm run lint` sin errores.
- Sin cambios visuales ni funcionales no solicitados.
- Cambios documentados y revisables.
