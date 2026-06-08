import { useEffect, useMemo, useState } from 'react'
import { databases, ID, Query, teams, teamDocPermissions, addTeamToCache } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type { IssueDoc, ProjectDoc, RunResultDoc, TestRunDoc } from '../lib/model'
import { useAuth } from '../auth/auth'
import { useProject } from '../lib/project'
import { Plus } from 'lucide-react'

type FilterMode = 'my' | 'recent' | 'archived'

function StatusBadge({ status }: { status: 'stable' | 'at_risk' | 'critical' }) {
  const map = {
    stable: { label: 'STABLE', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    at_risk: { label: 'AT RISK', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    critical: { label: 'CRITICAL', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  }
  const s = map[status]
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-bold uppercase ${s.cls}`}>
      {s.label}
    </span>
  )
}

function safePct(n: number, d: number) {
  if (!d) return 0
  return Math.round((n / d) * 100)
}

export function ProjectsPage() {
  const { user } = useAuth()
  const { project, setProject } = useProject()
  const [items, setItems] = useState<ProjectDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('my')
  const [showForm, setShowForm] = useState(false)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  // Data for metrics
  const [runs, setRuns] = useState<TestRunDoc[]>([])
  const [results, setResults] = useState<RunResultDoc[]>([])
  const [issues, setIssues] = useState<IssueDoc[]>([])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [projRes, runRes, resultRes, issueRes] = await Promise.all([
        databases.listDocuments<ProjectDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.projects,
          queries: [Query.orderDesc('$createdAt')],
        }),
        databases.listDocuments<TestRunDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testRuns,
          queries: [Query.limit(200)],
        }),
        databases.listDocuments<RunResultDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.runResults,
          queries: [Query.limit(500)],
        }),
        databases.listDocuments<IssueDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.issues,
          queries: [Query.limit(200)],
        }),
      ])
      setItems(projRes.documents)
      setRuns(runRes.documents)
      setResults(resultRes.documents)
      setIssues(issueRes.documents)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar dados'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const selected = useMemo(
    () => (project ? items.find((p) => p.$id === project.$id) ?? project : null),
    [items, project],
  )

  async function createProject() {
    const normalizedCode = code.trim().toUpperCase()
    const normalizedName = name.trim()
    if (!normalizedName || !normalizedCode) return

    setBusy(true)
    setError(null)
    try {
      const teamName = `TMCTQS - ${normalizedCode}`
      const team = await teams.create(ID.unique(), teamName)
      addTeamToCache(team.$id)

      const desc = description.trim()
      const doc = await databases.createDocument<ProjectDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.projects,
        documentId: ID.unique(),
        data: {
          name: normalizedName,
          code: normalizedCode,
          team_id: team.$id,
          ...(desc ? { description: desc } : {}),
        },
        permissions: teamDocPermissions(team.$id, user?.$id),
      })

      setName('')
      setCode('')
      setDescription('')
      setProject(doc)
      setShowForm(false)
      await loadAll()
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar Project'))
    } finally {
      setBusy(false)
    }
  }

  // Aggregate metrics per project
  const projectMetrics = useMemo(() => {
    const out: Record<string, { runs: number; passed: number; total: number; issues: number; passRate: number }> = {}
    for (const p of items) {
      const pRuns = runs.filter((r) => r.project_id === p.$id)
      const pResults = results.filter((r) => r.project_id === p.$id)
      const done = pResults.filter((r) => r.status !== 'not_run')
      const passed = done.filter((r) => r.status === 'passed')
      const pIssues = issues.filter((i) => i.project_id === p.$id && (i.status === 'open' || i.status === 'in_progress'))
      out[p.$id] = {
        runs: pRuns.length,
        passed: done.length,
        total: pResults.length,
        issues: pIssues.length,
        passRate: safePct(passed.length, done.length),
      }
    }
    return out
  }, [items, runs, results, issues])

  const stableCount = useMemo(() => {
    return items.filter((p) => {
      const m = projectMetrics[p.$id]
      return m && m.passRate >= 80
    }).length
  }, [items, projectMetrics])

  const atRiskCount = useMemo(() => {
    return items.filter((p) => {
      const m = projectMetrics[p.$id]
      return m && m.passRate >= 50 && m.passRate < 80
    }).length
  }, [items, projectMetrics])

  const criticalCount = useMemo(() => {
    return items.filter((p) => {
      const m = projectMetrics[p.$id]
      return m && m.passRate < 50
    }).length
  }, [items, projectMetrics])

  // Activity items from recent issues/runs
  const recentActivity = useMemo(() => {
    const activities: { type: 'success' | 'error' | 'info'; text: string; meta: string }[] = []
    for (const r of [...runs].slice(0, 3)) {
      activities.push({
        type: r.status === 'completed' ? 'success' : 'info',
        text: `Test run "${r.title}" ${r.status === 'completed' ? 'completed' : 'in progress'}`,
        meta: `${new Date(r.$createdAt).toLocaleDateString('pt-BR')}`,
      })
    }
    for (const i of [...issues].slice(0, 3)) {
      activities.push({
        type: 'error',
        text: `Issue: ${i.title}`,
        meta: `${i.severity} · ${new Date(i.$createdAt).toLocaleDateString('pt-BR')}`,
      })
    }
    return activities.slice(0, 5)
  }, [runs, issues])

  const filteredItems = filter === 'my' ? items : items

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-surface-100 tracking-tight">Projetos de Engenharia</h1>
          <p className="text-sm text-surface-500 mt-1 max-w-2xl">
            Gerencie seus fluxos de trabalho de QA, monitore a saúde dos sprints e garanta a entrega contínua com precisão técnica.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 transition-all hover:shadow-lg hover:shadow-brand-600/20"
        >
          <Plus className="h-4 w-4" />
          Novo Projeto
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {/* New Project Form */}
      {showForm ? (
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative">
            <div className="text-sm font-semibold text-surface-100 mb-4">Novo Projeto</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-surface-500 mb-1">Nome</label>
                <input
                  className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-brand-600/50 transition-colors"
                  placeholder="QA Platform"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-surface-500 mb-1">Sigla</label>
                <input
                  className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-brand-600/50 transition-colors"
                  placeholder="QA"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-surface-500 mb-1">Descrição</label>
                <textarea
                  className="h-20 w-full resize-none rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-brand-600/50 transition-colors"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border-glass)] px-3 py-2 text-xs text-surface-400 hover:text-surface-200 transition-all"
                  onClick={() => { setShowForm(false); setName(''); setCode(''); setDescription('') }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-60 transition-all"
                  disabled={busy || !name.trim() || !code.trim()}
                  onClick={() => createProject()}
                >
                  {busy ? 'Criando...' : 'Criar Projeto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Filters & Stats */}
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--border-glass)] pb-4">
        <div className="flex p-0.5 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)]">
          {(['my', 'recent', 'archived'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                filter === mode
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'text-surface-500 hover:text-surface-300'
              }`}
              onClick={() => setFilter(mode)}
            >
              {mode === 'my' ? 'My Projects' : mode === 'recent' ? 'Recent' : 'Archived'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-[11px] font-medium tracking-wider">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {stableCount} STABLE
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            {atRiskCount} AT RISK
          </span>
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            {criticalCount} CRITICAL
          </span>
        </div>
      </div>

      {/* Project Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 rounded-full border-2 border-brand-600/30 border-t-brand-600 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((p) => {
            const m = projectMetrics[p.$id] || { runs: 0, passed: 0, total: 0, issues: 0, passRate: 0 }
            const status: 'stable' | 'at_risk' | 'critical' = m.passRate >= 80 ? 'stable' : m.passRate >= 50 ? 'at_risk' : 'critical'
            const glowColor = status === 'stable' ? 'bg-emerald-500/5' : status === 'at_risk' ? 'bg-amber-500/5' : 'bg-red-500/5'
            const barColor = status === 'stable' ? 'bg-emerald-400' : status === 'at_risk' ? 'bg-amber-400' : 'bg-red-400'
            const barGlow = status === 'stable' ? 'shadow-[0_0_8px_rgba(74,222,128,0.5)]' : status === 'at_risk' ? 'shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'shadow-[0_0_8px_rgba(248,113,113,0.5)]'

            return (
              <button
                key={p.$id}
                type="button"
                onClick={() => setProject(p)}
                className={`relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 text-left transition-all duration-300 hover:border-[var(--border-hover)] hover:bg-[var(--bg-highlight)] group ${
                  selected?.$id === p.$id ? 'ring-1 ring-brand-600/40' : ''
                }`}
              >
                <div className={`absolute top-0 right-0 w-32 h-32 ${glowColor} blur-[40px] -mr-16 -mt-16 group-hover:opacity-80 transition-opacity`} />
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-[10px] font-medium tracking-widest text-cyan-400 uppercase mb-1">
                        {p.code}
                      </div>
                      <h2 className="text-base font-semibold text-surface-100">{p.name}</h2>
                    </div>
                    <StatusBadge status={status} />
                  </div>

                  <div className="space-y-3 mb-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-500">Test Cases</span>
                      <span className="text-xs font-semibold text-surface-200">{m.total}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-surface-400">Pass Rate</span>
                        <span className={status === 'stable' ? 'text-emerald-400 font-semibold' : status === 'at_risk' ? 'text-amber-400 font-semibold' : 'text-red-400 font-semibold'}>
                          {m.passRate}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[var(--bg-glass-high)] overflow-hidden">
                        <div className={`h-full rounded-full ${barColor} ${barGlow} transition-all duration-500`} style={{ width: `${m.passRate}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--border-glass)]">
                    <div>
                      <div className="text-[10px] text-surface-500 uppercase tracking-wider">Active Defects</div>
                      <div className="text-base font-semibold text-surface-100 mt-0.5">{m.issues}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-surface-500 uppercase tracking-wider">Test Runs</div>
                      <div className="text-base font-semibold text-surface-100 mt-0.5">{m.runs}</div>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}

          {/* Add Project Placeholder */}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="relative overflow-hidden rounded-xl border-2 border-dashed border-[var(--border-glass)] bg-transparent p-5 flex flex-col items-center justify-center min-h-[280px] transition-all duration-300 hover:border-cyan-400/40 hover:bg-[var(--bg-highlight-subtle)] group"
          >
            <div className="w-14 h-14 rounded-full bg-[var(--bg-panel)] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-[var(--border-glass)]">
              <Plus className="h-7 w-7 text-surface-500 group-hover:text-cyan-400 transition-colors" />
            </div>
            <p className="text-sm font-semibold text-surface-400 group-hover:text-cyan-400 transition-colors">Novo Projeto</p>
            <p className="text-xs text-surface-600 mt-1">Provisione um novo ambiente de teste</p>
          </button>
        </div>
      )}

      {/* Bottom Section: Trends + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Quality Metrics Over Time */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 lg:col-span-2 transition-all duration-300 hover:border-[var(--border-hover)] border-l-4 border-l-cyan-400">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-surface-100">Quality Metrics Over Time</div>
                <div className="text-xs text-surface-500 mt-0.5">Performance dos projetos</div>
              </div>
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-cyan-400" />
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>
            </div>
            <div className="h-48 flex items-end gap-2 px-1">
              {items.slice(0, 7).map((p) => {
                const m = projectMetrics[p.$id]
                const pct = m?.passRate || 0
                return (
                  <div key={p.$id} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div
                      className="w-full rounded-t-sm bg-cyan-400/20 hover:bg-cyan-400/40 transition-all"
                      style={{ height: `${Math.max(4, pct)}%` }}
                      title={`${p.name}: ${pct}%`}
                    />
                    <span className="text-[9px] text-surface-600 truncate w-full text-center">{p.code}</span>
                  </div>
                )
              })}
              {!items.length ? (
                <div className="flex items-center justify-center w-full text-xs text-surface-500">
                  Nenhum projeto
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)]">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative">
            <div className="text-sm font-semibold text-surface-100 mb-4">Recent Activity</div>
            <div className="space-y-3">
              {recentActivity.map((act, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                    act.type === 'success' ? 'bg-emerald-400' : act.type === 'error' ? 'bg-red-400' : 'bg-cyan-400'
                  }`} />
                  <div>
                    <p className="text-sm text-surface-200">{act.text}</p>
                    <p className="text-[11px] text-surface-500 mt-0.5">{act.meta}</p>
                  </div>
                </div>
              ))}
              {!recentActivity.length ? (
                <div className="text-xs text-surface-500 py-4 text-center">Nenhuma atividade recente</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}