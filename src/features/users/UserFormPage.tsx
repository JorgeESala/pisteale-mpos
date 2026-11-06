import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { fetchAdminUsers, updateUserAccess } from './queries'
import { userAccessFormSchema, type UserAccessForm } from './user-schemas'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
}

export function UserFormPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = profile?.role === 'admin'
  const isSelf = profile?.id === id

  const usersQuery = useQuery({
    queryKey: ['admin_users'],
    queryFn: fetchAdminUsers,
    enabled: isAdmin,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserAccessForm>({
    resolver: zodResolver(userAccessFormSchema),
    defaultValues: {
      role: 'operador',
      active: true,
      canViewFinancials: false,
      canAdjustInventory: false,
      canManageCatalog: false,
    },
  })

  const user = usersQuery.data?.find((candidate) => candidate.id === id)
  const userId = user?.id
  const userRole = user?.role
  const userActive = user?.active
  const userCanViewFinancials = user?.can_view_financials
  const userCanAdjustInventory = user?.can_adjust_inventory
  const userCanManageCatalog = user?.can_manage_catalog

  useEffect(() => {
    if (!userId || !userRole) return

    reset({
      role: userRole,
      active: userActive ?? true,
      canViewFinancials: userCanViewFinancials ?? false,
      canAdjustInventory: userCanAdjustInventory ?? false,
      canManageCatalog: userCanManageCatalog ?? false,
    })
  }, [
    userId,
    userRole,
    userActive,
    userCanViewFinancials,
    userCanAdjustInventory,
    userCanManageCatalog,
    reset,
  ])

  const saveMutation = useMutation({
    mutationFn: (values: UserAccessForm) =>
      updateUserAccess({
        userId: id!,
        role: values.role,
        active: values.active,
        canViewFinancials: values.canViewFinancials,
        canAdjustInventory: values.canAdjustInventory,
        canManageCatalog: values.canManageCatalog,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin_users'] })
    },
  })

  async function onSubmit(values: UserAccessForm) {
    await saveMutation.mutateAsync(values)
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores pueden gestionar usuarios.</p>
        <Link to="/" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver al inicio
        </Link>
      </section>
    )
  }

  if (!id) {
    return <p className="text-sm text-red-300">Usuario no encontrado.</p>
  }

  if (usersQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando usuario…</p>
  }

  if (usersQuery.isError) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {usersQuery.error.message}
      </p>
    )
  }

  if (!user) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">No se encontró el usuario.</p>
        <Link to="/usuarios" className="text-sm text-brand-300 underline">
          Volver a usuarios
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Usuarios</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {user.full_name || 'Sin nombre'}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{user.email ?? 'Sin correo'}</p>
        </div>
        <Link
          to="/usuarios"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <form
        className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div>
          <label htmlFor="role" className="mb-1.5 block text-sm text-neutral-300">
            Rol
          </label>
          <select
            id="role"
            disabled={isSelf}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400 disabled:opacity-60"
            {...register('role')}
          >
            <option value="admin">{roleLabels.admin}</option>
            <option value="operador">{roleLabels.operador}</option>
            <option value="consulta">{roleLabels.consulta}</option>
          </select>
          {isSelf ? (
            <p className="mt-1 text-[11px] text-neutral-500">
              No puedes quitarte tu propio rol de administrador.
            </p>
          ) : null}
          {errors.role ? (
            <p className="mt-1.5 text-sm text-red-400">{errors.role.message}</p>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            className="size-4 rounded border-neutral-600 bg-neutral-950"
            {...register('active')}
          />
          Usuario activo
        </label>

        <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-sm font-medium text-neutral-200">Permisos</p>

          <label className="flex items-start gap-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-neutral-600 bg-neutral-950"
              {...register('canManageCatalog')}
            />
            <span>
              <span className="block font-medium text-neutral-200">Catálogo</span>
              <span className="block text-neutral-500">
                Productos, precios, grupos, insumos y recetas.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-neutral-600 bg-neutral-950"
              {...register('canAdjustInventory')}
            />
            <span>
              <span className="block font-medium text-neutral-200">Inventario</span>
              <span className="block text-neutral-500">Compras, ajustes, merma y botellas.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-neutral-600 bg-neutral-950"
              {...register('canViewFinancials')}
            />
            <span>
              <span className="block font-medium text-neutral-200">Finanzas</span>
              <span className="block text-neutral-500">Información financiera y márgenes.</span>
            </span>
          </label>
        </div>

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}

        {saveMutation.isSuccess ? (
          <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            Permisos actualizados.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar permisos'}
        </button>
      </form>
    </div>
  )
}
