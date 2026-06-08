import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ID, account, clearTeamCache, fetchUserTeams, type Models } from '../lib/appwrite'

type AuthContextValue = {
  user: Models.User<Models.Preferences> | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const u = await account.get()
      setUser(u)
      fetchUserTeams()
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        await account.createEmailPasswordSession(email, password)
        await refresh()
      },
      async register(name, email, password) {
        await account.create(ID.unique(), email, password, name)
        await account.createEmailPasswordSession(email, password)
        await refresh()
        fetchUserTeams()
      },
      async logout() {
        await account.deleteSession('current')
        clearTeamCache()
        await refresh()
      },
      refresh,
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider ausente')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="p-6 text-sm text-surface-400">Carregando...</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  return children
}
