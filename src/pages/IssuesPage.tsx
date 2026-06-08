import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { databases, ID, Query, storage, teamDocPermissions } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { BUCKET_IDS, COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type { IssueDoc, IssueStatus, Severity, TestCaseDoc, TestRunDoc } from '../lib/model'
import { useAuth } from '../auth/auth'
import { useProject } from '../lib/project'
import { Bug, Plus, X } from 'lucide-react'

const severityOptions: Severity[] = ['Blocker', 'Critical', 'High', 'Medium', 'Low']
const statusOptions: IssueStatus[] = ['open', 'in_progress', 'resolved', 'validated', 'closed']

const statusLabels: Record<IssueStatus, string> = {
  open: 'Novo',
  in_progress: 'Em Análise',
  resolved: 'Corrigido',
  validated: 'Validado',
  closed: 'Fechado',
}

const statusColors: Record<IssueStatus, string> = {
  open: 'border-t-cyan-400',
  in_progress: 'border-t-amber-400',
  resolved: 'border-t-blue-400',
  validated: 'border-t-emerald-400',
  closed: 'border-t-surface-600',
}

const columnGradients: Record<IssueStatus, string> = {
  open: 'from-cyan-500/[0.04]',
  in_progress: 'from-amber-500/[0.04]',
  resolved: 'from-blue-500/[0.04]',
  validated: 'from-emerald-500/[0.04]',
  closed: 'from-surface-500/[0.03]',
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, { label: string; cls: string }> = {
    Blocker: { label: 'Blocker', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
    Critical: { label: 'Critical', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
    High: { label: 'High', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
    Medium: { label: 'Medium', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    Low: { label: 'Low', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  }
  const s = map[severity]
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

export function IssuesPage() {
  const { user } = useAuth()
  const { project } = useProject()
  const [issues, setIssues] = useState<IssueDoc[]>([])
  const [runs, setRuns] = useState<TestRunDoc[]>([])
  const [cases, setCases] = useState<TestCaseDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('Medium')
  const [status, setStatus] = useState<IssueStatus>('open')
  const [runId, setRunId] = useState('')
  const [caseId, setCaseId] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [busy, setBusy] = useState(false)

  const casesById = useMemo(() => {
    const out: Record<string, TestCaseDoc> = {}
    for (const c of cases) out[c.$id] = c
    return out
  }, [cases])

  const grouped = useMemo(() => {
    const groups: Record<IssueStatus, IssueDoc[]> = {
      open: [],
      in_progress: [],
      resolved: [],
      validated: [],
      closed: [],
    }
    for (const issue of issues) {
      if (groups[issue.status]) {
        groups[issue.status].push(issue)
      } else {
        groups.open.push(issue)
      }
    }
    return groups
  }, [issues])

  async function loadAll() {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const [issueRes, runRes, caseRes] = await Promise.all([
        databases.listDocuments<IssueDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.issues,
          queries: [
            Query.equal('project_id', project.$id),
            Query.orderDesc('$createdAt'),
            Query.limit(50),
          ],
        }),
        databases.listDocuments<TestRunDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testRuns,
          queries: [
            Query.equal('project_id', project.$id),
            Query.orderDesc('$createdAt'),
            Query.limit(50),
          ],
        }),
        databases.listDocuments<TestCaseDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testCases,
          queries: [
            Query.equal('project_id', project.$id),
            Query.orderDesc('$createdAt'),
            Query.limit(200),
          ],
        }),
      ])
      setIssues(issueRes.documents)
      setRuns(runRes.documents)
      setCases(caseRes.documents)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Issues'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [project?.$id])

  async function createIssue() {
    if (!project) return
    const t = title.trim()
    if (!t) return

    setBusy(true)
    setError(null)
    try {
      const uploadedIds: string[] = []

      if (files?.length) {
        for (const f of Array.from(files)) {
          const res = await storage.createFile(
            BUCKET_IDS.issueEvidences,
            ID.unique(),
            f,
            teamDocPermissions(project.team_id, user?.$id),
          )
          uploadedIds.push(res.$id)
        }
      }

      await databases.createDocument<IssueDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.issues,
        documentId: ID.unique(),
        data: {
          project_id: project.$id,
          title: t,
          description: description.trim() || undefined,
          severity,
          status,
          run_id: runId || undefined,
          case_id: caseId || undefined,
          evidence_file_ids: uploadedIds.length ? uploadedIds : undefined,
        },
        permissions: teamDocPermissions(project.team_id, user?.$id),
      })

      setTitle('')
      setDescription('')
      setSeverity('Medium')
      setStatus('open')
      setRunId('')
      setCaseId('')
      setFiles(null)
      setShowForm(false)
      await loadAll()
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar Issue'))
    } finally {
      setBusy(false)
    }
  }

  if (!project) {
    return (
      <div className="rounded-lg border border-surface-800 bg-surface-900/50 p-4">
        <div className="text-sm font-semibold">Issues</div>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-surface-100">Quadro de Defeitos</div>
          <div className="mt-1 text-sm text-surface-500">
            {issues.length} issues — {issues.filter((i) => i.status === 'open' || i.status === 'in_progress').length} ativas
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-panel)] px-3 py-2 text-xs text-surface-400 hover:text-surface-200 hover:border-[var(--border-hover)] transition-all"
            onClick={() => loadAll()}
            disabled={loading}
          >
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 transition-all"
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? 'Fechar' : 'Nova Issue'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {/* New Issue Form */}
      {showForm ? (
        <div className="rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl p-5">
          <div className="text-sm font-semibold text-surface-100 mb-4">Nova Issue</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <input
                className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-lowest)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-brand-600/50"
                placeholder="Título da issue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <textarea
                className="h-20 w-full resize-none rounded-lg border border-[var(--border-glass)] bg-[var(--bg-lowest)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 outline-none focus:border-brand-600/50"
                placeholder="Descrição (opcional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-surface-500 mb-1">Severity</label>
              <select
                className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-lowest)] px-3 py-2 text-sm text-surface-200 outline-none focus:border-brand-600/50"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
              >
                {severityOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-500 mb-1">Status</label>
              <select
                className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-lowest)] px-3 py-2 text-sm text-surface-200 outline-none focus:border-brand-600/50"
                value={status}
                onChange={(e) => setStatus(e.target.value as IssueStatus)}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusLabels[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-500 mb-1">Test Run (opcional)</label>
              <select
                className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-lowest)] px-3 py-2 text-sm text-surface-200 outline-none focus:border-brand-600/50"
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
              >
                <option value="">Sem Run</option>
                {runs.map((r) => (
                  <option key={r.$id} value={r.$id}>{r.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-500 mb-1">Test Case (opcional)</label>
              <select
                className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-lowest)] px-3 py-2 text-sm text-surface-200 outline-none focus:border-brand-600/50"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              >
                <option value="">Sem Case</option>
                {cases.map((c) => (
                  <option key={c.$id} value={c.$id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-surface-500 mb-1">Evidências (upload)</label>
              <input
                type="file"
                multiple
                className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-lowest)] px-3 py-2 text-sm text-surface-300 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600/20 file:px-2 file:py-1 file:text-xs file:font-medium file:text-brand-400"
                onChange={(e) => setFiles(e.target.files)}
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-[var(--border-glass)] px-3 py-2 text-xs text-surface-400 hover:text-surface-200 transition-all"
                onClick={() => { setShowForm(false); setTitle(''); setDescription(''); setFiles(null) }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-60 transition-all"
                disabled={busy || !title.trim()}
                onClick={() => createIssue()}
              >
                {busy ? 'Criando...' : 'Criar Issue'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 rounded-full border-2 border-brand-600/30 border-t-brand-600 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {(Object.keys(statusLabels) as IssueStatus[]).map((statusKey) => {
            const columnIssues = grouped[statusKey]
            return (
              <div
                key={statusKey}
                className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-highlight)] backdrop-blur-xl transition-all duration-300 min-h-[200px]"
              >
                <div className={`absolute inset-0 bg-gradient-to-b ${columnGradients[statusKey]} to-transparent pointer-events-none`} />
                <div className="relative">
                  {/* Column Header */}
                  <div className={`px-4 py-3 border-b border-[var(--border-glass)] border-t-2 ${statusColors[statusKey]}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-surface-200">{statusLabels[statusKey]}</span>
                      <span className="flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[var(--bg-glass-high)] px-1.5 text-[10px] font-medium text-surface-400">
                        {columnIssues.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="p-3 space-y-2">
                    {columnIssues.map((issue) => (
                      <div
                        key={issue.$id}
                        className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight)] p-3 transition-all duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--bg-highlight)] group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-surface-200 truncate">
                              {issue.title}
                            </div>
                            {issue.description ? (
                              <div className="text-[10px] text-surface-500 mt-1 line-clamp-2">
                                {issue.description}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <SeverityBadge severity={issue.severity} />
                          {issue.case_id && casesById[issue.case_id] ? (
                            <span className="text-[10px] text-surface-600 truncate" title={casesById[issue.case_id].title}>
                              {casesById[issue.case_id].title}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-surface-600">
                          <Bug className="h-3 w-3" />
                          <span>{issue.$id.slice(0, 8)}</span>
                          {issue.evidence_file_ids?.length ? (
                            <span>{issue.evidence_file_ids.length} arquivo(s)</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {!columnIssues.length ? (
                      <div className="flex flex-col items-center justify-center py-8 text-surface-600">
                        <div className="text-[10px]">Nenhum</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}