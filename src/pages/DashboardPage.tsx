import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  Server,
  TestTube,
  TrendingUp,
  Users,
} from 'lucide-react'
import { databases, Query } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type {
  IssueDoc,
  RunResultDoc,
  TestCaseDoc,
  TestRunDoc,
} from '../lib/model'
import { useProject } from '../lib/project'

function safePct(n: number, d: number) {
  if (!d) return 0
  return Math.round((n / d) * 100)
}

type TrendDay = {
  date: string
  label: string
  opened: number
  critical: number
}

function buildTrendData(issues: IssueDoc[], days = 7): TrendDay[] {
  const now = Date.now()
  const dayMs = 86_400_000
  const buckets: TrendDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs)
    const label = d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)
    buckets.push({
      date: d.toISOString().slice(0, 10),
      label,
      opened: 0,
      critical: 0,
    })
  }
  for (const issue of issues) {
    const created = new Date(issue.$createdAt).toISOString().slice(0, 10)
    const bucket = buckets.find((b) => b.date === created)
    if (bucket) {
      bucket.opened++
      if (issue.severity === 'Critical' || issue.severity === 'Blocker') {
        bucket.critical++
      }
    }
  }
  return buckets
}

function CircularProgress({ value, size = 80 }: { value: number; size?: number }) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgb(30 41 59)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#readinessGrad)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-1000 ease-out"
      />
      <defs>
        <linearGradient id="readinessGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function BarChart({ data }: { data: TrendDay[] }) {
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.opened, d.critical)))
  const chartH = 160
  return (
    <div className="flex items-end gap-2 h-full">
      {data.map((day) => {
        const hOpen = (day.opened / maxVal) * chartH
        const hCrit = (day.critical / maxVal) * chartH
        return (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
            <div className="flex flex-col items-center justify-end gap-0.5 w-full" style={{ height: chartH }}>
              <div
                className="w-full max-w-[28px] rounded-t-sm bg-red-500/80 transition-all duration-500"
                style={{ height: Math.max(2, hCrit) }}
                title={`Críticos: ${day.critical}`}
              />
              <div
                className="w-full max-w-[28px] rounded-t-sm bg-cyan-400/70 transition-all duration-500"
                style={{ height: Math.max(2, hOpen) }}
                title={`Abertos: ${day.opened}`}
              />
            </div>
            <span className="text-[10px] text-surface-500 mt-1">{day.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  trend,
  trendUp,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  trend?: string
  trendUp?: boolean
  color: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)] hover:bg-[var(--bg-highlight)] hover:shadow-lg hover:shadow-black/20">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <div className="text-[11px] font-medium tracking-wider text-surface-500 uppercase">
            {label}
          </div>
          <div className="text-2xl font-bold text-surface-100 tracking-tight">{value}</div>
          {sub ? (
            <div className="text-xs text-surface-500">{sub}</div>
          ) : null}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </div>
      </div>
      {trend ? (
        <div className="relative mt-3 flex items-center gap-1.5 text-xs">
          <TrendingUp
            className={`h-3.5 w-3.5 ${trendUp ? 'text-emerald-400' : 'text-red-400'} ${trendUp ? '' : 'rotate-180'}`}
          />
          <span className={trendUp ? 'text-emerald-400' : 'text-red-400'}>{trend}</span>
          <span className="text-surface-600">vs. último mês</span>
        </div>
      ) : null}
    </div>
  )
}

function Badge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    passed: { label: 'Passed', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    failed: { label: 'Failed', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
    blocked: { label: 'Blocked', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    not_run: { label: 'Not Run', cls: 'bg-surface-500/15 text-surface-400 border-surface-500/20' },
    draft: { label: 'Draft', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
    in_progress: { label: 'In Progress', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
    completed: { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-surface-500/15 text-surface-400 border-surface-500/20' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() || '?'
  const colors = ['bg-brand-600/30 text-brand-400', 'bg-emerald-600/30 text-emerald-400', 'bg-cyan-600/30 text-cyan-400', 'bg-amber-600/30 text-amber-400', 'bg-rose-600/30 text-rose-400']
  const colorIdx = name ? name.charCodeAt(0) % colors.length : 0
  return (
    <div
      className={`flex items-center justify-center rounded-full text-xs font-bold ${colors[colorIdx]}`}
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  )
}

export function DashboardPage() {
  const { project } = useProject()
  const [runs, setRuns] = useState<TestRunDoc[]>([])
  const [results, setResults] = useState<RunResultDoc[]>([])
  const [issues, setIssues] = useState<IssueDoc[]>([])
  const [cases, setCases] = useState<TestCaseDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const computed = useMemo(() => {
    const totalRuns = runs.length
    const completedRuns = runs.filter((r) => r.status === 'completed').length
    const inProgressRuns = runs.filter((r) => r.status === 'in_progress').length
    const doneResults = results.filter((r) => r.status !== 'not_run')
    const passed = results.filter((r) => r.status === 'passed').length
    const failed = results.filter((r) => r.status === 'failed').length
    const blocked = results.filter((r) => r.status === 'blocked').length
    const passRate = safePct(passed, passed + failed + blocked)
    const executedCaseIds = new Set(doneResults.map((r) => r.case_id))
    const coverage = safePct(executedCaseIds.size, cases.length)
    const openIssues = issues.filter((i) => i.status === 'open' || i.status === 'in_progress')
    const readiness = runs.length
      ? safePct(completedRuns, totalRuns)
      : 0
    const trendData = buildTrendData(issues, 7)
    return {
      totalRuns,
      completedRuns,
      inProgressRuns,
      passRate,
      coverage,
      passed,
      failed,
      blocked,
      totalCases: cases.length,
      openIssuesCount: openIssues.length,
      trendData,
      readiness,
    }
  }, [runs, results, issues, cases.length])

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
          queries: [Query.equal('project_id', project.$id), Query.limit(500)],
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
      setError(appwriteErrorMessage(e, 'Falha ao carregar Dashboard'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [project?.$id])

  const recentRuns = useMemo(() => runs.slice(0, 5), [runs])

  return (
    <div className="min-h-full space-y-6">
      {/* Header Section */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold text-surface-100 tracking-tight">Dashboard Principal</h2>
          <p className="text-sm text-surface-500 mt-1 max-w-xl">
            Bem-vindo ao centro de controle de qualidade da CTQS. Monitore o progresso da automação e a saúde das suas releases em tempo real.
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] px-4 py-2">
          <span className="text-[10px] font-medium tracking-wider text-surface-500 uppercase">Data do Relatório</span>
          <span className="text-sm font-semibold text-surface-200">{new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
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
              <BarChart3 className="h-8 w-8 text-surface-500" />
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-surface-200">Nenhum projeto selecionado</div>
              <div className="mt-1 text-sm text-surface-500">
                Selecione um projeto acima para ver as métricas de qualidade.
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-24">
            <Clock className="h-6 w-6 text-surface-500 animate-pulse" />
          </div>
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                icon={<TestTube className="h-5 w-5 text-cyan-400" />}
                color="bg-cyan-500/10"
                label="Total de Testes"
                value={computed.totalCases.toString()}
                sub={`${computed.coverage}% cobertura`}
                trend={`+${computed.totalRuns} runs`}
                trendUp
              />
              <KpiCard
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                color="bg-emerald-500/10"
                label="% Sucesso"
                value={`${computed.passRate}%`}
                sub={`${computed.passed} passed · ${computed.failed} failed · ${computed.blocked} blocked`}
                trend={computed.passRate >= 80 ? 'Estável' : 'Atenção'}
                trendUp={computed.passRate >= 80}
              />
              <KpiCard
                icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
                color="bg-amber-500/10"
                label="Bugs Abertos"
                value={computed.openIssuesCount.toString()}
                sub="issues em aberto ou em progresso"
                trend={computed.openIssuesCount > 0 ? `${computed.openIssuesCount} pendentes` : 'Zero bugs'}
                trendUp={computed.openIssuesCount === 0}
              />
              <div className="group relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)] hover:bg-[var(--bg-highlight)] hover:shadow-lg hover:shadow-black/20">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="text-[11px] font-medium tracking-wider text-surface-500 uppercase">
                    Release Readiness
                  </div>
                  <div className="mt-3 flex items-end gap-4">
                    <div className="relative">
                      <CircularProgress value={computed.readiness} size={80} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-surface-100">{computed.readiness}%</span>
                      </div>
                    </div>
                    <div className="space-y-1 pb-1">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="text-surface-400">{computed.completedRuns} completed</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="h-2 w-2 rounded-full bg-cyan-400" />
                        <span className="text-surface-400">{computed.inProgressRuns} in progress</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="h-2 w-2 rounded-full bg-surface-600" />
                        <span className="text-surface-400">{computed.totalRuns} total runs</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Defect Trends */}
              <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 lg:col-span-2 transition-all duration-300 hover:border-[var(--border-hover)]">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-sm font-semibold text-surface-100">Tendências de Defeitos</div>
                      <div className="text-xs text-surface-500 mt-0.5">Últimos 7 dias</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-sm bg-cyan-400/70" />
                        <span className="text-surface-400">Abertos</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-sm bg-red-500/80" />
                        <span className="text-surface-400">Críticos</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-[180px]">
                    <BarChart data={computed.trendData} />
                  </div>
                </div>
              </div>

              {/* Infra Status */}
              <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)] group">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-emerald-500/[0.03] pointer-events-none" />
                <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-cyan-500/[0.04] blur-3xl pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-4">
                    <Server className="h-4 w-4 text-cyan-400" />
                    <div className="text-sm font-semibold text-surface-100">Status de Infra</div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Database className="h-4 w-4 text-surface-500" />
                        <span className="text-sm text-surface-300">API Latency</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-sm font-semibold text-emerald-400">24ms</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Database className="h-4 w-4 text-surface-500" />
                        <span className="text-sm text-surface-300">DB Query</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-sm font-semibold text-emerald-400">12ms</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Activity className="h-4 w-4 text-surface-500" />
                        <span className="text-sm text-surface-300">Cache Hit</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        <span className="text-sm font-semibold text-cyan-400">98.5%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Users className="h-4 w-4 text-surface-500" />
                        <span className="text-sm text-surface-300">Uptime</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-sm font-semibold text-emerald-400">99.9%</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg bg-[var(--bg-highlight-subtle)] border border-[var(--border-glass)] px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-surface-500">Todos os sistemas</span>
                      <span className="text-emerald-400 font-medium">Operational</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Executions Table */}
            <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl transition-all duration-300 hover:border-[var(--border-hover)]">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <div>
                    <div className="text-sm font-semibold text-surface-100">Execuções Recentes</div>
                    <div className="text-xs text-surface-500 mt-0.5">Últimas {recentRuns.length} runs</div>
                  </div>
                  <Link
                    to="/execution"
                    className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] px-3 py-2 text-xs text-surface-400 hover:text-surface-200 hover:border-[var(--border-hover)] transition-all"
                  >
                    Ver todas
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-[var(--border-glass)]">
                        <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Run</th>
                        <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Status</th>
                        <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Progresso</th>
                        <th className="px-5 py-3 text-left text-[11px] font-medium tracking-wider text-surface-500 uppercase">Responsável</th>
                        <th className="px-5 py-3 text-right text-[11px] font-medium tracking-wider text-surface-500 uppercase">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {recentRuns.map((run) => {
                        const runResults = results.filter((r) => r.run_id === run.$id)
                        const done = runResults.filter((r) => r.status !== 'not_run').length
                        const pct = runResults.length ? Math.round((done / runResults.length) * 100) : 0
                        return (
                          <tr key={run.$id} className="group/row transition-colors hover:bg-[var(--bg-highlight-subtle)]">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/10 text-brand-400">
                                  <TestTube className="h-4 w-4" />
                                </div>
                                <div>
                                  <div className="font-medium text-surface-200">{run.title}</div>
                                  <div className="text-xs text-surface-500 mt-0.5">{run.$id.slice(0, 8)}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <Badge status={run.status} />
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-[var(--bg-glass-high)] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-surface-400 min-w-[32px] text-right">{pct}%</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <Avatar name={'DEV'} size={26} />
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <Link
                                to={`/execution/${run.$id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-glass)] px-2.5 py-1.5 text-xs text-surface-400 hover:text-surface-200 hover:border-[var(--border-hover)] transition-all opacity-0 group-hover/row:opacity-100"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Visualizar
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                      {!recentRuns.length ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-sm text-surface-500">
                            Nenhuma execução encontrada.
                          </td>
                        </tr>
                      ) : null}
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
