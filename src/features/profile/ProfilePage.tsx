import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { profileSchema, type ProfileForm } from './profile-schema'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
}

export function ProfilePage() {
  const { session, profile, updateProfileName } = useAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile?.full_name ?? '',
    },
  })

  const updateMutation = useMutation({
    mutationFn: (values: ProfileForm) => updateProfileName(values.fullName),
  })

  async function onSubmit(values: ProfileForm) {
    await updateMutation.mutateAsync(values)
  }

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
        <p className="text-sm text-neutral-400">Cuenta</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mi perfil</h1>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-neutral-500">Correo</dt>
            <dd className="truncate text-neutral-200">{session?.user.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-neutral-500">Rol</dt>
            <dd className="text-neutral-200">{roleLabels[profile.role] ?? profile.role}</dd>
          </div>
        </dl>
      </section>

      <form
        className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div>
          <label htmlFor="fullName" className="mb-1.5 block text-sm text-neutral-300">
            Nombre
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('fullName')}
          />
          {errors.fullName ? (
            <p className="mt-1.5 text-sm text-red-400">{errors.fullName.message}</p>
          ) : null}
        </div>

        {updateMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {updateMutation.error.message}
          </p>
        ) : null}

        {updateMutation.isSuccess ? (
          <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            Nombre actualizado.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar nombre'}
        </button>
      </form>

      <Link
        to="/"
        className="inline-flex rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
