import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth'
import { useProject } from '../lib/project'
import {
  Activity,
  BarChart3,
  Bell,
  Bug,
  FlaskConical,
  Grid3X3,
  History,
  Moon,
  Plus,
  Search,
  Sun,
  Terminal,
  TestTube,
  TestTubes,
} from 'lucide-react'
import { useTheme } from '../lib/useTheme'

const navItems = [
  { to: '/dashboards', label: 'Dashboard', icon: BarChart3 },
  { to: '/projects', label: 'Projetos', icon: FlaskConical },
  { to: '/tests', label: 'Test Suites', icon: TestTube },
  { to: '/test-cases', label: 'Test Cases', icon: TestTubes },
  { to: '/runs', label: 'Execuções', icon: History },
  { to: '/reports', label: 'Reports', icon: Activity },
  { to: '/execution', label: 'Ambientes', icon: Terminal },
  { to: '/issues', label: 'Issues', icon: Bug },
]

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof BarChart3 }) {
  return (
    <NavLink
      to={to}
      end={to === '/dashboards'}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-brand-600/10 text-brand-400 shadow-sm'
            : 'text-surface-400 hover:bg-surface-800/50 hover:text-surface-200',
        ].join(' ')
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  )
}

export function Layout() {
  const { logout, user } = useAuth()
  const { project, setProject } = useProject()
  const { theme, toggle: toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="flex h-full bg-[var(--bg-app)] text-[var(--text-glass)]">
      {/* Background decoration */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-brand-500/[0.03] blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-0 left-1/4 w-[400px] h-[400px] bg-cyan-500/[0.02] blur-[100px] rounded-full pointer-events-none -z-10" />

      {/* Sidebar backdrop (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-lg shadow-brand-600/20">
            T
          </div>
          <div>
            <div className="text-sm font-semibold text-surface-100">CTQS</div>
            <div className="text-[10px] font-medium tracking-wider text-surface-500 uppercase">
              Quality Engine
            </div>
          </div>
        </div>

        {/* New Test Run CTA */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => navigate('/runs')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-500 hover:shadow-lg hover:shadow-brand-600/20"
          >
            <Plus className="h-4 w-4" />
            New Test Run
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* User info */}
        <div className="border-t border-[var(--border-glass)] p-4">
          {project ? (
            <div className="mb-3 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] p-3">
              <div className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
                Projeto Ativo
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-brand-600/20 text-[10px] font-bold text-brand-400">
                    {project.code?.slice(0, 2)}
                  </div>
                  <span className="text-sm font-medium text-surface-200">{project.code}</span>
                </div>
                <button
                  type="button"
                  className="rounded-md bg-[var(--bg-glass-high)] px-2 py-1 text-[10px] text-surface-400 hover:bg-[var(--bg-glass-highest)] hover:text-surface-200"
                  onClick={() => setProject(null)}
                  title="Trocar Project"
                >
                  Trocar
                </button>
              </div>
            </div>
          ) : (
            <Link
              to="/projects"
              className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-glass)] p-3 text-xs text-surface-400 hover:border-[var(--border-hover)] hover:text-surface-300"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Selecionar Projeto</span>
            </Link>
          )}

          <div className="flex items-center gap-3 rounded-lg p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-800 text-xs font-semibold text-surface-300">
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium text-surface-200">
                {user?.name || 'Usuário'}
              </div>
              <div className="truncate text-[10px] text-surface-500">
                {user?.email || ''}
              </div>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-surface-500 hover:bg-[var(--bg-glass-high)] hover:text-surface-300"
              onClick={() => logout()}
              title="Sair"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Global top navigation bar */}
        <header className="sticky top-0 z-30 border-b border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-4 lg:px-6">
            {/* Left: mobile menu + brand */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="rounded-md p-2 text-surface-400 hover:bg-[var(--bg-glass-high)] lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="hidden lg:flex items-center bg-[var(--bg-highlight)] rounded-lg border border-[var(--border-glass)] px-3 py-1.5">
                <Search className="h-4 w-4 text-surface-500 mr-2" />
                <input
                  className="bg-transparent border-none focus:ring-0 text-sm text-surface-100 placeholder:text-surface-500 w-56 outline-none"
                  placeholder="Search test suites..."
                  readOnly
                />
              </div>
            </div>

            {/* Right: project badge + icons + profile */}
            <div className="flex items-center gap-4">
              {project ? (
                <div className="hidden lg:flex items-center gap-2 rounded-full border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] px-3 py-1">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-medium text-surface-300">{project.code}</span>
                </div>
              ) : null}

              <button
                type="button"
                className="hidden lg:flex rounded-md p-2 text-surface-500 hover:text-[var(--text-glass)] hover:bg-[var(--bg-highlight)] transition-colors"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                className="hidden lg:flex rounded-md p-2 text-surface-500 hover:text-[var(--text-glass)] hover:bg-[var(--bg-highlight)] transition-colors"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="hidden lg:flex rounded-md p-2 text-surface-500 hover:text-[var(--text-glass)] hover:bg-[var(--bg-highlight)] transition-colors"
                title="Apps"
              >
                <Grid3X3 className="h-4 w-4" />
              </button>

              {user ? (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] px-3 py-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-800 text-[10px] font-semibold text-surface-300">
                    {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm text-surface-300 hidden sm:inline">{user.name || user.email}</span>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 lg:p-6">
            <Outlet />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-[var(--border-glass)] bg-[var(--bg-lowest)] py-3 px-4 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-surface-500">CTQS Enterprise</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                System Status: Operational
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-surface-600">v2.4.1-stable</span>
              <span className="text-surface-600 hover:text-surface-400 cursor-pointer transition-colors">Privacy</span>
              <span className="text-surface-600 hover:text-surface-400 cursor-pointer transition-colors">Terms</span>
              <span className="text-surface-600 hover:text-surface-400 cursor-pointer transition-colors">Changelog</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

