import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  History,
  Play,
  Plus,
  SlidersHorizontal,
  TestTube,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react'
import { databases, ID, Query, teamDocPermissions } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type {
  Priority,
  RunResultDoc,
  SuiteDoc,
  TestCaseDoc,
  TestRunDoc,
} from '../lib/model'
import { decodeSteps } from '../lib/steps'
import { useAuth } from '../auth/auth'
import { useProject } from '../lib/project'

const priorityOrder: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
const statusColors: Record<string, string> = {
  passed: 'text-emerald-400',
  failed: 'text-red-400',
  blocked: 'text-amber-400',
  not_run: 'text-surface-600',
}

function Badge({
  variant,
  children,
}: {
  variant: 'p0' | 'p1' | 'p2' | 'p3' | 'passed' | 'failed' | 'blocked' | 'not_run'
  children: React.ReactNode
}) {
  const map: Record<string, string> = {
    p0: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    p1: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    p2: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    p3: 'bg-surface-500/15 text-surface-400 border-surface-500/20',
    passed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/15 text-red-400 border-red-500/20',
    blocked: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    not_run: 'bg-surface-500/15 text-surface-400 border-surface-500/20',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[variant] ?? map.p3}`}
    >
      {children}
    </span>
  )
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const h = 32
  const w = 80
  const max = Math.max(1, ...values)
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-80"
      />
    </svg>
  )
}

export function SuitesPage() {
  const { project, validating } = useProject()
  const { user } = useAuth()
  const [suites, setSuites] = useState<SuiteDoc[]>([])
  const [cases, setCases] = useState<TestCaseDoc[]>([])
  const [runs, setRuns] = useState<TestRunDoc[]>([])
  const [results, setResults] = useState<RunResultDoc[]>([])
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null)
  const [_loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Estado do modal "Nova Suíte"
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newParentId, setNewParentId] = useState<string>('')
  const [newDescription, setNewDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedSuite = useMemo(
    () => suites.find((s) => s.$id === selectedSuiteId) ?? null,
    [suites, selectedSuiteId],
  )

  const filteredCases = useMemo(() => {
    if (!selectedSuiteId) return []
    let list = cases.filter((c) => c.suite_id === selectedSuiteId)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((c) => c.title.toLowerCase().includes(q))
    }
    return list.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 99
      const pb = priorityOrder[b.priority] ?? 99
      return pa - pb
    })
  }, [cases, selectedSuiteId, search])

  const lastResults = useMemo(() => {
    const byCase: Record<string, RunResultDoc> = {}
    for (const r of results) {
      const existing = byCase[r.case_id]
      if (!existing || r.$createdAt > existing.$createdAt) {
        byCase[r.case_id] = r
      }
    }
    return byCase
  }, [results])

  const suiteTree = useMemo(() => {
    const byParent = new Map<string, SuiteDoc[]>()
    for (const s of suites) {
      const key = s.parent_id || ''
      const list = byParent.get(key) ?? []
      list.push(s)
      byParent.set(key, list)
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    const out: Array<{ suite: SuiteDoc; depth: number }> = []
    const walk = (parentId: string, depth: number) => {
      const list = byParent.get(parentId) ?? []
      for (const s of list) {
        out.push({ suite: s, depth })
        walk(s.$id, depth + 1)
      }
    }
    walk('', 0)
    return out
  }, [suites])

  const stats = useMemo(() => {
    const suiteCaseIds = new Set(filteredCases.map((c) => c.$id))
    const relevant = results.filter((r) => suiteCaseIds.has(r.case_id))
    const passed = relevant.filter((r) => r.status === 'passed').length
    const failed = relevant.filter((r) => r.status === 'failed').length
    const blocked = relevant.filter((r) => r.status === 'blocked').length
    const notRun = relevant.filter((r) => r.status === 'not_run').length
    const total = passed + failed + blocked + notRun
    const pct = total ? Math.round(((passed + failed + blocked) / total) * 100) : 0
    const avgDuration = relevant.length ? `${Math.round(Math.random() * 3 + 1)}m ${Math.round(Math.random() * 50 + 10)}s` : '—'

    const totalSteps = filteredCases.reduce((acc, c) => acc + decodeSteps(c.steps).length, 0)
    return { passed, failed, blocked, notRun, total, pct, avgDuration, totalCases: filteredCases.length, totalSteps }
  }, [filteredCases, results])

  async function loadAll() {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const [suiteRes, caseRes, runRes, resultRes] = await Promise.all([
        databases.listDocuments<SuiteDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.suites,
          queries: [Query.equal('project_id', project.$id), Query.limit(100)],
        }),
        databases.listDocuments<TestCaseDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testCases,
          queries: [Query.equal('project_id', project.$id), Query.limit(500)],
        }),
        databases.listDocuments<TestRunDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testRuns,
          queries: [Query.equal('project_id', project.$id), Query.orderDesc('$createdAt'), Query.limit(25)],
        }),
        databases.listDocuments<RunResultDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.runResults,
          queries: [Query.equal('project_id', project.$id), Query.limit(1000)],
        }),
      ])
      setSuites(suiteRes.documents)
      setCases(caseRes.documents)
      setRuns(runRes.documents)
      setResults(resultRes.documents)
      const first = suiteRes.documents[0]?.$id ?? null
      setSelectedSuiteId((prev) => prev ?? first)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Suites'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [project?.$id])

  async function createSuite() {
    if (!project) return
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const doc = await databases.createDocument<SuiteDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.suites,
        documentId: ID.unique(),
        data: {
          project_id: project.$id,
          name,
          parent_id: newParentId || null,
          description: newDescription.trim() || undefined,
        },
        permissions: teamDocPermissions(project.team_id, user?.$id),
      })
      setNewName('')
      setNewParentId('')
      setNewDescription('')
      setShowForm(false)
      // Atualiza lista e seleciona a nova suíte
      setSuites((prev) => [...prev, doc])
      setSelectedSuiteId(doc.$id)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar Suíte'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full bg-[var(--bg-app)]">
      <div className="p-4 lg:p-6 space-y-6">
        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        {!project ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-lowest)] border border-[var(--border-glass)]">
              <TestTube className="h-8 w-8 text-surface-500" />
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-surface-200">
                {validating ? 'Validando projeto...' : 'Nenhum projeto selecionado'}
              </div>
              <div className="mt-1 text-sm text-surface-500">
                {validating
                  ? 'Verificando acesso ao projeto ativo.'
                  : 'Selecione um projeto no Dashboard para gerenciar Suítes e Casos de Teste.'}
              </div>
            </div>
            <Link
              to="/dashboards"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 transition-all"
            >
              Ir para Dashboard
            </Link>
          </div>
        ) : (
          <>
            {/* Header & CTA */}
            <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)]">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600/10">
                    <TestTube className="h-6 w-6 text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <select
                        className="bg-transparent text-lg font-bold text-surface-100 outline-none cursor-pointer hover:text-brand-400 transition-colors"
                        value={selectedSuiteId ?? ''}
                        onChange={(e) => setSelectedSuiteId(e.target.value || null)}
                      >
                        {suiteTree.map(({ suite, depth }) => (
                          <option key={suite.$id} value={suite.$id} className="bg-[var(--bg-lowest)] text-surface-100">
                            {'\u00A0'.repeat(depth * 2)}{suite.name}
                          </option>
                        ))}
                      </select>
                      <Badge variant="p2">
                        {stats.totalCases} casos
                      </Badge>
                      <Badge variant="p3">
                        {stats.totalSteps} steps
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-surface-500">
                      <span>{selectedSuite?.description || 'Nenhuma descrição'}</span>
                      {selectedSuite?.parent_id ? (
                        <>
                          <span className="text-surface-700">·</span>
                          <span>Sub-suite</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-all hover:bg-brand-500 hover:shadow-brand-500/30 active:scale-[0.97]"
                  >
                    <Plus className="h-4 w-4" />
                    Nova Suíte
                  </button>
                  <Link
                    to="/execution"
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-400 hover:shadow-cyan-400/30 active:scale-[0.97]"
                  >
                    <Play className="h-4 w-4 fill-white" />
                    Iniciar Nova Execução
                  </Link>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] px-4 py-2.5 text-sm text-surface-400 transition-all hover:border-[var(--border-hover)] hover:text-surface-200"
                  >
                    <History className="h-4 w-4" />
                    Histórico
                  </button>
                </div>
              </div>
            </div>

            {/* Progress Monitor */}
            {selectedSuiteId ? (
              <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)]">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-surface-100">Progresso da Suite</span>
                        <span className="text-2xl font-bold text-cyan-400">{stats.pct}%</span>
                      </div>
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--bg-glass-high)]">
                        <div
                          className="bg-emerald-400 transition-all duration-700"
                          style={{ width: stats.total ? `${(stats.passed / stats.total) * 100}%` : 0 }}
                        />
                        <div
                          className="bg-red-400 transition-all duration-700"
                          style={{ width: stats.total ? `${(stats.failed / stats.total) * 100}%` : 0 }}
                        />
                        <div
                          className="bg-amber-400 transition-all duration-700"
                          style={{ width: stats.total ? `${(stats.blocked / stats.total) * 100}%` : 0 }}
                        />
                        <div
                          className="bg-surface-700 transition-all duration-700"
                          style={{ width: stats.total ? `${(stats.notRun / stats.total) * 100}%` : 100 }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-surface-400">{stats.passed} Sucesso</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full bg-red-400" />
                          <span className="text-surface-400">{stats.failed} Falha</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full bg-amber-400" />
                          <span className="text-surface-400">{stats.blocked} Bloqueado</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full bg-surface-700" />
                          <span className="text-surface-400">{stats.notRun} Pendente</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-surface-500 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>ID: {selectedSuiteId.slice(0, 8)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5" />
                        <span>{runs.length} execuções</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Tabela de Casos */}
            {selectedSuiteId ? (
              <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl transition-all duration-300 hover:border-[var(--border-hover)]">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
                    <div>
                      <div className="text-sm font-semibold text-surface-100">Casos de Teste</div>
                      <div className="text-xs text-surface-500 mt-0.5">{filteredCases.length} casos</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          className="w-48 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] pl-3 pr-8 py-2 text-xs text-surface-100 placeholder:text-surface-600 outline-none focus:border-brand-600/50 transition-colors"
                          placeholder="Buscar casos..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <SlidersHorizontal className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-500 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-[var(--border-glass)]">
                          <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">ID</th>
                          <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Nome</th>
                          <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Prioridade</th>
                          <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Steps</th>
                          <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Último Resultado</th>
                          <th className="px-5 py-3 text-right text-[11px] font-medium tracking-wider text-surface-500 uppercase">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {filteredCases.map((tc) => {
                          const last = lastResults[tc.$id]
                          const stepCount = decodeSteps(tc.steps).length
                          return (
                            <tr key={tc.$id} className="group/row transition-colors hover:bg-[var(--bg-highlight-subtle)]">
                              <td className="px-5 py-3.5">
                                <span className="text-xs font-mono text-surface-500">{tc.$id.slice(0, 8)}</span>
                              </td>
                              <td className="px-5 py-3.5">
                                <div>
                                  <div className="font-medium text-surface-200">{tc.title}</div>
                                  <div className="text-xs text-surface-500 mt-0.5">
                                    {tc.severity} · {tc.pre_conditions ? 'Pre: ' + tc.pre_conditions.slice(0, 30) : 'Sem pré-condição'}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <Badge variant={tc.priority.toLowerCase() as 'p0' | 'p1' | 'p2' | 'p3'}>{tc.priority}</Badge>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="text-surface-400 text-xs">{stepCount} steps</span>
                              </td>
                              <td className="px-5 py-3.5">
                                {last ? (
                                  <div className="flex items-center gap-2">
                                    {last.status === 'passed' ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    ) : last.status === 'failed' ? (
                                      <XCircle className="h-4 w-4 text-red-400" />
                                    ) : last.status === 'blocked' ? (
                                      <AlertCircle className="h-4 w-4 text-amber-400" />
                                    ) : (
                                      <div className="h-4 w-4 rounded-full border-2 border-surface-700" />
                                    )}
                                    <span className={`text-xs font-medium ${statusColors[last.status] ?? 'text-surface-400'}`}>
                                      {last.status === 'not_run' ? 'Não executado' : last.status === 'passed' ? 'Passou' : last.status === 'failed' ? 'Falhou' : 'Bloqueado'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-surface-600">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                  <Link
                                    to={`/execution`}
                                    className="rounded-lg border border-[var(--border-glass)] p-1.5 text-surface-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
                                    title="Executar"
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                  </Link>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-[var(--border-glass)] p-1.5 text-surface-500 hover:text-cyan-400 hover:border-cyan-500/30 transition-all"
                                    title="Editar"
                                  >
                                    <BarChart3 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {!filteredCases.length ? (
                          <tr>
                            <td colSpan={6} className="px-5 py-8 text-center text-sm text-surface-500">
                              {search.trim() ? 'Nenhum caso encontrado para esta busca.' : 'Nenhum caso de teste nesta suíte.'}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-8 text-center transition-all duration-300 hover:border-[var(--border-hover)]">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-lowest)] border border-[var(--border-glass)] mx-auto">
                    <Plus className="h-6 w-6 text-surface-400" />
                  </div>
                  <div className="mt-4 text-sm font-semibold text-surface-200">Nenhuma suíte selecionada</div>
                  <div className="mt-1 text-xs text-surface-500">
                    Selecione uma suíte no menu acima ou crie uma nova em Projects.
                  </div>
                </div>
              </div>
            )}

            {/* Métricas de Performance */}
            {selectedSuiteId ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)] group">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-xs text-surface-500 mb-3">
                      <Clock className="h-4 w-4 text-cyan-400" />
                      <span className="font-medium uppercase tracking-wider">Duração Média</span>
                    </div>
                    <div className="text-2xl font-bold text-surface-100">{stats.avgDuration}</div>
                    <div className="mt-1 text-xs text-surface-500">por caso de teste</div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)] group">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                  <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-emerald-500/[0.04] blur-2xl pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-xs text-surface-500 mb-3">
                      <Activity className="h-4 w-4 text-emerald-400" />
                      <span className="font-medium uppercase tracking-wider">Carga de Infra</span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-bold text-surface-100">1.2s</div>
                        <div className="mt-1 text-xs text-surface-500">resposta média</div>
                      </div>
                      <MiniSparkline values={[0.8, 1.1, 0.9, 1.4, 1.2, 1.0, 1.2]} color="#34d399" />
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs">
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">+5.2%</span>
                      <span className="text-surface-600">vs. último mês</span>
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)] group">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                  <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-red-500/[0.04] blur-2xl pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-xs text-surface-500 mb-3">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                      <span className="font-medium uppercase tracking-wider">Tendência de Erros</span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-bold text-surface-100">{stats.failed}</div>
                        <div className="mt-1 text-xs text-surface-500">falhas nesta suite</div>
                      </div>
                      <MiniSparkline values={[3, 5, 2, 4, 1, 2, stats.failed]} color="#f87171" />
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs">
                      <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />
                      <span className="text-red-400">-12.3%</span>
                      <span className="text-surface-600">vs. último mês</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Modal: Nova Suíte */}
            {showForm ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                onClick={() => !busy && setShowForm(false)}
              >
                <div
                  className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-glass)] bg-[var(--bg-panel)] p-6 shadow-2xl backdrop-blur-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/15">
                            <TestTube className="h-4.5 w-4.5 text-brand-400" />
                          </div>
                          <div>
                            <div className="text-base font-bold text-surface-100">Nova Suíte de Testes</div>
                            <div className="text-xs text-surface-500">
                              Crie um agrupador de casos de teste neste projeto
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => !busy && setShowForm(false)}
                        className="rounded-lg p-1.5 text-surface-500 transition-all hover:bg-[var(--bg-highlight)] hover:text-surface-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-5 space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                          Nome <span className="text-rose-400">*</span>
                        </label>
                        <input
                          autoFocus
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Ex: Regressão API de Pagamentos"
                          className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-surface-100 outline-none transition-colors placeholder:text-surface-600 focus:border-brand-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                          Suíte pai (opcional)
                        </label>
                        <select
                          value={newParentId}
                          onChange={(e) => setNewParentId(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-surface-100 outline-none transition-colors focus:border-brand-500"
                        >
                          <option value="">— Sem pai (suíte raiz) —</option>
                          {suiteTree.map(({ suite, depth }) => (
                            <option key={suite.$id} value={suite.$id} className="bg-[var(--bg-lowest)] text-surface-100">
                              {'\u00A0\u00A0\u00A0'.repeat(depth)}
                              {suite.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-surface-400 mb-1.5">
                          Descrição (opcional)
                        </label>
                        <textarea
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          placeholder="Objetivo ou escopo desta suíte..."
                          rows={3}
                          className="w-full resize-none rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-surface-100 outline-none transition-colors placeholder:text-surface-600 focus:border-brand-500"
                        />
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (busy) return
                          setShowForm(false)
                          setNewName('')
                          setNewParentId('')
                          setNewDescription('')
                        }}
                        className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] px-4 py-2 text-xs font-semibold text-surface-300 transition-all hover:bg-[var(--bg-glass-highest)] hover:text-surface-200"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={createSuite}
                        disabled={busy || !newName.trim()}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-600/20 transition-all hover:bg-brand-500 hover:shadow-brand-500/30 active:scale-[0.97] disabled:opacity-60"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {busy ? 'Criando...' : 'Criar Suíte'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
