# Contratos de imágenes de pedidos

M7/PR2 mantiene el bucket `order-designs` privado, una colección de 0 a 3 imágenes por pedido y no persiste URLs firmadas. La primera imagen se selecciona automáticamente como principal; las siguientes no cambian esa selección. Los cuatro roles internos pueden agregar, reemplazar, eliminar y seleccionar o limpiar manualmente la imagen principal.

## Flujo

1. `startOrderDesignImageUploadAction` valida sesión, perfil activo, cambio obligatorio de contraseña, rol, pedido, intención explícita (`add` o `replace`), imagen objetivo, MIME, tamaño y versión. Devuelve un path candidato UUID limitado al pedido.
2. El cliente carga directamente ese path con el cliente Supabase autenticado.
3. `mutateOrderDesignImageAction` acepta únicamente `add`, `replace`, `delete`, `set_primary` o `clear_primary`. Para altas y reemplazos verifica bytes, formato JPEG/PNG/WebP, límite de 10 MiB y 40 megapíxeles antes de generar una preview WebP privada de hasta 480 px con Sharp. Conserva el original intacto y confirma metadata mediante la RPC protegida. Un replay ya confirmado no regenera la preview; un reintento de confirmación reutiliza la variante persistida. Reemplazo y eliminación limpian la preview anterior; los originales no referenciados conservan el procedimiento de reconciliación. La RPC vuelve a validar actor, versión, metadata y antigüedad.
4. El tablero y la galería solicitan previews disponibles; una imagen anterior sin preview conserva el original como respaldo, sin transformación durante la lectura. `getOrderDesignImageReadUrl` y su acción original mantienen el acceso al original. La ampliación explícita usa la ruta autorizada `/orders/[orderId]/designs/[imageId]/original`. Los enlaces firmados mantienen cinco minutos de vigencia; no se persisten en PostgreSQL.

## Reconciliación

`reconcileOrderDesignObjects()` es server-only y usa el cliente administrativo únicamente para mantenimiento técnico. El modo predeterminado es dry-run:

```ts
const plan = await reconcileOrderDesignObjects();
```

Solo una ejecución explícita con `execute: true` elimina objetos válidos, no referenciados y con más de 60 minutos. Antes de borrar relee las referencias vigentes y la RPC rechaza candidatos no confirmados que ya alcanzaron esa antigüedad; ambas barreras impiden que un objeto elegible se convierta en referencia vigente durante la reconciliación. Nunca elimina paths vigentes, objetos sin timestamp confiable ni paths con formato desconocido.

```ts
const result = await reconcileOrderDesignObjects({ execute: true });
```

La ejecución efectiva requiere un contexto server-side autorizado para mantenimiento; no se expone en la UI ni se ejecuta automáticamente desde una request operativa.

## Publicación y validación en staging

Este procedimiento lo ejecuta el responsable del entorno, no el agente. Usar únicamente pedidos e imágenes sintéticos identificados con `STG-<rama>-<fecha>-<caso>`. No reutilizar pedidos de otros equipos ni datos reales.

### 1. Preparación

1. Revisar el diff y el CI del PR a `develop`; la suite completa corresponde al CI. Registrar el commit candidato y el deployment anterior de la app y de la función.
2. Identificar explícitamente los proyectos Supabase y Vercel de staging. Confirmar runtime Node 22.x, instalación con `pnpm install --frozen-lockfile` y variables Preview apuntando solo a Supabase Staging; no copiar contraseñas locales.
3. En Supabase Dashboard, registrar la configuración actual de JWT del gateway de `process-order-purge`, su URL, el scheduler existente y los nombres de sus secretos. Confirmar que `M16_PURGE_CRON_SECRET` coincide con el secreto que envía el scheduler en `X-M16-Cron-Secret`. No imprimir valores ni cambiar JWT o credenciales durante esta publicación. El repositorio no contiene la configuración efectiva de ese gateway ni del Cron; si falta, detener la publicación y resolverla con el responsable del entorno.
4. Revisar todos los pedidos anulados elegibles y los trabajos pendientes: cada invocación de la función prepara y purga pedidos vencidos y procesa hasta 100 trabajos de Storage. No existe un disparador por pedido. No invocarla como smoke test si puede afectar pedidos ajenos sin autorización. El mantenimiento de huérfanos también puede tener alcance global.
5. Esta actualización no agrega migraciones. No ejecutar `db push`, `migration repair`, reset ni recrear cuentas para validarla.

### 2. Publicar primero `process-order-purge`

1. Desde el código candidato, desplegar únicamente la función `process-order-purge` en el proyecto confirmado de staging, conservando su configuración efectiva de JWT y sus secretos. Utilizar el flujo existente de despliegue del entorno; no agregar `--no-verify-jwt` como solución a un fallo de autenticación.
2. Confirmar en Dashboard que la versión publicada corresponde al candidato. La función nueva acepta los paths originales de trabajos antiguos y deriva sus posibles `.preview.webp`; una preview inexistente no debe impedir limpiar un original antiguo.
3. No activar ni recrear Cron si no formaba parte del entorno. Probar la invocación existente solo después de revisar y autorizar el alcance global del lote. Ante 401, detenerse y comprobar la autenticación existente; no debilitarla.

### 3. Publicar después la app

1. Integrar el candidato validado por el flujo habitual a `staging` y esperar el deployment Preview de `digraf-staging`, no el proyecto de producción.
2. Confirmar en los logs el commit, Next `16.4.5`, Node 22.x y ausencia de errores al cargar el binario nativo de Sharp. `pnpm why sharp` con el lockfile candidato debe mostrar `0.35.5` tanto directo como desde Next, sin `0.34.5` ni overrides.
3. Abrir la Preview protegida con una cuenta de staging autorizada. No asumir que un ingreso a `staging` ejecuta CI: el CI actual se dispara para PR a `develop` o `main`.

### 4. Matriz de imágenes: originales y previews

Preparar dos pedidos sintéticos: A con imágenes cargadas por la versión anterior, sin previews, y B cargado después de la publicación. Registrar IDs, paths, tamaño y SHA-256 de los archivos originales de prueba. Si no existe A, prepararlo antes de actualizar la app; no fabricar filas ni alterar registros ajenos.

| Comprobación | Pedido A: anterior | Pedido B: nuevo |
| --- | --- | --- |
| Tablero, vista rápida y detalle | Original como respaldo; leer no crea preview | Preview privada de hasta 480 px; leer no crea otra variante |
| Ampliación explícita | Original, bytes y hash sin cambios | Original, bytes y hash iguales al archivo cargado, no la preview |
| Reabrir vista rápida y mover | Reutiliza URL vigente; no hay refresco completo por movimiento exitoso | Mismo comportamiento; no se regenera preview |
| Reemplazar una imagen | La nueva carga obtiene preview; no convierte otras imágenes antiguas | Cambian original vigente y preview; la preview anterior se elimina |
| Acceso sin sesión o a otro pedido | Denegado por la ruta autorizada | Igual; no hacer público el bucket para resolver errores |

Anotar los paths anteriores antes de reemplazar. Una miniatura visible no demuestra integridad: descargar el original y comparar su SHA-256. El ahorro medido de previews no se atribuye a imágenes antiguas sin variante. Mantener al menos un original antiguo sin reemplazar para comprobar la purga de un path sin preview.

### 5. Purga y comprobación de objetos

1. Anular únicamente A y B. En Archivo (`/orders/archives`) usar `Borrar pedido` con una cuenta autorizada, confirmar IDs y aportar un motivo de prueba. Esta acción elimina datos operativos conforme a las reglas y encola la limpieza; no equivale todavía a borrar los objetos de Storage. La documentación histórica y los permisos actuales difieren respecto de Atención: usar una cuenta Admin o Super admin para esta validación, sin modificar roles.
2. Antes de ejecutar el worker, revisar nuevamente el alcance global. Usar la invocación/scheduler existente y autenticado de staging; no saltar retención, modificar timestamps ni ejecutar un lote sobre pedidos ajenos sin aprobación.
3. Con acceso administrativo autorizado al SQL Editor de **staging**, consultar los trabajos de prueba (reemplazar los dos UUID):

   ```sql
   select order_id, status, attempts, next_attempt_at, last_error, object_paths
   from public.order_purge_jobs
   where order_id in ('<UUID_A>'::uuid, '<UUID_B>'::uuid);
   ```

   Esperar `storage_completed` para ambos. Si hay `storage_retry` o `storage_failed`, revisar logs y `last_error`; no declarar la limpieza completa por la desaparición del pedido de la UI. El reintento tiene espera y lease; no crear trabajos duplicados ni forzar finalización.
4. Inventariar los objetos de ambos prefijos, incluidos originales reemplazados y previews:

   ```sql
   select name, metadata ->> 'size' as byte_size
   from storage.objects
   where bucket_id = 'order-designs'
     and split_part(name, '/', 2) in ('<UUID_A>', '<UUID_B>')
   order by name;
   ```

   Después de la purga y la limpieza de candidatos no referenciados, el resultado debe estar vacío. No borrar filas de `storage.objects` con SQL: usar siempre Storage para eliminar objetos.
5. Si aparecen objetos no incluidos en el trabajo (por ejemplo, una carga abandonada), el job completado por sí solo no demuestra ausencia de huérfanos. Esperar el período de gracia de más de 60 minutos y revisar el dry-run de `reconcileOrderDesignObjects()` desde el contexto de mantenimiento server-side autorizado. No existe un comando pnpm, endpoint público ni ejecución automática para esta operación. Revisar **todos** sus candidatos antes de autorizar `execute: true`; si no hay un ejecutor autorizado, registrar el bloqueo en vez de inventar uno. Repetir el inventario y confirmar que objetos de pedidos no probados permanecen intactos.

### 6. Transición y rollback

- Función nueva + app anterior: compatible; no exige que existan previews ni cambia el formato de metadata de imágenes.
- App nueva + función anterior: no publicar en ese orden, porque puede dejar previews sin limpiar.
- Para volver atrás, restaurar primero el deployment anterior de la app y mantener la función nueva mientras existan previews o trabajos pendientes. La app anterior puede leer los originales intactos; no hay migración de reversión.
- No revertir la función al limpiador anterior sin inventariar y resolver todas las variantes y trabajos que dependan del nuevo. Un rollback no recupera objetos ya purgados: por eso la prueba se limita a datos sintéticos autorizados.
