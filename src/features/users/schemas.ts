import { z } from "zod";

import { passwordSchema } from "@/lib/auth/password";

export const appRoles = ["super_admin", "admin", "attention", "employee"] as const;
export type AppRole = (typeof appRoles)[number];

const userIdSchema = z.string().uuid("El usuario seleccionado no es válido.");

export const createUserSchema = z.object({
  displayName: z.string().trim().min(2, "Ingresá un nombre de al menos 2 caracteres.").max(100, "El nombre no puede superar los 100 caracteres."),
  email: z.string().trim().email("Ingresá un email válido."),
  password: passwordSchema,
  role: z.enum(appRoles),
});

export const updateUserSchema = z.object({
  userId: userIdSchema,
  role: z.enum(appRoles),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
  intent: z.enum(["role", "status"]),
});

export const resetPasswordSchema = z.object({
  userId: userIdSchema,
  password: passwordSchema,
});

export function roleLabel(role: AppRole) {
  return {
    super_admin: "Super admin",
    admin: "Admin",
    attention: "Atención",
    employee: "Empleado",
  }[role];
}
