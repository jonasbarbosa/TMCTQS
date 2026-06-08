import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  Pause,
  Play,
  Square,
  Terminal,
  X,
  XCircle,
  AlertOctagon,
  ArrowLeft,
  Timer,
  History,
  type LucideIcon,
} from 'lucide-react'
import { databases, Query } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type {
  EnvironmentDoc,
  RunResultDoc,
  TestCaseDoc,
  TestRunDoc,
  Priority,
} from '../lib/model'
import { decodeStepResults, decodeSteps } from '../lib/steps'
import { useProject } from '../lib/project'
import { useAuth } from '../auth/auth'

type FilterStatus = 'all' | 'not_run' | 'passed' | 'failed' | 'blocked'

type ConsoleEntry = {
  ts: string
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | 'LIVE' | 'SYSTEM'
  message: string
  highlight?: boolean
  debug?: boolean
}

function calcProgress(results: RunResultDoc[]) {
  if (!results.length) return { pct: 0, passed: 0, failed: 0, blocked: 0, pending: 0 }
  const total = results.length
  const passed = results.filter((r) => r.status === 'passed').length
  const failed = results.filter((r) => r.status === 'failed').length
  const blocked = results.filter((r) => r.status === 'blocked').length
  const pending = results.filter((r) => r.status === 'not_run').length
  const done = passed + failed + blocked
  const pct = Math.round((done / total) * 100)
  return { pct, passed, failed, blocked, pending }
}

function formatExecutionId(id: string): string {
  return id.length > 6 ? `#QR-${id.slice(-4).toUpperCase()}` : `#QR-${id}`
}

function formatElapsed(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '00:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function formatEta(ms: number): string {
  if (ms <= 0) return 'concluído'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s restantes` : `${s}s restantes`
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function TestRunPage() {
  const { project } = useProject()
  const { user } = useAuth()
  const params = useParams()
  const runId = params.runId ?? ''

  const [run, setRun] = useState<TestRunDoc | null>(null)
  const [results, setResults] = useState<RunResultDoc[]>([])
  const [casesById, setCasesById] = useState<Record<string, TestCaseDoc>>({})
  const [env, setEnv] = useState<EnvironmentDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(true)

  // Live timer (1Hz)
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (run?.status !== 'in_progress') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [run?.status])

  const stats = useMemo(() => calcProgress(results), [results])

  const filteredResults = useMemo(() => {
    return results.filter((r) => statusFilter === 'all' || r.status === statusFilter)
  }, [results, statusFilter])

  async function load() {
    if (!project || !runId) return
    setError(null)
    try {
      const [runDoc, rrRes, caseRes] = await Promise.all([
        databases.getDocument<TestRunDoc>(DATABASE_ID, COLLECTION_IDS.testRuns, runId),
        databases.listDocuments<RunResultDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.runResults,
          queries: [
            Query.equal('project_id', project.$id),
            Query.equal('run_id', runId),
            Query.orderAsc('$createdAt'),
            Query.limit(500),
          ],
        }),
        databases.listDocuments<TestCaseDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testCases,
          queries: [Query.equal('project_id', project.$id), Query.limit(500)],
        }),
      ])

      const byId: Record<string, TestCaseDoc> = {}
      for (const c of caseRes.documents) byId[c.$id] = c

      setRun(runDoc)
      setResults(rrRes.documents)
      setCasesById(byId)

      try {
        const envDoc = await databases.getDocument<EnvironmentDoc>(
          DATABASE_ID,
          COLLECTION_IDS.environments,
          runDoc.environment_id,
        )
        setEnv(envDoc)
      } catch {
        setEnv(null)
      }
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Test Run'))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.$id, runId])

  async function setRunStatus(status: TestRunDoc['status']) {
    if (!run) return
    setError(null)
    try {
      const now = new Date().toISOString()
      const patch: Partial<TestRunDoc> = { status }
      if (status === 'in_progress') {
        patch.started_at = now
        if (user?.$id) patch.executed_by = user.$id
      } else if (status === 'completed') {
        patch.finished_at = now
      } else if (status === 'draft') {
        patch.started_at = null
        patch.finished_at = null
      }
      await databases.updateDocument(DATABASE_ID, COLLECTION_IDS.testRuns, run.$id, patch)
      setRun({ ...run, ...patch })
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao atualizar status da Run'))
    }
  }

  async function setCaseStatus(caseId: string, status: RunResultDoc['status']) {
    const rr = results.find((r) => r.case_id === caseId)
    if (!rr || !run) return
    setError(null)
    try {
      const patch: Partial<RunResultDoc> = { status }
      const now = new Date().toISOString()
      if (status === 'not_run') {
        patch.started_at = null
        patch.finished_at = null
      } else {
        if (!rr.started_at) patch.started_at = now
        patch.finished_at = now
      }
      await databases.updateDocument(DATABASE_ID, COLLECTION_IDS.runResults, rr.$id, patch)

      const nextResults = results.map((r) =>
        r.$id === rr.$id ? { ...r, ...patch } : r,
      )
      const next = calcProgress(nextResults)
      const runStatus: TestRunDoc['status'] = next.pct === 100 ? 'completed' : 'in_progress'
      const runPatch: Partial<TestRunDoc> = {
        status: runStatus,
        progress_percentage: next.pct,
      }
      if (runStatus === 'in_progress' && !run.started_at) {
        runPatch.started_at = new Date().toISOString()
        if (user?.$id) runPatch.executed_by = user.$id
      }
      if (runStatus === 'completed' && !run.finished_at) {
        runPatch.finished_at = new Date().toISOString()
      }
      await databases.updateDocument(DATABASE_ID, COLLECTION_IDS.testRuns, run.$id, runPatch)

      setResults(nextResults)
      setRun({ ...run, ...runPatch })
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao atualizar status'))
    }
  }

  async function setStepResult(caseId: string, stepIndex: number, status: 'passed' | 'failed' | 'skipped') {
    const rr = results.find((r) => r.case_id === caseId)
    const tc = casesById[caseId]
    if (!rr || !tc || !run) return
    setError(null)
    const current = decodeStepResults(rr.step_results)
    const steps = decodeSteps(tc.steps)
    const next = Array.from({ length: steps.length }).map((_, idx) =>
      current[idx] ?? { status: 'skipped' as const },
    )
    next[stepIndex] = { ...next[stepIndex], status }
    try {
      const encoded = JSON.stringify(next)
      await databases.updateDocument(DATABASE_ID, COLLECTION_IDS.runResults, rr.$id, {
        step_results: encoded,
      })
      setResults((rs) => rs.map((r) => (r.$id === rr.$id ? { ...r, step_results: encoded } : r)))
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao atualizar Step'))
    }
  }

  // Derived timing
  const startedAt = run?.started_at ? new Date(run.started_at).getTime() : null
  const finishedAt = run?.finished_at ? new Date(run.finished_at).getTime() : null
  const elapsedMs =
    startedAt != null ? (finishedAt ?? now) - startedAt : 0
  const isRunning = run?.status === 'in_progress' && startedAt != null
  const etaMs = useMemo(() => {
    if (!isRunning || stats.pct === 0) return 0
    if (stats.pct >= 100) return 0
    const totalEstimated = (elapsedMs / stats.pct) * 100
    return Math.max(0, totalEstimated - elapsedMs)
  }, [isRunning, elapsedMs, stats.pct])

  // Console log synthesizer
  const logEntries = useMemo<ConsoleEntry[]>(() => {
    const entries: ConsoleEntry[] = []
    if (run?.$createdAt) {
      entries.push({
        ts: hhmm(run.$createdAt),
        level: 'SYSTEM',
        message: `Run "${run.title}" criada · ID ${formatExecutionId(run.$id)}`,
      })
    }
    if (run?.scheduled_at) {
      entries.push({
        ts: hhmm(run.scheduled_at),
        level: 'INFO',
        message: `Run agendada para ${new Date(run.scheduled_at).toLocaleString('pt-BR')}`,
      })
    }
    if (run?.started_at) {
      const who = run.executed_by ? ` por ${shortId(run.executed_by)}` : ''
      entries.push({
        ts: hhmm(run.started_at),
        level: 'LIVE',
        message: `Execução iniciada${who}`,
      })
    }
    for (const r of results) {
      const tc = casesById[r.case_id]
      const code = tc ? `TC-${tc.$id.slice(-4)}` : r.case_id
      if (r.started_at && r.status !== 'not_run') {
        entries.push({
          ts: hhmm(r.started_at),
          level: 'DEBUG',
          message: `${code} em execução: ${tc?.title ?? '—'}`,
          debug: true,
        })
      }
      if (r.finished_at && r.status === 'passed') {
        entries.push({
          ts: hhmm(r.finished_at),
          level: 'INFO',
          message: `${code} → SUCESSO · ${tc?.title ?? '—'}`,
        })
      } else if (r.finished_at && r.status === 'failed') {
        entries.push({
          ts: hhmm(r.finished_at),
          level: 'ERROR',
          message: `${code} → FALHA · ${tc?.title ?? '—'}${r.actual_result ? ' — ' + r.actual_result : ''}`,
          highlight: true,
        })
      } else if (r.finished_at && r.status === 'blocked') {
        entries.push({
          ts: hhmm(r.finished_at),
          level: 'WARN',
          message: `${code} → BLOQUEADO · ${tc?.title ?? '—'}`,
        })
      }
    }
    if (run?.finished_at) {
      entries.push({
        ts: hhmm(run.finished_at),
        level: 'LIVE',
        message: `Execução finalizada · ${stats.pct}% concluído (${stats.passed}✓ / ${stats.failed}✗ / ${stats.blocked}⊘)`,
      })
    }
    return entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.$id, run?.$createdAt, run?.started_at, run?.finished_at, run?.title, results, casesById])

  if (!project) {
    return (
      <div className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-panel)] p-4 backdrop-blur-xl">
        <div className="text-sm font-semibold text-surface-100">Test Run</div>
        <div className="mt-2 text-sm text-surface-300">
          Selecione um <span className="font-semibold">Project</span>.
        </div>
        <Link
          to="/projects"
          className="mt-4 inline-flex rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
        >
          Abrir Projects
        </Link>
      </div>
    )
  }

  if (!runId) {
    return (
      <div className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-panel)] p-4 backdrop-blur-xl">
        <div className="text-sm font-semibold text-surface-100">Test Run</div>
        <div className="mt-2 text-sm text-surface-300">Run inválida.</div>
        <Link
          to="/runs"
          className="mt-4 inline-flex rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
        >
          Voltar para Execuções
        </Link>
      </div>
    )
  }

  const statusLabel =
    run?.status === 'in_progress'
      ? 'EXECUTANDO'
      : run?.status === 'completed'
        ? 'CONCLUÍDA'
        : 'RASCUNHO'
  const statusColor =
    run?.status === 'in_progress'
      ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'
      : run?.status === 'completed'
        ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
        : 'text-surface-400 border-[var(--border-glass)] bg-[var(--bg-highlight)]'
  const pulseColor = run?.status === 'in_progress' ? 'bg-cyan-400' : 'bg-surface-500'

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-surface-500">
        <Link to="/projects" className="hover:text-surface-200 transition-colors">Projects</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to="/runs" className="hover:text-surface-200 transition-colors">Execuções</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-surface-200">Run {runId.slice(-6)}</span>
      </nav>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      {/* LIVE SESSION Header (Stitch) */}
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] border-l-4 border-l-cyan-500 bg-[var(--bg-panel)] backdrop-blur-xl p-5">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1.5">
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusColor}`}
              >
                {run?.status === 'in_progress' ? 'LIVE SESSION' : run?.status === 'completed' ? 'CLOSED' : 'DRAFT'}
              </span>
              <h2 className="text-xl font-bold text-surface-100 truncate">
                {run?.title || 'Test Run'}
              </h2>
              <span className="font-mono text-[11px] text-cyan-400">
                {formatExecutionId(runId)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className={`h-2 w-2 rounded-full ${pulseColor} ${isRunning ? 'animate-pulse' : ''}`} />
              <span className={`font-bold uppercase tracking-widest text-[10px] ${statusColor.split(' ')[0]}`}>
                {statusLabel}
              </span>
              {run?.started_at ? (
                <span className="text-surface-500">
                  · Iniciado por{' '}
                  <span className="font-medium text-surface-200">
                    {run.executed_by ? shortId(run.executed_by) : 'AutoBot_System'}
                  </span>
                </span>
              ) : (
                <span className="text-surface-500">· Aguardando início</span>
              )}
              {env ? (
                <span className="text-surface-500">
                  · Ambiente: <span className="font-medium text-surface-200">{env.name}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/runs"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-panel)] px-3 py-2 text-xs font-semibold text-surface-100 transition-all hover:border-[var(--border-hover)] backdrop-blur-xl"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </Link>
            <Link
              to="/reports"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-panel)] px-3 py-2 text-xs font-semibold text-surface-100 transition-all hover:border-[var(--border-hover)] backdrop-blur-xl"
            >
              <History className="h-3.5 w-3.5" /> Histórico
            </Link>
            {run?.status === 'draft' || run?.status === 'completed' ? (
              <button
                type="button"
                onClick={() => setRunStatus('in_progress')}
                disabled={!run}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-400 transition-all hover:bg-cyan-500/20"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {run?.status === 'completed' ? 'REINICIAR' : 'INICIAR'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setRunStatus('draft')}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-panel)] px-3 py-2 text-xs font-bold text-surface-200 transition-all hover:bg-[var(--bg-highlight)]"
                >
                  <Pause className="h-3.5 w-3.5" /> PAUSAR
                </button>
                <button
                  type="button"
                  onClick={() => setRunStatus('completed')}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-400 transition-all hover:bg-rose-500/20"
                >
                  <Square className="h-3.5 w-3.5 fill-current" /> INTERROMPER
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3 Metric Cards (Stitch) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Progresso Global */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-cyan-500/30">
            <div
              className="h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-all duration-700"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
          <div className="relative p-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-surface-500">
                Progresso Global
              </span>
              <Activity className="h-4 w-4 text-cyan-400 opacity-60" />
            </div>
            <div className="text-3xl font-black text-cyan-400 leading-none">
              {stats.pct}%
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-highlight)]">
              <div
                className="h-full bg-cyan-400 transition-all duration-700"
                style={{ width: `${stats.pct}%` }}
              />
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-widest text-surface-500">
              {stats.passed + stats.failed + stats.blocked}/{results.length} casos
            </div>
          </div>
        </div>

        {/* Status das Suítes */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl border-t-2 border-t-emerald-500">
          <div className="relative p-5">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-surface-500">
                Status dos Casos
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400 opacity-50" />
            </div>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-4xl font-black text-emerald-400 leading-none">
                  {stats.passed}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mt-1">
                  SUCESSOS
                </div>
              </div>
              <div className="mb-0.5 flex items-end gap-3">
                <div>
                  <div className="text-2xl font-bold text-rose-400 leading-none">
                    {stats.failed}
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-rose-400 mt-0.5">
                    FALHAS
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-400 leading-none">
                    {stats.blocked}
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400 mt-0.5">
                    BLOQ
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tempo Decorrido */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl border-t-2 border-t-amber-500">
          <div className="relative p-5">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-surface-500">
                Tempo Decorrido
              </span>
              <Timer className="h-4 w-4 text-amber-400 opacity-50" />
            </div>
            <div className="font-mono text-4xl font-black text-surface-100 leading-none tabular-nums">
              {formatElapsed(elapsedMs)}
            </div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">
              {isRunning
                ? stats.pct > 0
                  ? `ETA: ${formatEta(etaMs)}`
                  : 'ETA: calculando...'
                : run?.status === 'completed'
                  ? 'Execução finalizada'
                  : 'Aguardando início'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: Tabela + Console Log (Stitch) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Lista de Casos de Teste */}
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl xl:col-span-2">
          <div className="flex items-center justify-between border-b border-[var(--border-glass)] px-5 py-3.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-surface-500">
              Lista de Casos de Teste
            </h3>
            <div className="flex items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
                className="appearance-none rounded-md border border-[var(--border-glass)] bg-[var(--bg-input)] px-2.5 py-1.5 pr-7 text-[11px] font-bold uppercase tracking-widest text-surface-200 outline-none"
              >
                <option value="all">Todos</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="blocked">Blocked</option>
                <option value="not_run">Pending</option>
              </select>
              <div className="flex gap-1.5">
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  PASS {String(stats.passed).padStart(2, '0')}
                </span>
                <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                  FAIL {String(stats.failed).padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>

          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[var(--bg-lowest)]/95 backdrop-blur-sm">
                <tr>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-surface-500 border-b border-[var(--border-glass)]">
                    ID
                  </th>
                  <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-surface-500 border-b border-[var(--border-glass)]">
                    NAME
                  </th>
                  <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-surface-500 border-b border-[var(--border-glass)]">
                    STATUS
                  </th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-surface-500 border-b border-[var(--border-glass)] text-right">
                    AÇÃO
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-glass)]/50">
                {filteredResults.map((r) => {
                  const tc = casesById[r.case_id]
                  const code = tc ? `TC-${tc.$id.slice(-4)}` : r.case_id
                  const isExpanded = expandedCaseId === r.case_id
                  return (
                    <CaseRow
                      key={r.$id}
                      r={r}
                      tc={tc}
                      code={code}
                      expanded={isExpanded}
                      onToggle={() => setExpandedCaseId(isExpanded ? null : r.case_id)}
                      onCaseStatus={(s) => setCaseStatus(r.case_id, s)}
                      onStepResult={(idx, s) => setStepResult(r.case_id, idx, s)}
                    />
                  )
                })}
                {!filteredResults.length ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-xs text-surface-500">
                      {results.length ? 'Nenhum caso com esse filtro.' : 'Nenhum caso na Run.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Console Log */}
        <ConsoleLogPanel
          entries={logEntries}
          open={logOpen}
          onToggle={() => setLogOpen((v) => !v)}
        />
      </div>
    </div>
  )
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

function CaseRow({
  r,
  tc,
  code,
  expanded,
  onToggle,
  onCaseStatus,
  onStepResult,
}: {
  r: RunResultDoc
  tc: TestCaseDoc | undefined
  code: string
  expanded: boolean
  onToggle: () => void
  onCaseStatus: (s: RunResultDoc['status']) => void
  onStepResult: (idx: number, s: 'passed' | 'failed' | 'skipped') => void
}) {
  const steps = tc ? decodeSteps(tc.steps) : []
  const stepResults = decodeStepResults(r.step_results)

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors hover:bg-[var(--bg-highlight)] ${
          expanded ? 'bg-[var(--bg-highlight)]' : ''
        }`}
      >
        <td className="px-5 py-3 font-mono text-xs text-cyan-400 align-top">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-surface-500" />
            ) : (
              <ChevronRight className="h-3 w-3 text-surface-500" />
            )}
            {code}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className={`text-sm font-medium ${r.status === 'not_run' ? 'text-surface-400' : 'text-surface-100'}`}>
            {tc?.title ?? r.case_id}
          </div>
          {tc ? (
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-surface-500">
              <PriorityBadge priority={tc.priority} />
              <span>· {tc.severity}</span>
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3 align-top">
          <StatusBadge status={r.status} />
        </td>
        <td className="px-5 py-3 text-right align-top">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {r.status !== 'passed' ? (
              <IconBtn
                onClick={() => onCaseStatus('passed')}
                title="Marcar como Passed"
                className="hover:bg-emerald-500/10 hover:text-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </IconBtn>
            ) : null}
            {r.status !== 'failed' ? (
              <IconBtn
                onClick={() => onCaseStatus('failed')}
                title="Marcar como Failed"
                className="hover:bg-rose-500/10 hover:text-rose-400"
              >
                <XCircle className="h-3.5 w-3.5" />
              </IconBtn>
            ) : null}
            {r.status !== 'blocked' ? (
              <IconBtn
                onClick={() => onCaseStatus('blocked')}
                title="Marcar como Blocked"
                className="hover:bg-amber-500/10 hover:text-amber-400"
              >
                <AlertOctagon className="h-3.5 w-3.5" />
              </IconBtn>
            ) : null}
            {r.status !== 'not_run' ? (
              <IconBtn
                onClick={() => onCaseStatus('not_run')}
                title="Resetar para Pendente"
                className="hover:bg-[var(--bg-highlight)] hover:text-surface-200"
              >
                <Clock className="h-3.5 w-3.5" />
              </IconBtn>
            ) : null}
          </div>
        </td>
      </tr>
      {expanded && tc ? (
        <tr className="bg-[var(--bg-input)]/40">
          <td colSpan={4} className="px-5 py-4 border-b border-[var(--border-glass)]">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-1 space-y-2 text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500">Pré-condições</div>
                  <div className="mt-1 text-surface-300">{tc.pre_conditions || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500">Pós-condições</div>
                  <div className="mt-1 text-surface-300">{tc.post_conditions || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500">Severidade</div>
                  <div className="mt-1 text-surface-300">{tc.severity} · {tc.priority}</div>
                </div>
              </div>
              <div className="lg:col-span-2 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500">Passos</div>
                {steps.length ? (
                  steps.map((s, idx) => {
                    const sr = stepResults[idx]?.status ?? 'skipped'
                    return (
                      <div
                        key={idx}
                        className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-panel)] p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-surface-500">
                              Step {idx + 1}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-surface-100 break-words">
                              {s.action}
                            </div>
                            <div className="mt-1 text-[11px] text-surface-400 break-words">
                              Esperado: {s.expected_result}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-surface-500">
                              {sr}
                            </span>
                            <StepBtn
                              active={sr === 'passed'}
                              onClick={() => onStepResult(idx, 'passed')}
                              variant="emerald"
                            >
                              Pass
                            </StepBtn>
                            <StepBtn
                              active={sr === 'failed'}
                              onClick={() => onStepResult(idx, 'failed')}
                              variant="rose"
                            >
                              Fail
                            </StepBtn>
                            <StepBtn
                              active={sr === 'skipped'}
                              onClick={() => onStepResult(idx, 'skipped')}
                              variant="slate"
                            >
                              Skip
                            </StepBtn>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-xs text-surface-500">Sem passos cadastrados.</div>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}

function IconBtn({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1.5 text-surface-500 transition-all ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

function StepBtn({
  active,
  onClick,
  variant,
  children,
}: {
  active: boolean
  onClick: () => void
  variant: 'emerald' | 'rose' | 'slate'
  children: React.ReactNode
}) {
  const cls =
    variant === 'emerald'
      ? active
        ? 'bg-emerald-600 text-white'
        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
      : variant === 'rose'
        ? active
          ? 'bg-rose-600 text-white'
          : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
        : active
          ? 'bg-slate-600 text-white'
          : 'bg-[var(--bg-highlight)] text-surface-300 hover:bg-[var(--bg-highlight-subtle)]'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${cls}`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: RunResultDoc['status'] }) {
  const map: Record<RunResultDoc['status'], { icon: LucideIcon; label: string; cls: string }> = {
    not_run: {
      icon: Clock,
      label: 'PENDENTE',
      cls: 'text-surface-500',
    },
    passed: {
      icon: CheckCircle2,
      label: 'SUCESSO',
      cls: 'text-emerald-400',
    },
    failed: {
      icon: XCircle,
      label: 'FALHA',
      cls: 'text-rose-400',
    },
    blocked: {
      icon: AlertOctagon,
      label: 'BLOQUEADO',
      cls: 'text-amber-400',
    },
  }
  const { icon: Icon, label, cls } = map[status]
  return (
    <div className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const map: Record<Priority, { label: string; cls: string }> = {
    P0: { label: 'P0', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    P1: { label: 'P1', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
    P2: { label: 'P2', cls: 'bg-[var(--bg-highlight)] text-surface-300 border-[var(--border-glass)]' },
    P3: { label: 'P3', cls: 'bg-[var(--bg-highlight)] text-surface-500 border-[var(--border-glass)]' },
  }
  const v = map[priority]
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold ${v.cls}`}
    >
      {v.label}
    </span>
  )
}

function ConsoleLogPanel({
  entries,
  open,
  onToggle,
}: {
  entries: ConsoleEntry[]
  open: boolean
  onToggle: () => void
}) {
  const [copied, setCopied] = useState(false)

  const scenarioEntries = useMemo(
    () => entries.filter((e) => !e.debug && !e.level.startsWith('DEBUG')),
    [entries],
  )

  function handleCopy() {
    const lines = scenarioEntries
      .filter((e) => e.level === 'INFO' || e.level === 'ERROR' || e.level === 'WARN')
    if (!lines.length) return
    const pad = String(lines.length).length
    const text = lines
      .map((e, i) => {
        const icon = e.level === 'INFO' ? '✅' : e.level === 'ERROR' ? '❌' : '⊘'
        const num = String(i + 1).padStart(pad, ' ')
        return `${num}. ${icon} ${e.message.replace(/.*→ /, '')}`
      })
      .join('\n')
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-lowest)] flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-glass)] bg-[var(--bg-highest)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-cyan-400" />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-surface-300">
            Console Log
          </h3>
          <span className="text-[10px] text-surface-500">({scenarioEntries.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            title="Copiar cenários executados"
            className="rounded p-1 text-surface-500 transition-all hover:bg-[var(--bg-highlight)] hover:text-surface-200"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onToggle}
            title={open ? 'Fechar painel' : 'Expandir'}
            className="rounded p-1 text-surface-500 transition-all hover:bg-[var(--bg-highlight)] hover:text-surface-200"
          >
            {open ? <X className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="font-mono text-[11px] leading-relaxed overflow-y-auto p-4 space-y-1 max-h-[520px]">
          {scenarioEntries.length ? (
            scenarioEntries.map((e, idx) => <LogLine key={idx} e={e} />)
          ) : (
            <div className="text-surface-500">Aguardando execução dos cenários...</div>
          )}
          {scenarioEntries.length > 0 ? (
            <div className="pt-1 text-cyan-400">
              <span className="animate-pulse">▌</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-4 py-3 text-[11px] text-surface-500">Console oculto.</div>
      )}
    </div>
  )
}

function LogLine({ e }: { e: ConsoleEntry }) {
  const isError = e.level === 'ERROR'
  const isWarn = e.level === 'WARN'
  const isSuccess = e.level === 'INFO'
  const isLive = e.level === 'LIVE'
  let icon: string | null = null
  if (isSuccess) icon = '✅'
  else if (isError) icon = '❌'
  else if (isWarn) icon = '⊘'

  return (
    <div
      className={`flex items-start gap-1.5 ${
        e.highlight ? 'rounded bg-rose-500/10 -mx-1 px-1 py-0.5' : ''
      } ${isLive ? 'text-cyan-300' : isError ? 'text-rose-300' : isWarn ? 'text-amber-300' : 'text-surface-400'}`}
    >
      {icon ? <span className="shrink-0 text-xs leading-none">{icon}</span> : null}
      {isLive || e.level === 'SYSTEM' ? (
        <span className="shrink-0 text-[10px] text-surface-500">{e.message}</span>
      ) : (
        <span className="break-words text-[12px]">{e.message.replace(/.*→ /, '')}</span>
      )}
    </div>
  )
}

// No-op placeholder to silence unused import warnings in some toolchains.
export const __TestRunPage_LoaderIcon = Loader2
