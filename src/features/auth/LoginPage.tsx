import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LoadingScreen } from '@/components/LoadingScreen'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'
import { loginSchema, type LoginForm } from './login-schema'

export function LoginPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  if (loading) {
    return <LoadingScreen />
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(values: LoginForm) {
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    })

    if (error) {
      setError('root', { message: 'Correo o contraseña incorrectos.' })
      return
    }

    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'
    navigate(from, { replace: true })
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <section className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs font-semibold tracking-[0.4em] text-brand-400">PISTEALE</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Acceso administrativo</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Ingresa con el usuario que el administrador creó para ti.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-neutral-300">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('email')}
            />
            {errors.email ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.email.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-neutral-300">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('password')}
            />
            {errors.password ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.password.message}</p>
            ) : null}
          </div>

          {errors.root?.message ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {errors.root.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-neutral-600">PISTEALE · Administración</p>
      </section>
    </main>
  )
}
