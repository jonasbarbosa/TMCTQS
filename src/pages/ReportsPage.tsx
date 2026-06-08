import { useEffect, useMemo, useState } from 'react'
import { databases, Query } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type { IssueDoc, RunResultDoc, TestCaseDoc, TestRunDoc } from '../lib/model'
import { useProject } from '../lib/project'
import { TrendingDown, TrendingUp, ArrowUpRight, CheckCircle2, FileText, Table } from 'lucide-react'

type TrendPoint = {
  date: string
  label: string
  executed: number
  passed: number
  failed: number
}

function buildTrend(results: RunResultDoc[], days: number): TrendPoint[] {
  const now = Date.now()
  const dayMs = 86_400_000
  const points: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs)
    points.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      executed: 0,
      passed: 0,
      failed: 0,
    })
  }
  for (const r of results) {
    const created = r.$createdAt.slice(0, 10)
    const p = points.find((x) => x.date === created)
    if (p) {
      p.executed++
      if (r.status === 'passed') p.passed++
      else if (r.status === 'failed') p.failed++
    }
  }
  return points
}

function KpiCard({
  label,
  value,
  unit,
  trend,
  trendUp,
  trendLabel,
  color,
  icon,
  borderColor,
}: {
  label: string
  value: string
  unit?: string
  trend?: string
  trendUp?: boolean
  trendLabel?: string
  color: string
  icon: React.ReactNode
  borderColor: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)] hover:bg-[var(--bg-highlight)] border-t-2 ${borderColor} group`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className="absolute -right-4 -bottom-4 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity pointer-events-none">
        <div className="text-[120px] text-surface-100">{icon}</div>
      </div>
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-medium tracking-wider text-surface-500 uppercase">{label}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-surface-100 tracking-tight">{value}</span>
              {unit ? <span className="text-sm text-surface-500 font-normal">{unit}</span> : null}
            </div>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
            {icon}
          </div>
        </div>
        {trend ? (
          <div className="mt-3 flex items-center gap-1.5">
            {trendUp ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
            )}
            <span className={trendUp ? 'text-xs font-medium text-emerald-400' : 'text-xs font-medium text-red-400'}>
              {trend}
            </span>
            {trendLabel ? <span className="text-xs text-surface-600">{trendLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TrendChart({ data, days, onDaysChange }: { data: TrendPoint[]; days: number; onDaysChange: (d: number) => void }) {
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.passed, d.failed)))
  const chartH = 240

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-6 transition-all duration-300 hover:border-[var(--border-hover)]">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm font-semibold text-surface-100">Trend Analysis: Success vs. Failures</div>
            <div className="text-xs text-surface-500 mt-0.5">Performance trajectory over the last {days} days</div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] p-0.5">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${days === 30 ? 'bg-brand-600/20 text-brand-400' : 'text-surface-500 hover:text-surface-300'}`}
              onClick={() => onDaysChange(30)}
            >
              30 Days
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${days === 90 ? 'bg-brand-600/20 text-brand-400' : 'text-surface-500 hover:text-surface-300'}`}
              onClick={() => onDaysChange(90)}
            >
              90 Days
            </button>
          </div>
        </div>

        {/* Grid lines */}
        <div className="relative h-[240px]">
          <div className="absolute inset-0 flex flex-col justify-between py-2 pointer-events-none">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-t border-[var(--border-glass)] w-full" />
            ))}
          </div>

          {/* Bars */}
          <div className="relative h-full flex items-end gap-1.5 px-1 z-10">
            {data.map((d, i) => {
              const hPass = (d.passed / maxVal) * chartH
              const hFail = (d.failed / maxVal) * chartH
              return (
                <div key={i} className="flex-1 flex flex-col justify-end h-full gap-0.5 group/bar">
                  <div
                    className="w-full rounded-t-sm bg-emerald-400/70 transition-all group-hover/bar:brightness-125"
                    style={{ height: Math.max(2, hPass) }}
                    title={`Passed: ${d.passed}`}
                  />
                  <div
                    className="w-full rounded-b-sm bg-red-400/70 transition-all group-hover/bar:brightness-125"
                    style={{ height: Math.max(2, hFail) }}
                    title={`Failed: ${d.failed}`}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">Success Rate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">Failure Incidents</span>
          </div>
        </div>
      </div>
    </div>
  )
}

type ModuleRow = {
  name: string
  icon: React.ReactNode
  bugsFound: number
  bugsFixed: number
  fixRate: number
  coverage: number
}

export function ReportsPage() {
  const { project } = useProject()
  const [results, setResults] = useState<RunResultDoc[]>([])
  const [issues, setIssues] = useState<IssueDoc[]>([])
  const [cases, setCases] = useState<TestCaseDoc[]>([])
  const [_runs, setRuns] = useState<TestRunDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trendDays, setTrendDays] = useState(30)

  async function load() {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const [runRes, resultRes, issueRes, caseRes] = await Promise.all([
        databases.listDocuments<TestRunDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testRuns,
          queries: [Query.equal('project_id', project.$id), Query.orderDesc('$createdAt'), Query.limit(100)],
        }),
        databases.listDocuments<RunResultDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.runResults,
          queries: [Query.equal('project_id', project.$id), Query.limit(1000)],
        }),
        databases.listDocuments<IssueDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.issues,
          queries: [Query.equal('project_id', project.$id), Query.limit(200)],
        }),
        databases.listDocuments<TestCaseDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testCases,
          queries: [Query.equal('project_id', project.$id), Query.limit(500)],
        }),
      ])
      setRuns(runRes.documents)
      setResults(resultRes.documents)
      setIssues(issueRes.documents)
      setCases(caseRes.documents)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Reports'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [project?.$id])

  const trendData = useMemo(() => buildTrend(results, trendDays), [results, trendDays])

  const kpiMetrics = useMemo(() => {
    const totalDone = results.filter((r) => r.status !== 'not_run').length
    const totalPassed = results.filter((r) => r.status === 'passed').length
    const totalFailed = results.filter((r) => r.status === 'failed').length

    const passRate = totalDone ? Math.round((totalPassed / totalDone) * 100) : 0
    const flakyCount = results.filter((r) => r.status === 'failed').length
    const coverage = cases.length ? Math.round((new Set(results.map((r) => r.case_id)).size / cases.length) * 100) : 0
    const stability = totalDone ? Math.round((totalPassed / totalDone) * 100) : 0

    const openIssues = issues.filter((i) => i.status === 'open' || i.status === 'in_progress')

    return { passRate, flakyCount, coverage, stability, totalFailed, totalDone, totalPassed, openIssues }
  }, [results, issues, cases.length])

  const modules: ModuleRow[] = useMemo(() => {
    const keywords = [
      { name: 'Authentication Engine', icon: '🔒', kw: 'auth' },
      { name: 'Database Schema', icon: '🗄️', kw: 'db' },
      { name: 'UI Component Library', icon: '🎨', kw: 'ui' },
      { name: 'API Gateway', icon: '🌐', kw: 'api' },
      { name: 'Notification Service', icon: '🔔', kw: 'notif' },
      { name: 'Cache Layer', icon: '⚡', kw: 'cache' },
    ]
    return keywords.map((mod) => {
      const modCases = cases.filter((c) => c.title.toLowerCase().includes(mod.kw) || c.suite_id.toLowerCase().includes(mod.kw))
      const modCaseIds = new Set(modCases.map((c) => c.$id))
      const modResults = results.filter((r) => modCaseIds.has(r.case_id))
      const bugsFound = issues.filter((i) => modCaseIds.has(i.case_id || '')).length
      const bugsFixed = issues.filter((i) => modCaseIds.has(i.case_id || '') && (i.status === 'resolved' || i.status === 'validated' || i.status === 'closed')).length
      const fixRate = bugsFound ? Math.round((bugsFixed / bugsFound) * 100) : 100
      const covered = new Set(modResults.map((r) => r.case_id)).size
      const coverage = modCases.length ? Math.round((covered / modCases.length) * 100) : 0
      return { ...mod, bugsFound, bugsFixed, fixRate, coverage }
    })
  }, [cases, results, issues])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-surface-500">
        <span>Reports</span>
        <span className="text-surface-700">/</span>
        <span className="text-brand-400">{project?.code || 'Project'}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-surface-100 tracking-tight">Relatório Detalhado de Qualidade</h1>
          <p className="text-sm text-surface-500 mt-1">Métricas consolidadas de qualidade e performance</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] px-3 py-2 text-xs text-surface-400 hover:text-surface-200 hover:border-[var(--border-hover)] transition-all"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] px-3 py-2 text-xs text-surface-400 hover:text-surface-200 hover:border-[var(--border-hover)] transition-all"
          >
            <Table className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {!project ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-lowest)] border border-[var(--border-glass)]">
            <FileText className="h-8 w-8 text-surface-500" />
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-surface-200">Nenhum projeto selecionado</div>
            <div className="mt-1 text-sm text-surface-500">Selecione um projeto no Dashboard para visualizar relatórios.</div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 rounded-full border-2 border-brand-600/30 border-t-brand-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Pass Rate"
              value={`${kpiMetrics.passRate}`}
              unit="%"
              trend={`${kpiMetrics.totalPassed}/${kpiMetrics.totalDone} passed`}
              trendUp={kpiMetrics.passRate >= 80}
              color="bg-cyan-500/10"
              icon={<CheckCircle2 className="h-5 w-5 text-cyan-400" />}
              borderColor="border-t-cyan-400"
            />
            <KpiCard
              label="Flakiness Index"
              value={kpiMetrics.totalDone ? ((kpiMetrics.flakyCount / kpiMetrics.totalDone) * 100).toFixed(1) : '0'}
              unit="%"
              trend={`${kpiMetrics.flakyCount} failed`}
              trendUp={kpiMetrics.flakyCount === 0}
              trendLabel="variance"
              color="bg-amber-500/10"
              icon={<TrendingUp className="h-5 w-5 text-amber-400" />}
              borderColor="border-t-amber-400"
            />
            <KpiCard
              label="Code Coverage"
              value={`${kpiMetrics.coverage}`}
              unit="%"
              trend={`${new Set(results.map((r) => r.case_id)).size}/${cases.length} cases`}
              trendUp={kpiMetrics.coverage >= 70}
              color="bg-emerald-500/10"
              icon={<ArrowUpRight className="h-5 w-5 text-emerald-400" />}
              borderColor="border-t-emerald-400"
            />
            <KpiCard
              label="Test Stability"
              value={`${kpiMetrics.stability}`}
              unit="%"
              trend={kpiMetrics.stability >= 90 ? 'Stable' : 'Atenção'}
              trendUp={kpiMetrics.stability >= 90}
              color="bg-cyan-500/10"
              icon={<CheckCircle2 className="h-5 w-5 text-cyan-400" />}
              borderColor="border-t-cyan-400"
            />
          </div>

          {/* Trend Analysis */}
          <TrendChart data={trendData} days={trendDays} onDaysChange={setTrendDays} />

          {/* System Modules Breakdown */}
          <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl transition-all duration-300 hover:border-[var(--border-hover)]">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <div className="text-sm font-semibold text-surface-100">System Modules Breakdown</div>
                  <div className="text-xs text-surface-500 mt-0.5">{modules.length} Modules Tracked</div>
                </div>
                <span className="rounded-full border border-[var(--border-glass)] bg-[var(--bg-highlight)] px-3 py-1 text-[10px] font-medium text-surface-500">
                  {modules.length} Modules Tracked
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-[var(--border-glass)]">
                      <th className="px-5 py-3.5 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Module Name</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Bug Status</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Fix Rate</th>
                      <th className="px-5 py-3.5 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Coverage</th>
                      <th className="px-5 py-3.5 text-right text-[11px] font-medium tracking-wider text-surface-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {modules.map((mod) => {
                      const fixColor = mod.fixRate >= 90 ? 'bg-emerald-400' : mod.fixRate >= 70 ? 'bg-amber-400' : 'bg-red-400'
                      return (
                        <tr key={mod.name} className="group/row transition-colors hover:bg-[var(--bg-highlight-subtle)]">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-sm">
                                {mod.icon}
                              </div>
                              <span className="font-medium text-surface-200">{mod.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-4">
                              <div className="text-center">
                                <div className="text-[11px] text-surface-500">Found</div>
                                <div className="text-sm font-bold text-red-400">{mod.bugsFound}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-[11px] text-surface-500">Fixed</div>
                                <div className="text-sm font-bold text-emerald-400">{mod.bugsFixed}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="max-w-[120px]">
                              <div className="h-1.5 rounded-full bg-[var(--bg-glass-high)] overflow-hidden">
                                <div className={`h-full rounded-full ${fixColor} transition-all duration-500`} style={{ width: `${mod.fixRate}%` }} />
                              </div>
                              <div className="text-[10px] text-surface-500 mt-1 font-medium">{mod.fixRate}% Completion</div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-sm font-semibold text-surface-200">{mod.coverage}%</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              className="rounded-lg border border-[var(--border-glass)] px-2.5 py-1.5 text-xs text-surface-400 hover:text-surface-200 hover:border-[var(--border-hover)] transition-all opacity-0 group-hover/row:opacity-100"
                            >
                              View Logs
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}