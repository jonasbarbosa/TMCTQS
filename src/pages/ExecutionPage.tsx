import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { databases, ID, Query, teamDocPermissions } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type { EnvironmentDoc, TestCaseDoc, TestRunDoc } from '../lib/model'
import { useAuth } from '../auth/auth'
import { useProject } from '../lib/project'
import { Search, Play, Square, Circle, Plus, Terminal, Beaker, FlaskConical, ListChecks } from 'lucide-react'

export function ExecutionPage() {
  const { user } = useAuth()
  const { project } = useProject()
  const [environments, setEnvironments] = useState<EnvironmentDoc[]>([])
  const [runs, setRuns] = useState<TestRunDoc[]>([])
  const [cases, setCases] = useState<TestCaseDoc[]>([])

  const [envName, setEnvName] = useState('')
  const [envDesc, setEnvDesc] = useState('')
  const [busyEnv, setBusyEnv] = useState(false)

  const [runTitle, setRunTitle] = useState('')
  const [busyRun, setBusyRun] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeRuns = useMemo(() => runs.filter((r) => r.status === 'draft' || r.status === 'in_progress').length, [runs])
  const completedRuns = useMemo(() => runs.filter((r) => r.status === 'completed').length, [runs])

  async function loadAll() {
    if (!project) return
    setError(null)
    try {
      const [envRes, runRes, caseRes] = await Promise.all([
        databases.listDocuments<EnvironmentDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.environments,
          queries: [Query.equal('project_id', project.$id), Query.orderAsc('name')],
        }),
        databases.listDocuments<TestRunDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testRuns,
          queries: [
            Query.equal('project_id', project.$id),
            Query.orderDesc('$createdAt'),
            Query.limit(25),
          ],
        }),
        databases.listDocuments<TestCaseDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testCases,
          queries: [
            Query.equal('project_id', project.$id),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ],
        }),
      ])
      setEnvironments(envRes.documents)
      setRuns(runRes.documents)
      setCases(caseRes.documents)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Execution'))
    }
  }

  useEffect(() => {
    loadAll()
  }, [project?.$id])

  async function createEnvironment() {
    if (!project) return
    const name = envName.trim()
    if (!name) return
    setBusyEnv(true)
    setError(null)
    try {
      await databases.createDocument<EnvironmentDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.environments,
        documentId: ID.unique(),
        data: {
          project_id: project.$id,
          name,
          description: envDesc.trim() || undefined,
        },
        permissions: teamDocPermissions(project.team_id, user?.$id),
      })
      setEnvName('')
      setEnvDesc('')
      await loadAll()
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar Environment'))
    } finally {
      setBusyEnv(false)
    }
  }

  async function createRun() {
    if (!project) return
    const title = runTitle.trim()
    if (!title) return
    setBusyRun(true)
    setError(null)
    try {
      await databases.createDocument<TestRunDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.testRuns,
        documentId: ID.unique(),
        data: {
          project_id: project.$id,
          environment_id: environments[0]?.$id ?? '',
          title,
          status: 'draft',
          progress_percentage: 0,
        },
        permissions: teamDocPermissions(project.team_id, user?.$id),
      })
      setRunTitle('')
      await loadAll()
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar Test Run'))
    } finally {
      setBusyRun(false)
    }
  }

  if (!project) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative">
          <div className="text-lg font-semibold text-surface-100">Execução</div>
          <div className="mt-2 text-sm text-surface-400">
            Selecione um <span className="font-semibold text-surface-200">Project</span> para criar Test Runs.
          </div>
          <Link
            to="/projects"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 transition-all"
          >
            <Circle className="h-4 w-4" />
            Abrir Projects
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              LIVE SESSION
            </span>
            <h1 className="text-2xl font-bold text-surface-100 tracking-tight">Execução em Tempo Real</h1>
          </div>
          <p className="text-sm text-surface-500 mt-1">
            Crie, gerencie e execute Test Runs — vincule Environments e Test Cases com fluxo em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
            <input
              className="w-56 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] pl-9 pr-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-cyan-400/50 transition-all"
              placeholder="Pesquisar testes..."
              type="text"
            />
          </div>
          <div className="flex items-center gap-2 border-l border-[var(--border-glass)] pl-4">
            <button className="rounded-lg border border-[var(--border-glass)] p-2 text-surface-500 hover:text-surface-200 hover:bg-[var(--bg-highlight)] transition-all" title="Play">
              <Play className="h-4 w-4" />
            </button>
            <button className="rounded-lg border border-[var(--border-glass)] p-2 text-surface-500 hover:text-surface-200 hover:bg-[var(--bg-highlight)] transition-all" title="Pause">
              <Square className="h-4 w-4" />
            </button>
            <button className="rounded-lg border border-[var(--border-glass)] p-2 text-surface-500 hover:text-surface-200 hover:bg-[var(--bg-highlight)] transition-all" title="Stop">
              <Terminal className="h-4 w-4" />
            </button>
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-600/20">
            <Play className="h-3.5 w-3.5" />
            Execute All
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 border-t-2 border-t-cyan-400">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-surface-500">Environments</span>
              <Beaker className="h-4 w-4 text-cyan-400/50" />
            </div>
            <div className="text-3xl font-bold text-surface-100">{environments.length}</div>
            <p className="text-xs text-surface-500 mt-1">Ambientes configurados</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 border-t-2 border-t-emerald-400">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-surface-500">Test Runs</span>
              <ListChecks className="h-4 w-4 text-emerald-400/50" />
            </div>
            <div className="flex items-end gap-3">
              <div>
                <span className="text-3xl font-bold text-surface-100">{runs.length}</span>
                <span className="text-xs text-surface-500 ml-1">total</span>
              </div>
              <div className="mb-1">
                <span className="text-lg font-bold text-emerald-400">{completedRuns}</span>
                <span className="text-[10px] text-emerald-400/70 ml-1">concluídos</span>
              </div>
            </div>
            <p className="text-xs text-surface-500 mt-1">{activeRuns} ativos agora</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 border-t-2 border-t-amber-400">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-surface-500">Test Cases</span>
              <FlaskConical className="h-4 w-4 text-amber-400/50" />
            </div>
            <div className="text-3xl font-bold text-surface-100">{cases.length}</div>
            <p className="text-xs text-surface-500 mt-1">Casos disponíveis para execução</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: Environments */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl lg:col-span-1">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-surface-100">Environments</h2>
              <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-400">{environments.length}</span>
            </div>

            <div className="space-y-2">
              {environments.map((e) => (
                <div
                  key={e.$id}
                  className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] px-3 py-2.5 group hover:border-[var(--border-glass)] transition-all"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                    <span className="text-sm font-medium text-surface-200">{e.name}</span>
                  </div>
                  {e.description ? (
                    <p className="text-xs text-surface-500 mt-1 ml-3.5">{e.description}</p>
                  ) : null}
                </div>
              ))}
              {!environments.length ? (
                <div className="text-xs text-surface-500 py-4 text-center">Nenhum Environment ainda.</div>
              ) : null}
            </div>

            {/* Create Environment */}
            <div className="mt-5 pt-5 border-t border-[var(--border-glass)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">Novo Environment</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">Nome</label>
                  <input
                    className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-cyan-600/50 transition-colors"
                    placeholder="Staging"
                    value={envName}
                    onChange={(e) => setEnvName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">Descrição</label>
                  <textarea
                    className="h-16 w-full resize-none rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-cyan-600/50 transition-colors"
                    value={envDesc}
                    onChange={(e) => setEnvDesc(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-cyan-500 disabled:opacity-60 transition-all"
                  disabled={busyEnv || !envName.trim()}
                  onClick={() => createEnvironment()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {busyEnv ? 'Criando...' : 'Criar Environment'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Quick Run + Recent Runs */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl lg:col-span-2">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative p-5">
            {/* Quick Run */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-surface-100">Quick Run</h2>
              <Link
                to="/runs"
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300"
              >
                Ver todas as Execuções →
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">Título</label>
                <input
                  className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-cyan-600/50 transition-colors"
                  placeholder="Smoke Test rápido"
                  value={runTitle}
                  onChange={(e) => setRunTitle(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-cyan-500 disabled:opacity-60 transition-all shadow-lg shadow-cyan-600/10"
                  disabled={busyRun || !runTitle.trim() || !environments.length}
                  onClick={() => createRun()}
                >
                  <Play className="h-3.5 w-3.5" />
                  {busyRun ? 'Criando...' : 'Criar Rascunho'}
                </button>
              </div>
            </div>
            <p className="mb-5 text-[10px] text-surface-500">
              Para configurar suite, agendamento e casos, use a página <Link to="/runs" className="text-cyan-400 hover:text-cyan-300 underline">Execuções</Link>.
            </p>

            {/* Recent Runs Table */}
            <div className="mt-2 pt-5 border-t border-[var(--border-glass)]">
              <h2 className="text-sm font-semibold text-surface-100 mb-4">Test Runs Recentes</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--border-glass)]">
                      <th className="pb-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Título</th>
                      <th className="pb-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Status</th>
                      <th className="pb-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Progresso</th>
                      <th className="pb-3 text-[10px] font-medium uppercase tracking-widest text-surface-500 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-glass)]">
                    {runs.slice(0, 10).map((r) => (
                      <tr key={r.$id} className="group hover:bg-[var(--bg-highlight-subtle)] transition-colors">
                        <td className="py-3 pr-4">
                          <span className="text-sm font-medium text-surface-200">{r.title}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                            r.status === 'completed' ? 'text-emerald-400' :
                            r.status === 'draft' ? 'text-amber-400' :
                            r.status === 'in_progress' ? 'text-cyan-400' :
                            'text-surface-500'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              r.status === 'completed' ? 'bg-emerald-400' :
                              r.status === 'draft' ? 'bg-amber-400' :
                              r.status === 'in_progress' ? 'bg-cyan-400 animate-pulse' :
                              'bg-surface-500'
                            }`} />
                            {r.status === 'completed' ? 'Concluído' :
                             r.status === 'draft' ? 'Rascunho' :
                             r.status === 'in_progress' ? 'Executando' :
                             r.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-[var(--bg-glass-high)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-cyan-400 transition-all"
                                style={{ width: `${r.progress_percentage}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-surface-500 font-mono">{r.progress_percentage}%</span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            to={`/execution/${r.$id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-glass)] px-3 py-1.5 text-[11px] font-medium text-surface-400 hover:text-surface-200 hover:bg-[var(--bg-highlight)] transition-all"
                          >
                            <Play className="h-3 w-3" />
                            Abrir
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {!runs.length ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-xs text-surface-500">
                          Nenhum Test Run ainda. Crie o primeiro em <Link to="/runs" className="text-cyan-400 underline hover:text-cyan-300">Execuções</Link>.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}