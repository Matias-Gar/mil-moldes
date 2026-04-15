https://catalogo-sigma-one.vercel.app/# Catalogo

Aplicacion Next.js para gestion de catalogo, ventas y operaciones administrativas.

Este repositorio esta organizado para mantener estabilidad funcional y visual, con foco en mantenibilidad y auditoria tecnica.

## Stack

- Next.js App Router
- React 19
- TypeScript (modo estricto)
- Supabase (datos, auth y storage)
- Tailwind CSS

## Scripts

- `npm run dev`: desarrollo local
- `npm run build`: build de produccion
- `npm run start`: ejecutar build
- `npm run lint`: analisis estatico ESLint
- `npm run lint:fix`: aplicar fixes automaticos ESLint
- `npm run typecheck`: chequeo de tipos TypeScript
- `npm run quality`: control de calidad base (typecheck + lint)

## Estructura

- `app/`: paginas, layouts y API routes (App Router)
- `components/`: componentes UI y de dominio
- `hooks/`: hooks reutilizables
- `lib/`: utilidades, servicios y clientes compartidos
- `services/`: logica de servicios de negocio
- `types/`: declaraciones y tipos globales

## Criterios De Calidad

- No cambiar comportamiento funcional durante refactors tecnicos.
- No cambiar presentacion visual durante limpieza interna.
- Priorizar eliminacion de deuda de bajo riesgo: imports/variables no usadas, consistencia y reglas.
- Mantener cambios pequenos, trazables y revisables por terceros.

## Flujo De Auditoria Recomendado

1. Ejecutar `npm run quality`.
2. Revisar warnings nuevos o regresiones.
3. Validar rutas criticas manualmente (ventas, productos, pagos, whatsapp).
4. Revisar cambios con foco en seguridad y consistencia.

## Notas De Proyecto

- Algunas pantallas usan `<img>` intencionalmente por URLs dinamicas y control fino de rendering.
- Para mitigar riesgos de cambios visuales, se prioriza refactor interno sin alterar marcado funcional.
- Ver documentos en `docs/` para estandares y checklist de revision.
