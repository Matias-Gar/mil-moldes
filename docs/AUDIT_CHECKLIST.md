# Checklist De Auditoria Tecnica

## 1. Salud Del Codigo

- [ ] `npm run typecheck` exitoso
- [ ] `npm run lint` sin errores
- [ ] No hay imports o variables muertos en archivos tocados

## 2. Riesgo Funcional

- [ ] No cambian rutas ni contratos de API
- [ ] No cambia flujo de autenticacion
- [ ] No cambian calculos de ventas/pagos/stock

## 3. Riesgo Visual

- [ ] No cambia layout en vistas de cliente
- [ ] No cambia layout en panel admin
- [ ] No cambia comportamiento de formularios

## 4. Seguridad

- [ ] Variables sensibles por entorno
- [ ] Errores no exponen informacion interna
- [ ] Entradas externas validadas/sanitizadas

## 5. Trazabilidad

- [ ] Cambios pequenos y con intencion clara
- [ ] Documentacion actualizada
- [ ] Mensajes y convenciones consistentes
