import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth'

export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } } | null)?.from
    ?.pathname

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const title = useMemo(
    () => (mode === 'login' ? 'Entrar' : 'Criar conta'),
    [mode],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await login(email, password)
      else await register(name, email, password)
      navigate(from ?? '/dashboards', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao autenticar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--bg-input)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white shadow-lg shadow-brand-600/20">
            T
          </div>
          <div className="mt-4 text-lg font-bold text-surface-100">TMCTQS</div>
          <div className="mt-1 text-xs text-surface-500">
            Gestão de Testes Manual
          </div>
        </div>

        <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-6 shadow-xl backdrop-blur-xl">
          <div className="text-base font-semibold text-surface-100">{title}</div>
          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            {mode === 'register' ? (
              <div>
                <label className="text-xs font-medium text-surface-400">Nome</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-surface-800 bg-[var(--bg-input)] px-3 py-2.5 text-sm text-surface-100 outline-none transition-colors placeholder:text-surface-600 focus:border-brand-600 focus:ring-1 focus:ring-brand-600/30"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            ) : null}

            <div>
              <label className="text-xs font-medium text-surface-400">Email</label>
              <input
                type="email"
                className="mt-1.5 w-full rounded-lg border border-surface-800 bg-[var(--bg-input)] px-3 py-2.5 text-sm text-surface-100 outline-none transition-colors placeholder:text-surface-600 focus:border-brand-600 focus:ring-1 focus:ring-brand-600/30"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-surface-400">Senha</label>
              <input
                type="password"
                className="mt-1.5 w-full rounded-lg border border-surface-800 bg-[var(--bg-input)] px-3 py-2.5 text-sm text-surface-100 outline-none transition-colors placeholder:text-surface-600 focus:border-brand-600 focus:ring-1 focus:ring-brand-600/30"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-xs text-red-300">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-500 hover:shadow-md hover:shadow-brand-600/20 disabled:opacity-60"
              disabled={busy}
            >
              {busy ? 'Processando...' : title}
            </button>

            <button
              type="button"
              className="w-full rounded-lg border border-surface-800 bg-surface-900 px-3 py-2.5 text-sm text-surface-300 transition-colors hover:bg-surface-800 hover:text-surface-200"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              disabled={busy}
            >
              {mode === 'login'
                ? 'Criar conta'
                : 'Já tenho conta (Entrar)'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
