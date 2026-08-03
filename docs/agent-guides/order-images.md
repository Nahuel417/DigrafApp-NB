# Contratos de imágenes de pedidos

M7 Fase 2 mantiene el bucket `order-designs` privado y no persiste URLs firmadas.

## Flujo

1. `startOrderDesignImageUploadAction` valida sesión, perfil activo, cambio obligatorio de contraseña, rol, pedido, MIME, tamaño y versión. Devuelve un path candidato UUID limitado al pedido.
2. El cliente carga directamente ese path con el cliente Supabase autenticado.
3. `finalizeOrderDesignImageAction` descarga el objeto, valida su tamaño real y firma JPEG, PNG o WebP, y recién después llama a `finalize_order_design_image`. Un replay válido vuelve a la RPC sin exigir que el objeto siga disponible.
4. `getOrderDesignImageReadUrl` o `getOrderDesignImageReadUrlAction` devuelve una URL firmada de 5 minutos. Se renueva bajo demanda y nunca se guarda en PostgreSQL.

## Reconciliación

`reconcileOrderDesignObjects()` es server-only y usa el cliente administrativo únicamente para mantenimiento técnico. El modo predeterminado es dry-run:

```ts
const plan = await reconcileOrderDesignObjects();
```

Solo una ejecución explícita con `execute: true` elimina objetos válidos, no referenciados y con más de 60 minutos. Nunca elimina paths vigentes, objects sin timestamp confiable ni paths con formato desconocido.

```ts
const result = await reconcileOrderDesignObjects({ execute: true });
```

La ejecución efectiva requiere un contexto server-side autorizado para mantenimiento; no se expone en la UI ni se ejecuta automáticamente desde una request operativa.
