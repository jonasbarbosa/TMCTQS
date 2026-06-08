import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { databases, ID, Query, teamDocPermissions } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type {
  EnvironmentDoc,
  RunStatus,
  SuiteDoc,
  TestCaseDoc,
  TestRunDoc,
} from '../lib/model'
import { useAuth } from '../auth/auth'
import { useProject } from '../lib/project'
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Filter,
  History,
  Play,
  Plus,
  RotateCcw,
  Search,
  Terminal,
  User,
  X,
} from 'lucide-react'

type RunFilters = {
  status: RunStatus | 'all'
  suiteId: string | 'all'
  environmentId: string | 'all'
}

const STATUS_LABELS: Record<RunStatus, { label: string; color: string; dot: string }> = {
  draft: { label: 'Rascunho', color: 'text-amber-400', dot: 'bg-amber-400' },
  in_progress: { label: 'Executando', color: 'text-cyan-400', dot: 'bg-cyan-400 animate-pulse' },
  completed: { label: 'Concluído', color: 'text-emerald-400', dot: 'bg-emerald-400' },
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function relativeFromNow(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = d.getTime() - Date.now()
  const absMin = Math.abs(Math.round(diff / 60000))
  if (absMin < 1) return 'agora'
  if (absMin < 60) return diff > 0 ? `em ${absMin}min` : `há ${absMin}min`
  const absHr = Math.round(absMin / 60)
  if (absHr < 24) return diff > 0 ? `em ${absHr}h` : `há ${absHr}h`
  const absDay = Math.round(absHr / 24)
  return diff > 0 ? `em ${absDay}d` : `há ${absDay}d`
}

export function RunsListPage() {
  const { user } = useAuth()
  const { project, validating } = useProject()

  const [runs, setRuns] = useState<TestRunDoc[]>([])
  const [suites, setSuites] = useState<SuiteDoc[]>([])
  const [environments, setEnvironments] = useState<EnvironmentDoc[]>([])
  const [cases, setCases] = useState<TestCaseDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<RunFilters>({ status: 'all', suiteId: 'all', environmentId: 'all' })
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const [showCreate, setShowCreate] = useState(false)
  const [createSuiteId, setCreateSuiteId] = useState<string>('')
  const [createEnvId, setCreateEnvId] = useState<string>('')
  const [createTitle, setCreateTitle] = useState('')
  const [createScheduledAt, setCreateScheduledAt] = useState('')
  const [createSelectedCases, setCreateSelectedCases] = useState<Record<string, boolean>>({})
  const [busyCreate, setBusyCreate] = useState(false)

  async function loadAll() {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const [runRes, suiteRes, envRes] = await Promise.all([
        databases.listDocuments<TestRunDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testRuns,
          queries: [
            Query.equal('project_id', project.$id),
            Query.orderDesc('$createdAt'),
            Query.limit(200),
          ],
        }),
        databases.listDocuments<SuiteDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.suites,
          queries: [Query.equal('project_id', project.$id), Query.limit(200)],
        }),
        databases.listDocuments<EnvironmentDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.environments,
          queries: [Query.equal('project_id', project.$id), Query.limit(100)],
        }),
      ])
      setRuns(runRes.documents)
      setSuites(suiteRes.documents)
      setEnvironments(envRes.documents)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Test Runs'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [project?.$id])

  useEffect(() => {
    if (!createSuiteId) {
      setCases([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await databases.listDocuments<TestCaseDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testCases,
          queries: [
            Query.equal('project_id', project!.$id),
            Query.equal('suite_id', createSuiteId),
            Query.orderDesc('$createdAt'),
            Query.limit(200),
          ],
        })
        if (!cancelled) setCases(res.documents)
      } catch (e) {
        if (!cancelled) setError(appwriteErrorMessage(e, 'Falha ao carregar Test Cases'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [createSuiteId, project?.$id])

  const suitesById = useMemo(() => {
    const map = new Map<string, SuiteDoc>()
    suites.forEach((s) => map.set(s.$id, s))
    return map
  }, [suites])

  const envsById = useMemo(() => {
    const map = new Map<string, EnvironmentDoc>()
    environments.forEach((e) => map.set(e.$id, e))
    return map
  }, [environments])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return runs.filter((r) => {
      if (filters.status !== 'all' && r.status !== filters.status) return false
      if (filters.suiteId !== 'all' && r.suite_id !== filters.suiteId) return false
      if (filters.environmentId !== 'all' && r.environment_id !== filters.environmentId) return false
      if (q && !r.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [runs, filters, search])

  const groups = useMemo(() => {
    const map = new Map<string, TestRunDoc[]>()
    for (const r of filtered) {
      const key = r.parent_run_id ?? r.$id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries())
      .map(([key, items]) => {
        const sorted = items.slice().sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
        const root = sorted[0]
        return { key, root, retries: sorted.slice(1), all: sorted }
      })
      .sort((a, b) => b.root.$createdAt.localeCompare(a.root.$createdAt))
  }, [filtered])

  const stats = useMemo(() => {
    const total = runs.length
    const inProgress = runs.filter((r) => r.status === 'in_progress').length
    const completed = runs.filter((r) => r.status === 'completed').length
    const draft = runs.filter((r) => r.status === 'draft').length
    return { total, inProgress, completed, draft }
  }, [runs])

  function openCreate() {
    setShowCreate(true)
    setCreateSuiteId('')
    setCreateEnvId(environments[0]?.$id ?? '')
    setCreateTitle('')
    setCreateScheduledAt('')
    setCreateSelectedCases({})
  }

  function closeCreate() {
    setShowCreate(false)
  }

  async function createRun() {
    if (!project) return
    if (!createSuiteId) return
    if (!createEnvId) return
    const title = createTitle.trim()
    if (!title) return
    const selected = Object.entries(createSelectedCases)
      .filter(([, v]) => v)
      .map(([id]) => id)

    setBusyCreate(true)
    setError(null)
    try {
      const run = await databases.createDocument<TestRunDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.testRuns,
        documentId: ID.unique(),
        data: {
          project_id: project.$id,
          suite_id: createSuiteId,
          environment_id: createEnvId,
          title,
          status: 'draft',
          progress_percentage: 0,
          created_by: user?.$id,
          scheduled_at: createScheduledAt ? new Date(createScheduledAt).toISOString() : null,
        },
        permissions: teamDocPermissions(project.team_id, user?.$id),
      })

      if (selected.length) {
        await Promise.all(
          selected.map((caseId) =>
            databases.createDocument({
              databaseId: DATABASE_ID,
              collectionId: COLLECTION_IDS.runResults,
              documentId: ID.unique(),
              data: {
                project_id: project.$id,
                run_id: run.$id,
                case_id: caseId,
                status: 'not_run',
                step_results: '[]',
              },
              permissions: teamDocPermissions(project.team_id, user?.$id),
            }),
          ),
        )
      }

      closeCreate()
      await loadAll()
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar Test Run'))
    } finally {
      setBusyCreate(false)
    }
  }

  async function cloneAndRetry(parent: TestRunDoc) {
    if (!project) return
    setError(null)
    try {
      await databases.createDocument<TestRunDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.testRuns,
        documentId: ID.unique(),
        data: {
          project_id: project.$id,
          suite_id: parent.suite_id ?? null,
          environment_id: parent.environment_id,
          title: `${parent.title} (re-run)`,
          status: 'draft',
          progress_percentage: 0,
          created_by: user?.$id,
          parent_run_id: parent.$id,
        },
        permissions: teamDocPermissions(project.team_id, user?.$id),
      })
      await loadAll()
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar re-run'))
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-surface-500">
            <Link to="/dashboards" className="hover:text-surface-300">Dashboard</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Execuções</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-surface-100">Test Runs</h1>
          <p className="mt-1 text-sm text-surface-400">
            Histórico de execuções, agendamentos e rodadas de re-run.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={!project || !suites.length}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-500 hover:shadow-lg hover:shadow-brand-600/20 disabled:opacity-50"
          title={!suites.length ? 'Crie uma Suite primeiro' : 'Criar novo Test Run'}
        >
          <Plus className="h-4 w-4" />
          Novo Run
        </button>
      </header>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total de Runs" value={stats.total} accent="text-surface-100" />
        <StatCard label="Executando" value={stats.inProgress} accent="text-cyan-400" />
        <StatCard label="Concluídos" value={stats.completed} accent="text-emerald-400" />
        <StatCard label="Rascunhos" value={stats.draft} accent="text-amber-400" />
      </div>

      {/* Filters */}
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-surface-500" />
            <input
              className="bg-transparent text-sm text-surface-100 placeholder:text-surface-500 outline-none flex-1"
              placeholder="Buscar por título..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-surface-500" />
            <select
              className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as RunFilters['status'] }))}
            >
              <option value="all">Todos os status</option>
              <option value="draft">Rascunho</option>
              <option value="in_progress">Executando</option>
              <option value="completed">Concluído</option>
            </select>
            <select
              className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none"
              value={filters.suiteId}
              onChange={(e) => setFilters((f) => ({ ...f, suiteId: e.target.value }))}
            >
              <option value="all">Todas as Suites</option>
              {suites.map((s) => (
                <option key={s.$id} value={s.$id}>{s.name}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none"
              value={filters.environmentId}
              onChange={(e) => setFilters((f) => ({ ...f, environmentId: e.target.value }))}
            >
              <option value="all">Todos os Ambientes</option>
              {environments.map((e) => (
                <option key={e.$id} value={e.$id}>{e.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {/* Runs list */}
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--border-glass)]">
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Suite / Run</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Ambiente</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Quem</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Quando</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Status</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">Progresso</th>
                  <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-glass)]">
                {groups.map(({ key, root, retries, all }) => {
                  const expanded = expandedGroups.has(key)
                  const suite = root.suite_id ? suitesById.get(root.suite_id) : null
                  const env = envsById.get(root.environment_id)
                  const status = STATUS_LABELS[root.status]
                  return (
                    <RunGroupRows
                      key={key}
                      root={root}
                      retries={retries}
                      all={all}
                      expanded={expanded}
                      onToggle={() => toggleGroup(key)}
                      suiteName={suite?.name ?? '—'}
                      envName={env?.name ?? '—'}
                      status={status}
                      onClone={() => cloneAndRetry(root)}
                      userLabel={root.executed_by ? 'executor' : 'criador'}
                    />
                  )
                })}
                {!groups.length ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-surface-500">
                      {loading || validating
                        ? 'Carregando...'
                        : !project
                          ? 'Selecione um Projeto para ver Test Runs.'
                          : 'Nenhum Test Run encontrado. Clique em "Novo Run" para criar o primeiro.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate ? (
        <CreateRunModal
          suites={suites}
          environments={environments}
          cases={cases}
          title={createTitle}
          setTitle={setCreateTitle}
          suiteId={createSuiteId}
          setSuiteId={setCreateSuiteId}
          envId={createEnvId}
          setEnvId={setCreateEnvId}
          scheduledAt={createScheduledAt}
          setScheduledAt={setCreateScheduledAt}
          selectedCases={createSelectedCases}
          setSelectedCases={setCreateSelectedCases}
          onClose={closeCreate}
          onSubmit={createRun}
          busy={busyCreate}
        />
      ) : null}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] p-4 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative">
        <div className="text-[10px] font-medium uppercase tracking-widest text-surface-500">{label}</div>
        <div className={`mt-2 text-3xl font-bold font-mono ${accent}`}>{value}</div>
      </div>
    </div>
  )
}

function RunGroupRows({
  root,
  retries,
  all,
  expanded,
  onToggle,
  suiteName,
  envName,
  status,
  onClone,
  userLabel,
}: {
  root: TestRunDoc
  retries: TestRunDoc[]
  all: TestRunDoc[]
  expanded: boolean
  onToggle: () => void
  suiteName: string
  envName: string
  status: { label: string; color: string; dot: string }
  onClone: () => void
  userLabel: string
}) {
  return (
    <>
      <tr className="hover:bg-[var(--bg-highlight-subtle)] transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {retries.length ? (
              <button
                type="button"
                onClick={onToggle}
                className="rounded-md p-1 text-surface-500 hover:bg-[var(--bg-glass-high)] hover:text-surface-300"
                title={expanded ? 'Ocultar rodadas' : 'Mostrar rodadas'}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <div>
              <div className="text-sm font-medium text-surface-200">{root.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-surface-500">
                <span className="rounded-md bg-[var(--bg-glass-high)] px-1.5 py-0.5 font-mono text-[10px]">
                  {suiteName}
                </span>
                {retries.length ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                    <History className="h-3 w-3" />
                    {all.length} rodada{all.length > 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-surface-300">{envName}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-surface-400">
            <User className="h-3 w-3" />
            <span className="font-mono text-[10px]">
              {(root.executed_by ?? root.created_by ?? '—').slice(0, 8)}
            </span>
            <span className="text-[10px] text-surface-500">({userLabel})</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <WhenCell run={root} />
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${status.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full bg-[var(--bg-glass-high)] overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all"
                style={{ width: `${root.progress_percentage}%` }}
              />
            </div>
            <span className="text-[11px] text-surface-500 font-mono">{root.progress_percentage}%</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClone}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-glass)] px-2 py-1 text-[10px] font-medium text-surface-400 hover:text-surface-200 hover:bg-[var(--bg-highlight)]"
              title="Re-executar este Run"
            >
              <RotateCcw className="h-3 w-3" />
              Re-run
            </button>
            <Link
              to={`/execution/${root.$id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-glass)] px-2.5 py-1 text-[11px] font-medium text-surface-400 hover:text-surface-200 hover:bg-[var(--bg-highlight)]"
            >
              <Play className="h-3 w-3" />
              Abrir
            </Link>
          </div>
        </td>
      </tr>
      {expanded && retries.map((r) => (
        <RetriedRunRow key={r.$id} run={r} />
      ))}
    </>
  )
}

function RetriedRunRow({ run }: { run: TestRunDoc }) {
  const status = STATUS_LABELS[run.status]
  return (
    <tr className="bg-[var(--bg-highlight-subtle)]/50">
      <td colSpan={7} className="px-4 py-2 pl-10">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-surface-400">
          <span className="inline-flex items-center gap-1 text-amber-400">
            <RotateCcw className="h-3 w-3" />
            Re-run
          </span>
          <span className="text-surface-500">·</span>
          <span>{formatDateTime(run.$createdAt)}</span>
          <span className="text-surface-500">·</span>
          <span className={`inline-flex items-center gap-1 ${status.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <span className="text-surface-500">·</span>
          <span className="font-mono">{run.progress_percentage}%</span>
          <Link
            to={`/execution/${run.$id}`}
            className="ml-auto text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
          >
            <Play className="h-3 w-3" />
            Abrir rodada
          </Link>
        </div>
      </td>
    </tr>
  )
}

function WhenCell({ run }: { run: TestRunDoc }) {
  const scheduled = run.scheduled_at
  const started = run.started_at
  const finished = run.finished_at
  if (scheduled && !started) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1 text-[11px] text-amber-400">
          <Calendar className="h-3 w-3" />
          <span>Agendado {relativeFromNow(scheduled)}</span>
        </div>
        <div className="text-[10px] text-surface-500">{formatDateTime(scheduled)}</div>
      </div>
    )
  }
  if (finished) {
    return (
      <div className="space-y-0.5">
        <div className="text-[11px] text-surface-300">{formatDateTime(finished)}</div>
        <div className="text-[10px] text-surface-500">
          {relativeFromNow(finished)} · duração{' '}
          {started
            ? `${Math.max(0, Math.round((new Date(finished).getTime() - new Date(started).getTime()) / 60000))}min`
            : '—'}
        </div>
      </div>
    )
  }
  if (started) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1 text-[11px] text-cyan-400">
          <Clock className="h-3 w-3" />
          <span>Iniciado {relativeFromNow(started)}</span>
        </div>
        <div className="text-[10px] text-surface-500">{formatDateTime(started)}</div>
      </div>
    )
  }
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-surface-400">{formatDateTime(run.$createdAt)}</div>
      <div className="text-[10px] text-surface-500">criado {relativeFromNow(run.$createdAt)}</div>
    </div>
  )
}

function CreateRunModal({
  suites,
  environments,
  cases,
  title,
  setTitle,
  suiteId,
  setSuiteId,
  envId,
  setEnvId,
  scheduledAt,
  setScheduledAt,
  selectedCases,
  setSelectedCases,
  onClose,
  onSubmit,
  busy,
}: {
  suites: SuiteDoc[]
  environments: EnvironmentDoc[]
  cases: TestCaseDoc[]
  title: string
  setTitle: (v: string) => void
  suiteId: string
  setSuiteId: (v: string) => void
  envId: string
  setEnvId: (v: string) => void
  scheduledAt: string
  setScheduledAt: (v: string) => void
  selectedCases: Record<string, boolean>
  setSelectedCases: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onClose: () => void
  onSubmit: () => void
  busy: boolean
}) {
  const selectedCount = Object.values(selectedCases).filter(Boolean).length
  const canSubmit = !busy && title.trim() && suiteId && envId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-[var(--border-glass)] bg-[var(--bg-panel)] shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between border-b border-[var(--border-glass)] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/20 text-brand-400">
                <Terminal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-surface-100">Novo Test Run</h2>
                <p className="text-xs text-surface-500">Selecione a suite, ambiente e casos de teste</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-surface-500 hover:bg-[var(--bg-glass-high)] hover:text-surface-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">
                Título *
              </label>
              <input
                autoFocus
                className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 outline-none focus:border-cyan-500/50"
                placeholder="Ex: Smoke Test - Staging"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">
                  Suite *
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none focus:border-cyan-500/50"
                  value={suiteId}
                  onChange={(e) => setSuiteId(e.target.value)}
                >
                  <option value="">Selecione uma suite</option>
                  {suites.map((s) => (
                    <option key={s.$id} value={s.$id}>{s.name}</option>
                  ))}
                </select>
                {!suites.length ? (
                  <p className="mt-1 text-[10px] text-amber-400">Crie uma Suite em "Test Suites" primeiro.</p>
                ) : null}
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">
                  Ambiente *
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none focus:border-cyan-500/50"
                  value={envId}
                  onChange={(e) => setEnvId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {environments.map((e) => (
                    <option key={e.$id} value={e.$id}>{e.name}</option>
                  ))}
                </select>
                {!environments.length ? (
                  <p className="mt-1 text-[10px] text-amber-400">Crie um Environment em "Execução" primeiro.</p>
                ) : null}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">
                Agendar para <span className="text-surface-600">(opcional)</span>
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none focus:border-cyan-500/50"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="mt-1 text-[10px] text-surface-500">
                Se definido, o run fica agendado até alguém iniciá-lo manualmente.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500">
                  Test Cases <span className="text-surface-600">(opcional)</span>
                </label>
                {suiteId && cases.length ? (
                  <span className="text-[10px] text-surface-500">{selectedCount} de {cases.length} selecionados</span>
                ) : null}
              </div>
              {!suiteId ? (
                <div className="rounded-lg border border-dashed border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] p-4 text-center text-xs text-surface-500">
                  Selecione uma Suite para listar os Test Cases.
                </div>
              ) : !cases.length ? (
                <div className="rounded-lg border border-dashed border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] p-4 text-center text-xs text-surface-500">
                  Nenhum Test Case nesta Suite.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] custom-scrollbar">
                  {cases.map((c) => (
                    <label
                      key={c.$id}
                      className="flex cursor-pointer items-start gap-2 border-b border-[var(--border-glass)] px-3 py-2 last:border-b-0 hover:bg-[var(--bg-highlight)]"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 accent-cyan-500"
                        checked={!!selectedCases[c.$id]}
                        onChange={(e) =>
                          setSelectedCases((prev) => ({ ...prev, [c.$id]: e.target.checked }))
                        }
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-surface-200">{c.title}</div>
                        <div className="text-[10px] text-surface-500">
                          {c.severity} · {c.priority}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-glass)] p-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-glass)] px-4 py-2 text-sm font-medium text-surface-300 hover:bg-[var(--bg-glass-high)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" />
              {busy ? 'Criando...' : 'Criar Run'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
