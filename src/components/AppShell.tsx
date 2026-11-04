import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'

const navItems = [
  { label: 'Inicio', href: '/', enabled: true },
  { label: 'Pedidos', href: '/pedidos', enabled: false },
  { label: 'Inventario', href: '/inventario', enabled: false },
  { label: 'Eventos', href: '/eventos', enabled: false },
  { label: 'Más', href: '/mas', enabled: false },
]

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, profile, signOut } = useAuth()

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3 md:max-w-2xl">
          <Link to="/perfil" className="min-w-0 transition hover:opacity-80">
            <p className="text-[11px] font-semibold tracking-[0.35em] text-brand-400">PISTEALE</p>
            <p className="truncate text-sm text-neutral-400">
              {profile
                ? `${profile.full_name} · ${roleLabels[profile.role] ?? profile.role}`
                : session?.user.email}
            </p>
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-5 md:max-w-2xl">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch gap-1 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 md:max-w-2xl">
          {navItems.map((item) =>
            item.enabled ? (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  `flex min-h-12 flex-1 items-center justify-center rounded-xl px-2 text-xs font-medium transition ${
                    isActive ? 'bg-brand-400/10 text-brand-300' : 'text-neutral-500'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ) : (
              <span
                key={item.href}
                aria-disabled="true"
                className="flex min-h-12 flex-1 items-center justify-center rounded-xl px-2 text-xs text-neutral-700"
              >
                {item.label}
              </span>
            ),
          )}
        </div>
      </nav>
    </div>
  )
}
