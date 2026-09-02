# Contratos de imágenes de pedidos

M7/PR2 mantiene el bucket `order-designs` privado, una colección de 0 a 3 imágenes por pedido y no persiste URLs firmadas. Los cuatro roles internos pueden agregar, reemplazar, eliminar y administrar la imagen principal.

## Flujo

1. `startOrderDesignImageUploadAction` valida sesión, perfil activo, cambio obligatorio de contraseña, rol, pedido, intención explícita (`add` o `replace`), imagen objetivo, MIME, tamaño y versión. Devuelve un path candidato UUID limitado al pedido.
2. El cliente carga directamente ese path con el cliente Supabase autenticado.
3. `mutateOrderDesignImageAction` acepta únicamente `add`, `replace`, `delete`, `set_primary` o `clear_primary`. Para altas y reemplazos descarga el objeto, valida su tamaño real y firma JPEG, PNG o WebP, y recién después llama con `service_role` a `mutate_order_design_image`. Para eliminaciones y primaria usa la misma RPC sin tocar Storage. La RPC no es ejecutable por clientes autenticados y vuelve a validar actor, versión, metadata y antigüedad. Un replay válido vuelve a la RPC sin exigir que el objeto siga disponible.
4. `getOrderDesignImageReadUrl` o `getOrderDesignImageReadUrlAction` devuelve únicamente la primaria seleccionada como URL firmada de 5 minutos; `getOrderDesignImagesReadUrls` expone la colección acotada para el detalle. Se renueva bajo demanda y nunca se guarda en PostgreSQL.

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
