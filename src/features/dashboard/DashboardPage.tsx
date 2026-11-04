import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'

export function DashboardPage() {
  const { profile } = useAuth()

  const settingsQuery = useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('key,value')

      if (error) throw error

      return Object.fromEntries(data.map((setting) => [setting.key, setting.value]))
    },
  })

  const pingMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('ping')

      if (error) throw error

      return data
    },
  })

  const businessName =
    typeof settingsQuery.data?.business_name === 'string'
      ? settingsQuery.data.business_name
      : 'PISTEALE'
  const timezone =
    typeof settingsQuery.data?.timezone === 'string'
      ? settingsQuery.data.timezone
      : 'America/Cancun'

  if (!profile) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Perfil no encontrado</h1>
        <p className="mt-1 text-sm">
          Tu usuario existe en Auth, pero no tiene perfil. Contacta al administrador.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section>
        <p className="text-sm text-neutral-400">Bienvenido</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{profile.full_name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-brand-400/15 px-3 py-1 text-xs font-medium text-brand-300">
            {profile.role}
          </span>
          <Link
            to="/perfil"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Editar nombre
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Conexión con Supabase</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Verifica que el frontend puede leer datos y ejecutar RPC.
            </p>
          </div>
          <button
            type="button"
            onClick={() => pingMutation.mutate()}
            disabled={pingMutation.isPending}
            className="shrink-0 rounded-xl bg-brand-400 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:opacity-60"
          >
            {pingMutation.isPending ? 'Probando…' : 'Probar'}
          </button>
        </div>

        {pingMutation.isSuccess ? (
          <pre className="mt-3 overflow-x-auto rounded-xl bg-neutral-950 p-3 text-xs text-green-300">
            {JSON.stringify(pingMutation.data, null, 2)}
          </pre>
        ) : null}

        {pingMutation.isError ? (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {pingMutation.error.message}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Configuración</h2>
        {settingsQuery.isLoading ? (
          <p className="mt-2 text-sm text-neutral-500">Cargando…</p>
        ) : settingsQuery.isError ? (
          <p className="mt-2 text-sm text-red-300">{settingsQuery.error.message}</p>
        ) : (
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral-500">Negocio</dt>
              <dd className="text-neutral-200">{businessName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral-500">Zona horaria</dt>
              <dd className="text-neutral-200">{timezone}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Fase 0</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutral-400">
          <li>Autenticación y perfiles</li>
          <li>RLS de lectura y escritura por RPC</li>
          <li>Auditoría de cambios de perfil</li>
          <li>Configuración del negocio</li>
          <li>Respaldos y keep-alive</li>
        </ul>
      </section>
    </div>
  )
}
