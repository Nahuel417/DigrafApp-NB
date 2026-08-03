const knownWorkflowStageMessages = [
  "No tenés permiso para administrar etapas.",
  "La solicitud de etapa no es válida.",
  "La solicitud de reordenamiento no es válida.",
  "La solicitud de retiro no es válida.",
  "La clave de idempotencia ya fue utilizada para otra operación de etapas.",
  "La etapa seleccionada no existe.",
  "La etapa seleccionada no está disponible.",
  "La etapa cambió en otra sesión. Actualizá e intentá nuevamente.",
  "Las etapas cambiaron en otra sesión. Actualizá e intentá nuevamente.",
  "No hay cambios para guardar.",
  "El reordenamiento debe incluir una sola vez todas las etapas activas.",
  "La etapa seleccionada no se puede retirar.",
  "No se puede retirar una etapa que tiene pedidos.",
  "Debe permanecer al menos una etapa ordinaria activa.",
];

export function workflowStageErrorMessage(message: string) {
  return knownWorkflowStageMessages.find((knownMessage) => message.includes(knownMessage))
    ?? "No se pudo actualizar las etapas. Intentá nuevamente.";
}
