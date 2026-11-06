import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { fetchAdminUsers } from './queries'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
}

export function UsersPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const usersQuery = useQuery({
    queryKey: ['admin_users'],
    queryFn: fetchAdminUsers,
    enabled: isAdmin,
  })

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

  if (usersQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando usuarios…</p>
  }

  if (usersQuery.isError) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {usersQuery.error.message}
      </p>
    )
  }

  const users = usersQuery.data ?? []

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Administración</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Usuarios</h1>
        </div>
        <Link
          to="/"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
        <p>
          <span className="font-medium text-neutral-200">Catálogo</span> permite crear y editar
          productos, grupos, insumos y recetas. Los consumibles automáticos siguen siendo solo para
          administradores.
        </p>
        <p className="mt-2">
          <span className="font-medium text-neutral-200">Inventario</span> permite compras, ajustes,
          merma y botellas. <span className="font-medium text-neutral-200">Finanzas</span> habilita
          la vista de información financiera.
        </p>
      </section>

      <div className="space-y-3">
        <p className="text-xs text-neutral-500">
          {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
        </p>

        {users.map((user) => (
          <Link
            key={user.id}
            to={`/usuarios/${user.id}`}
            className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{user.full_name || 'Sin nombre'}</p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {user.email ?? 'Sin correo'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${
                  user.active ? 'bg-green-500/15 text-green-300' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                {user.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-brand-400/15 px-2 py-1 text-brand-300">
                {roleLabels[user.role] ?? user.role}
              </span>
              {user.can_manage_catalog ? (
                <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-300">
                  Catálogo
                </span>
              ) : null}
              {user.can_adjust_inventory ? (
                <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-300">
                  Inventario
                </span>
              ) : null}
              {user.can_view_financials ? (
                <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-300">
                  Finanzas
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
