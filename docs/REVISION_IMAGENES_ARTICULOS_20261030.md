# Revision de altas, edicion e imagenes — 30 de octubre de 2026

## Estado

Los cambios del frontend estan en el workspace; no se publicaron ni se hizo push.
El usuario aplico las cuatro politicas `mm_product_images_staff_*` y confirmo COMMIT.
El HTTP 504 de Storage se reprodujo por API fuera de la aplicacion. Las pruebas
posteriores directas/publicas y con un PNG de 4 MiB pasaron, pero no se demostro
la causa de aquel fallo intermitente. Esta revision no declara resuelto ese
incidente ni sustituye una prueba visual con una sesion real de personal.

## Recorridos examinados

- Alta y modal de edicion: `/admin/productos` y `/admin/productos/nuevo`.
- Edicion de catalogo: `/admin/productos/editar`.
- Insumos: las tres rutas reutilizan los componentes de productos.
- Archivo y restauracion: `/admin/productos/archivar`; `/eliminar` redirige alli.
- Usuarios del mismo bucket: edicion de packs y logo de tienda.
- Cliente Supabase compartido, optimizador de archivos, resolucion de URLs
  migradas, permisos de roles y acceso por sucursal.
- Regresiones de catalogo publico, cesta, variantes, disponibilidad, paginacion,
  imagenes de ventas y auditoria de stock mediante pruebas existentes.

## Fallos corregidos en codigo

1. El alta lanzaba todas las fotos con Promise.all. Ahora usa el mismo cargador
   secuencial que las otras pantallas; valida el lote completo antes de subir.
2. El optimizador capturaba su propio error de limite y devolvia el original
   demasiado grande. Los retornos de respaldo respetan ahora el limite duro,
   incluso con GIF/SVG, errores de decodificacion o falta de canvas.
3. Se enviaban archivos con MIME implicito y nombres inconsistentes. El cargador
   conserva MIME explicito, extension coherente y nombres UUID, sin sobrescribir.
4. Un fallo parcial de lote podia dejar fotos confirmadas sin referencia. El
   cargador intenta limpiar solo las rutas unicas confirmadas de ese lote usando
   Storage API y comunica si no puede confirmar la limpieza.
5. Se borraban archivos tras un error de galeria aunque el producto ya pudiera
   existir. Esa limpieza peligrosa se retiro; se conservan archivos y formulario.
6. Un fallo posterior al INSERT se presentaba como alta completamente fallida,
   permitiendo repetir el alta. Ahora conserva el ID confirmado, informa del
   registro incompleto y bloquea repetirlo en ese formulario. La accion explicita
   "Iniciar otro articulo" limpia el borrador para una nueva alta distinta.
7. La validacion de variantes duplicadas ocurria despues de subir las fotos; ahora
   ocurre antes. Un error al consultar nombres duplicados tambien detiene el alta.
8. UPDATE/DELETE podian afectar cero filas por RLS y anunciar exito. Las escrituras
   individuales de producto, archivo, variante y referencias relevantes verifican
   las filas devueltas, ademas del error de Supabase.
9. La edicion ignoraba errores de lectura/escritura de variantes y de galeria.
   Ahora los propaga. Valida stock y pertenencia de variantes antes de subir fotos
   o modificar datos descriptivos; sus escrituras incluyen producto y sucursal.
10. Los modales no incluian siempre la foto principal y dejaban `imagen_url`
    apuntando a una foto quitada. Incluyen la foto principal en la galeria editable
    y actualizan el fallback al guardar, incluida la galeria vacia.
11. La sincronizacion de referencias inserta reemplazos antes de quitar fotos
    anteriores, conserva URLs historicas y limita las operaciones a producto y
    sucursal. Un fallo de INSERT no elimina las referencias anteriores.
12. Packs y logo comparten el cargador, conservando sus carpetas. La validacion
    de productos del pack precede a su subida de imagen.

## Limites deliberados y pendientes

- Quitar una imagen del articulo elimina su referencia y actualiza su imagen
  principal. No borra automaticamente el archivo fisico historico: puede seguir
  referenciado por otra sucursal, variante, pack o producto archivado.
- Archivar conserva productos, archivos, ventas y ledger; no se agrego DELETE
  fisico de productos ni nuevas escrituras de existencias.
- Las operaciones de producto, galeria y variantes siguen siendo peticiones
  separadas. No hay una transaccion unica que las revierta todas. Los controles
  nuevos detectan fallos y conservan informacion para recuperacion; no se afirma
  atomicidad ni se reejecutan automaticamente movimientos de stock.
- Un 504 no demuestra que el servidor no escribio el objeto. No se reintentan
  subidas automaticamente ni se inventan URLs exitosas. Puede quedar un objeto
  temporal cuyo resultado no se confirmo; limpiar absolutamente todos estos casos
  requiere reconciliacion posterior en el servidor.
- No se cambiaron roles de usuarios, politicas de perfiles, cesta, ventas ni
  otros buckets. Las politicas nuevas dependen del `inventory_role()` existente.
- Falta comprobar CRUD de Storage con sesiones reales de los tres roles de
  personal y repetir el recorrido visual una vez resuelto el timeout y publicado
  el frontend.

## Evidencia del Dell

Prueba API con imagen temporal de un pixel y service_role, sin productos reales:

| Operacion | Resultado | Tiempo |
| --- | --- | --- |
| Subida POST | HTTP 200 | 5,12 s |
| Reemplazo PUT | HTTP 504 | 30,04 s |
| Borrado por API | HTTP 200 | 18,30 s |
| Lectura tras borrado | HTTP 400 de objeto inexistente | 0,05 s |

Esto reproduce una demora de infraestructura independiente del formulario y de
la politica RLS de un empleado. No identifica por si solo su causa. La plantilla
Envoy de Storage declara timeout de 30 s; coincidir con ese tiempo no justifica
subir el timeout sin aislar el origen.

Las comprobaciones HTTP de salud/publicacion fueron intermitentes: hubo timeouts
de 12 s y despues respuestas de aproximadamente 0,25 s. La ruta localhost:8000
no se considera prueba de configuracion equivalente a la ruta publica; Auth/REST
respondieron distinto. La comparacion siguiente usa la IP del contenedor Storage
verificado para omitir ambos proxies.

Captura entregada por el usuario:

- Storage y PostgreSQL running/healthy, sin OOM ni reinicios.
- Storage usa backend file, limite 50 MiB y conexion directa a db:5432.
- Volumen writable, modo 0775, propietario 1000:1000; espacio disponible abundante.
- `docker stats` agoto 35 s. Se retiro de la ruta critica del diagnostico.
- PostgreSQL: max_connections=100, unas 18 conexiones, cero conexiones bloqueadas,
  ningun lock sin conceder y cero deadlocks en esa captura.
- `statement_timeout` observado: 15 s. No se cambio; tampoco se aumento el pool.
- Se observo espera de disco del host de 24–25 % con vmstat. Es una muestra,
  no una causa demostrada del fallo de Storage.

La comparacion posterior entregada por el usuario paso todas las operaciones:
Storage directo devolvio 200 para POST/PUT/GET/DELETE entre 0,00 y 0,05 s;
la ruta publica devolvio 200 entre 0,04 y 0,21 s. En ambos casos, la consulta
posterior al borrado devolvio el 400 de objeto inexistente. La nueva captura
SQL tampoco mostro conexiones bloqueadas ni locks sin conceder.

Tambien se ejecuto un PNG RGBA valido generado aleatoriamente de 4.196.671 bytes
usando el multipart del SDK del navegador, sin fotos ni datos reales:

| Operacion publica con PNG de ~4 MiB | Resultado | Tiempo | Tiempo upstream Envoy |
| --- | --- | --- | --- |
| Subida POST | HTTP 200 | 0,24 s | 15 ms |
| Reemplazo PUT | HTTP 200 | 0,09 s | 22 ms |
| Lectura | HTTP 200 | 0,05 s | 17 ms |
| Borrado por API | HTTP 200 | 0,04 s | 6 ms |
| Verificacion posterior | HTTP 400 de objeto inexistente | 0,04 s | 1 ms |

No se cambio configuracion, reinicio servicios ni aumento timeouts/pool entre
esas mediciones. Los porcentajes instantaneos de iowait en operaciones de pocos
milisegundos son muestras demasiado cortas para atribuir causalidad.

## Herramientas de verificacion

- `test_product_images_storage_rls.sql`: prueba SELECT/INSERT/UPDATE por rol en
  subtransacciones revertidas, y rechazo de INSERT anonimo. No hace DELETE directo.
  La primera version de esta prueba era incorrecta: Storage protegia el DELETE
  de metadata y la transaccion fallo/se revirtio. No se desactivo ese trigger.
- `test_dell_storage_api.py`: prueba API sobre un UUID temporal propio, con
  limpieza final y verificacion de ausencia, sin mostrar claves ni cuerpos.
- `diagnose_dell_storage_runtime.py`: lectura acotada de estado y esperas SQL,
  sin logs, consultas de usuarios ni datos del catalogo. `--compare` agrega las
  pruebas temporales contra Storage directo y contra el dominio publico.
- La lectura de logs completos fue rechazada por la revision automatica por
  posible exposicion de tokens; los diagnosticos posteriores evitan logs.

## Validacion local

75 pruebas correctas de cargas, optimizacion, manejadores reales de alta/edicion,
referencias, sucursales, cesta, catalogo, paginacion e imagenes.
TypeScript sin errores. Compilacion final completa de las 65 rutas correcta.
Los modulos nuevos y sus pruebas pasan ESLint. La comparacion final contra HEAD
confirma los mismos seis errores React preexistentes en las dos paginas de alta,
sin nuevos errores en los seis componentes revisados, incluido archivo.

Se encontro ademas un texto de ruta Windows accidental en
`node_modules/@types/node/globals.d.ts` que impedia verificar tipos. Se restauro
solo la firma `[key: string]: T | undefined;` de esa dependencia local; no se
modifico package.json ni package-lock.json.

Referencias tecnicas: [errores de Storage](https://supabase.com/docs/guides/storage/debugging/error-codes),
[RLS al subir](https://supabase.com/kb/troubleshooting/storage-error-403-forbidden-new-row-violates-row-level-security-policy-on-upload),
[timeouts de Envoy](https://www.envoyproxy.io/docs/envoy/latest/faq/configuration/timeouts).
