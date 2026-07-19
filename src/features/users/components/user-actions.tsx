"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutationToast } from "@/hooks/use-mutation-toast";

import { resetPasswordAction, updateUserAction, type UserActionState } from "../actions";
import { appRoles, roleLabel, type AppRole } from "../schemas";

const initialState: UserActionState = {};

type UserActionsProps = {
  currentRole: AppRole;
  user: { id: string; displayName: string; role: AppRole; isActive: boolean };
};

function CompactFeedback({ state }: { state: UserActionState }) {
  if (!state.message) return null;

  return (
    <Alert className="px-3 py-2" variant={state.status === "success" ? "success" : "destructive"}>
      <AlertDescription className="text-xs">{state.message}</AlertDescription>
    </Alert>
  );
}

export function UserActions({ currentRole, user }: UserActionsProps) {
  const [roleState, roleAction] = useActionState(updateUserAction, initialState);
  const [statusState, statusAction] = useActionState(updateUserAction, initialState);
  const [resetState, resetAction] = useActionState(resetPasswordAction, initialState);
  const [selectedRole, setSelectedRole] = useState<AppRole>(user.role);
  const canManage = currentRole === "super_admin" || (currentRole === "admin" && (user.role === "attention" || user.role === "employee"));
  const allowedRoles = currentRole === "admin" ? appRoles.filter((role) => role === "attention" || role === "employee") : appRoles;
  const canReset = currentRole === "super_admin";
  const roleId = useId();
  const passwordId = useId();
  const roleFormId = useId();
  const statusFormId = useId();
  const resetFormId = useId();
  const resetFormRef = useRef<HTMLFormElement>(null);
  const roleSelectRef = useRef<HTMLButtonElement>(null);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  useMutationToast(roleState);
  useMutationToast(statusState);
  useMutationToast(resetState);

  useEffect(() => {
    if (!resetState.toastId) return;
    if (resetState.status === "success") resetFormRef.current?.reset();
    window.requestAnimationFrame(() => resetTriggerRef.current?.focus());
  }, [resetState.status, resetState.toastId]);

  useEffect(() => {
    if (!roleState.toastId) return;
    window.requestAnimationFrame(() => roleSelectRef.current?.focus());
  }, [roleState.toastId]);

  useEffect(() => {
    if (!statusState.toastId) return;
    window.requestAnimationFrame(() => statusTriggerRef.current?.focus());
  }, [statusState.toastId]);

  if (!canManage) {
    return <Badge variant="outline">Solo lectura</Badge>;
  }

  const roleErrors = roleState.fieldErrors?.role?.map((message) => ({ message }));
  const passwordErrors = resetState.fieldErrors?.password?.map((message) => ({ message }));
  const nextStatusLabel = user.isActive ? "Desactivar" : "Activar";

  return (
    <div className="flex min-w-0 w-full flex-col gap-3 md:min-w-[16rem]">
      <form action={roleAction} className="flex flex-wrap items-end gap-2" id={roleFormId}>
        <input name="userId" type="hidden" value={user.id} />
        <input name="isActive" type="hidden" value={String(user.isActive)} />
        <input name="intent" type="hidden" value="role" />
        <Field className="min-w-36 flex-1 gap-1" data-invalid={Boolean(roleErrors?.length)}>
          <FieldLabel className="text-xs" htmlFor={roleId}>
            Rol <span className="sr-only">de {user.displayName}</span>
          </FieldLabel>
          <Select name="role" onValueChange={(value) => setSelectedRole(value as AppRole)} value={selectedRole}>
            <SelectTrigger
              aria-describedby={roleErrors?.length ? `${roleId}-error` : undefined}
              aria-invalid={Boolean(roleErrors?.length)}
              className="h-11 md:h-9"
              id={roleId}
              ref={roleSelectRef}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {allowedRoles.map((role) => (
                  <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError errors={roleErrors} id={`${roleId}-error`} />
        </Field>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <SubmitButton
              aria-label={`Guardar rol de ${user.displayName}`}
              className="h-11 md:h-9"
              disabled={selectedRole === user.role}
              pendingLabel="Guardando"
              size="sm"
              type="button"
              variant="outline"
            >
              Guardar
            </SubmitButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar cambio de rol</AlertDialogTitle>
              <AlertDialogDescription>
                Cambiarás el rol de {user.displayName} de {roleLabel(user.role)} a {roleLabel(selectedRole)}. Esto modifica sus permisos de acceso y puede revertirse con otro cambio de rol permitido.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction form={roleFormId} type="submit">Confirmar cambio</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
      <CompactFeedback state={roleState} />

      <form action={statusAction} className="flex gap-2" id={statusFormId}>
        <input name="userId" type="hidden" value={user.id} />
        <input name="role" type="hidden" value={user.role} />
        <input name="isActive" type="hidden" value={String(!user.isActive)} />
        <input name="intent" type="hidden" value="status" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <SubmitButton
              aria-label={`${nextStatusLabel} a ${user.displayName}`}
              className="h-11 md:h-9"
              pendingLabel={user.isActive ? "Desactivando" : "Activando"}
              ref={statusTriggerRef}
              size="sm"
              type="button"
              variant={user.isActive ? "destructive" : "outline"}
            >
              {nextStatusLabel}
            </SubmitButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{nextStatusLabel} usuario</AlertDialogTitle>
              <AlertDialogDescription>
                {user.isActive
                  ? `Se bloqueará el acceso de ${user.displayName} a los datos protegidos de Digraf, incluso si conserva una sesión previa. La cuenta y su auditoría se conservarán y podrás reactivarla.`
                  : `Se habilitará el acceso de ${user.displayName} con rol ${roleLabel(user.role)}. Esta acción puede revertirse desactivando nuevamente la cuenta.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                form={statusFormId}
                type="submit"
                variant={user.isActive ? "destructive" : "default"}
              >
                Confirmar {user.isActive ? "desactivación" : "activación"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
      <CompactFeedback state={statusState} />

      {canReset ? (
        <form action={resetAction} className="flex flex-wrap items-end gap-2" id={resetFormId} ref={resetFormRef}>
          <input name="userId" type="hidden" value={user.id} />
          <Field className="min-w-36 flex-1 gap-1" data-invalid={Boolean(passwordErrors?.length)}>
            <FieldLabel className="text-xs" htmlFor={passwordId}>
              Nueva contraseña temporal <span className="sr-only">para {user.displayName}</span>
            </FieldLabel>
            <Input
              aria-describedby={passwordErrors?.length ? `${passwordId}-error` : undefined}
              aria-invalid={Boolean(passwordErrors?.length)}
              autoComplete="new-password"
              className="h-11 md:h-9"
              id={passwordId}
              minLength={8}
              name="password"
              required
              type="password"
            />
            <FieldError errors={passwordErrors} id={`${passwordId}-error`} />
          </Field>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <SubmitButton
                aria-label={`Restablecer contraseña de ${user.displayName}`}
                className="h-11 md:h-9"
                onClick={(event) => {
                  if (!resetFormRef.current?.reportValidity()) event.preventDefault();
                }}
                pendingLabel="Restableciendo"
                ref={resetTriggerRef}
                size="sm"
                type="button"
                variant="outline"
              >
                Restablecer
              </SubmitButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar restablecimiento</AlertDialogTitle>
                <AlertDialogDescription>
                  Se reemplazará la contraseña actual de {user.displayName} y se exigirá cambiar la nueva contraseña temporal en el próximo ingreso. La contraseña anterior no puede recuperarse, aunque el proceso puede repetirse con otra temporal.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction form={resetFormId} type="submit" variant="destructive">
                  Confirmar restablecimiento
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </form>
      ) : null}
      <CompactFeedback state={resetState} />
    </div>
  );
}
