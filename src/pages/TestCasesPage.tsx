import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { databases, ID, Query, teamDocPermissions } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type {
  Priority,
  Severity,
  SuiteDoc,
  TestCaseDoc,
} from '../lib/model'
import { encodeSteps, decodeSteps } from '../lib/steps'
import { useAuth } from '../auth/auth'
import { useProject } from '../lib/project'
import {
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  Filter,
  PenSquare,
  Plus,
  Search,
  TestTube,
  Trash2,
  X,
} from 'lucide-react'

const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; border: string }> = {
  Blocker: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  Critical: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  High: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  Medium: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  Low: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
}

const PRIORITY_COLORS: Record<Priority, string> = {
  P0: 'bg-red-500/15 text-red-300 border-red-500/30',
  P1: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  P2: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  P3: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

type StepDraft = { action: string; expected_result: string }

export function TestCasesPage() {
  const { user } = useAuth()
  const { project, validating } = useProject()

  const [suites, setSuites] = useState<SuiteDoc[]>([])
  const [cases, setCases] = useState<TestCaseDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [suiteId, setSuiteId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all')
  const [expandedCase, setExpandedCase] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [editingCase, setEditingCase] = useState<TestCaseDoc | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftSeverity, setDraftSeverity] = useState<Severity>('Medium')
  const [draftPriority, setDraftPriority] = useState<Priority>('P2')
  const [draftPre, setDraftPre] = useState('')
  const [draftPost, setDraftPost] = useState('')
  const [draftSteps, setDraftSteps] = useState<StepDraft[]>([{ action: '', expected_result: '' }])
  const [busyCreate, setBusyCreate] = useState(false)

  async function loadAll() {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const suiteRes = await databases.listDocuments<SuiteDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.suites,
        queries: [Query.equal('project_id', project.$id), Query.limit(200)],
      })
      setSuites(suiteRes.documents)
      setSuiteId((prev) => prev || suiteRes.documents[0]?.$id || '')
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Suites'))
    } finally {
      setLoading(false)
    }
  }

  async function loadCases(sid: string) {
    if (!project || !sid) {
      setCases([])
      return
    }
    setError(null)
    try {
      const res = await databases.listDocuments<TestCaseDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.testCases,
        queries: [
          Query.equal('project_id', project.$id),
          Query.equal('suite_id', sid),
          Query.orderDesc('$createdAt'),
          Query.limit(200),
        ],
      })
      setCases(res.documents)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Test Cases'))
    }
  }

  useEffect(() => {
    loadAll()
  }, [project?.$id])

  useEffect(() => {
    loadCases(suiteId)
  }, [suiteId, project?.$id])

  const suiteById = useMemo(() => {
    const map = new Map<string, SuiteDoc>()
    suites.forEach((s) => map.set(s.$id, s))
    return map
  }, [suites])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases.filter((c) => {
      if (severityFilter !== 'all' && c.severity !== severityFilter) return false
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false
      if (q && !c.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [cases, search, severityFilter, priorityFilter])

  const stats = useMemo(() => {
    const by: Record<Severity, number> = { Blocker: 0, Critical: 0, High: 0, Medium: 0, Low: 0 }
    cases.forEach((c) => {
      by[c.severity] += 1
    })
    return by
  }, [cases])

  function openCreate() {
    setShowCreate(true)
    setEditingCase(null)
    setDraftTitle('')
    setDraftSeverity('Medium')
    setDraftPriority('P2')
    setDraftPre('')
    setDraftPost('')
    setDraftSteps([{ action: '', expected_result: '' }])
  }

  function closeCreate() {
    setShowCreate(false)
    setEditingCase(null)
  }

  function openEdit(c: TestCaseDoc) {
    setEditingCase(c)
    setShowCreate(false)
    setDraftTitle(c.title)
    setDraftSeverity(c.severity)
    setDraftPriority(c.priority)
    setDraftPre(c.pre_conditions || '')
    setDraftPost(c.post_conditions || '')
    setDraftSteps(decodeSteps(c.steps).map((s) => ({ ...s })))
  }

  function addStep() {
    setDraftSteps((prev) => [...prev, { action: '', expected_result: '' }])
  }

  function removeStep(idx: number) {
    setDraftSteps((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
  }

  function updateStep(idx: number, key: keyof StepDraft, value: string) {
    setDraftSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)))
  }

  async function submitCreate() {
    if (!project || !suiteId) return
    const title = draftTitle.trim()
    if (!title) return
    setBusyCreate(true)
    setError(null)
    try {
      const steps = draftSteps
        .map((s) => ({ action: s.action.trim(), expected_result: s.expected_result.trim() }))
        .filter((s) => s.action || s.expected_result)
      const data = {
        project_id: project.$id,
        suite_id: suiteId,
        title,
        pre_conditions: draftPre.trim() || undefined,
        post_conditions: draftPost.trim() || undefined,
        severity: draftSeverity,
        priority: draftPriority,
        steps: encodeSteps(steps),
      }

      if (editingCase) {
        await databases.updateDocument<TestCaseDoc>(
          DATABASE_ID,
          COLLECTION_IDS.testCases,
          editingCase.$id,
          data,
        )
      } else {
        await databases.createDocument<TestCaseDoc>({
          databaseId: DATABASE_ID,
          collectionId: COLLECTION_IDS.testCases,
          documentId: ID.unique(),
          data,
          permissions: teamDocPermissions(project.team_id, user?.$id),
        })
      }

      closeCreate()
      await loadCases(suiteId)
    } catch (e) {
      setError(appwriteErrorMessage(e, editingCase ? 'Falha ao editar Test Case' : 'Falha ao criar Test Case'))
    } finally {
      setBusyCreate(false)
    }
  }

  async function deleteCase(caseId: string) {
    setError(null)
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_IDS.testCases, caseId)
      if (expandedCase === caseId) setExpandedCase(null)
      await loadCases(suiteId)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao excluir Test Case'))
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-surface-500">
            <Link to="/dashboards" className="hover:text-surface-300">Dashboard</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Test Cases</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-surface-100">Test Cases</h1>
          <p className="mt-1 text-sm text-surface-400">
            Cenários de teste detalhados, vinculados a uma Suite.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={!project || !suiteId}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-500 hover:shadow-lg hover:shadow-brand-600/20 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Novo Test Case
        </button>
      </header>

      {!project ? (
        <EmptyState
          title={validating ? 'Validando projeto...' : 'Selecione um Projeto'}
          description={
            validating
              ? 'Verificando acesso ao projeto ativo.'
              : 'Para gerenciar Test Cases, primeiro selecione um projeto ativo.'
          }
          cta={{ label: 'Abrir Projetos', to: '/projects' }}
        />
      ) : !suites.length ? (
        <EmptyState
          title="Nenhuma Suite ainda"
          description="Crie uma Suite para poder adicionar Test Cases."
          cta={{ label: 'Ir para Test Suites', to: '/tests' }}
        />
      ) : (
        <>
          {/* Suite selector + Stats */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] p-4 backdrop-blur-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
              <div className="relative">
                <label className="block text-[10px] font-medium uppercase tracking-widest text-surface-500 mb-2">
                  Suite ativa
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none focus:border-cyan-500/50"
                  value={suiteId}
                  onChange={(e) => setSuiteId(e.target.value)}
                >
                  {suites.map((s) => (
                    <option key={s.$id} value={s.$id}>{s.name}</option>
                  ))}
                </select>
                <p className="mt-2 text-[10px] text-surface-500">
                  {suiteById.get(suiteId)?.description || 'Sem descrição.'}
                </p>
              </div>
            </div>
            <div className="lg:col-span-2 grid grid-cols-5 gap-2">
              {(Object.keys(stats) as Severity[]).map((sev) => (
                <div
                  key={sev}
                  className={`rounded-xl border ${SEVERITY_COLORS[sev].border} ${SEVERITY_COLORS[sev].bg} p-3`}
                >
                  <div className={`text-[10px] font-medium uppercase tracking-widest ${SEVERITY_COLORS[sev].text}`}>
                    {sev}
                  </div>
                  <div className={`mt-1 text-2xl font-bold font-mono ${SEVERITY_COLORS[sev].text}`}>
                    {stats[sev]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="relative flex flex-wrap items-center gap-3 p-4">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 flex-1 min-w-[220px]">
                <Search className="h-4 w-4 text-surface-500" />
                <input
                  className="bg-transparent text-sm text-surface-100 placeholder:text-surface-500 outline-none flex-1"
                  placeholder="Buscar caso de teste..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-surface-500" />
                <select
                  className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
                >
                  <option value="all">Todas as Severities</option>
                  {(Object.keys(SEVERITY_COLORS) as Severity[]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
                >
                  <option value="all">Todas as Priorities</option>
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                </select>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {/* Cases table */}
          <div className="relative overflow-hidden rounded-xl border border-[var(--border-glass)] bg-[var(--bg-panel)] backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="relative overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--border-glass)]">
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">
                      Caso
                    </th>
                    <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">
                      Severity
                    </th>
                    <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500">
                      Steps
                    </th>
                    <th className="px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-surface-500 text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-glass)]">
                  {filtered.map((c) => {
                    const steps = decodeSteps(c.steps)
                    const isExpanded = expandedCase === c.$id
                    return (
                      <Fragment key={c.$id}>
                        <tr
                          className="hover:bg-[var(--bg-highlight-subtle)] transition-colors cursor-pointer"
                          onClick={() => setExpandedCase(isExpanded ? null : c.$id)}
                        >
                          <td className="px-4 py-3 text-surface-500">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-surface-200">{c.title}</div>
                            {c.pre_conditions ? (
                              <div className="mt-0.5 text-[10px] text-surface-500">Pré: {c.pre_conditions}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_COLORS[c.severity].bg} ${SEVERITY_COLORS[c.severity].text} ${SEVERITY_COLORS[c.severity].border}`}>
                              <AlertOctagon className="h-3 w-3 mr-1" />
                              {c.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${PRIORITY_COLORS[c.priority]}`}>
                              {c.priority}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-surface-400 font-mono">{steps.length}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEdit(c)
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-glass)] px-2 py-1 text-[10px] text-surface-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                                title="Editar"
                              >
                                <PenSquare className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteCase(c.$id)
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-glass)] px-2 py-1 text-[10px] text-surface-400 hover:text-red-300 hover:bg-red-500/10"
                                title="Excluir"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr key={`${c.$id}-detail`} className="bg-[var(--bg-highlight-subtle)]/40">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="ml-6 space-y-3">
                                {c.pre_conditions ? (
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">Pré-condições</div>
                                    <div className="mt-1 text-sm text-surface-300">{c.pre_conditions}</div>
                                  </div>
                                ) : null}
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                                    Passos ({steps.length})
                                  </div>
                                  <ol className="mt-1 space-y-1.5">
                                    {steps.map((s, idx) => (
                                      <li key={idx} className="text-sm text-surface-300">
                                        <span className="font-mono text-[10px] text-surface-500 mr-2">{idx + 1}.</span>
                                        <span className="font-medium">{s.action}</span>
                                        {s.expected_result ? (
                                          <span className="text-surface-500"> → {s.expected_result}</span>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                                {c.post_conditions ? (
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">Pós-condições</div>
                                    <div className="mt-1 text-sm text-surface-300">{c.post_conditions}</div>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                  {!filtered.length ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-sm text-surface-500">
                        {loading
                          ? 'Carregando...'
                          : 'Nenhum Test Case. Clique em "Novo Test Case" para criar.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showCreate || editingCase ? (
        <CreateCaseModal
          isEdit={!!editingCase}
          suiteName={suiteById.get(suiteId)?.name ?? ''}
          title={draftTitle}
          setTitle={setDraftTitle}
          severity={draftSeverity}
          setSeverity={setDraftSeverity}
          priority={draftPriority}
          setPriority={setDraftPriority}
          pre={draftPre}
          setPre={setDraftPre}
          post={draftPost}
          setPost={setDraftPost}
          steps={draftSteps}
          addStep={addStep}
          removeStep={removeStep}
          updateStep={updateStep}
          onClose={closeCreate}
          onSubmit={submitCreate}
          busy={busyCreate}
        />
      ) : null}
    </div>
  )
}

function EmptyState({
  title,
  description,
  cta,
}: {
  title: string
  description: string
  cta: { label: string; to: string }
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-glass)] bg-[var(--bg-panel)] p-12 text-center">
      <TestTube className="mx-auto h-10 w-10 text-surface-600" />
      <h3 className="mt-4 text-base font-semibold text-surface-200">{title}</h3>
      <p className="mt-1 text-sm text-surface-500">{description}</p>
      <Link
        to={cta.to}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
      >
        {cta.label}
      </Link>
    </div>
  )
}

function CreateCaseModal({
  isEdit,
  suiteName,
  title,
  setTitle,
  severity,
  setSeverity,
  priority,
  setPriority,
  pre,
  setPre,
  post,
  setPost,
  steps,
  addStep,
  removeStep,
  updateStep,
  onClose,
  onSubmit,
  busy,
}: {
  isEdit?: boolean
  suiteName: string
  title: string
  setTitle: (v: string) => void
  severity: Severity
  setSeverity: (v: Severity) => void
  priority: Priority
  setPriority: (v: Priority) => void
  pre: string
  setPre: (v: string) => void
  post: string
  setPost: (v: string) => void
  steps: StepDraft[]
  addStep: () => void
  removeStep: (idx: number) => void
  updateStep: (idx: number, key: keyof StepDraft, value: string) => void
  onClose: () => void
  onSubmit: () => void
  busy: boolean
}) {
  const canSubmit = !busy && title.trim() && steps.some((s) => s.action.trim() || s.expected_result.trim())
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-[var(--border-glass)] bg-[var(--bg-panel)] shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between border-b border-[var(--border-glass)] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/20 text-brand-400">
                <TestTube className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-surface-100">
                  {isEdit ? 'Editar Test Case' : 'Novo Test Case'}
                </h2>
                <p className="text-xs text-surface-500">Suite: {suiteName || '—'}</p>
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
                placeholder="Ex: Validar login com credenciais válidas"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">
                  Severity
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none focus:border-cyan-500/50"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                >
                  {(Object.keys(SEVERITY_COLORS) as Severity[]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">
                  Priority
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 outline-none focus:border-cyan-500/50"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">
                Pré-condições <span className="text-surface-600">(opcional)</span>
              </label>
              <textarea
                className="h-16 w-full resize-none rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 outline-none focus:border-cyan-500/50"
                placeholder="Ex: Usuário cadastrado e ativo"
                value={pre}
                onChange={(e) => setPre(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500">
                  Passos *
                </label>
                <button
                  type="button"
                  onClick={addStep}
                  className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300"
                >
                  <Plus className="h-3 w-3" /> Adicionar passo
                </button>
              </div>
              <div className="space-y-2">
                {steps.map((s, idx) => (
                  <div key={idx} className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-highlight-subtle)] p-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 text-[10px] font-mono text-surface-500 w-6 text-right">{idx + 1}.</span>
                      <div className="flex-1 space-y-1.5">
                        <input
                          className="w-full rounded-md border border-[var(--border-glass)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-surface-100 placeholder:text-surface-500 outline-none focus:border-cyan-500/50"
                          placeholder="Ação: clique em Login"
                          value={s.action}
                          onChange={(e) => updateStep(idx, 'action', e.target.value)}
                        />
                        <input
                          className="w-full rounded-md border border-[var(--border-glass)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-surface-100 placeholder:text-surface-500 outline-none focus:border-cyan-500/50"
                          placeholder="Esperado: dashboard carregado"
                          value={s.expected_result}
                          onChange={(e) => updateStep(idx, 'expected_result', e.target.value)}
                        />
                      </div>
                      {steps.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeStep(idx)}
                          className="mt-1 rounded-md p-1 text-surface-500 hover:bg-red-500/10 hover:text-red-300"
                          title="Remover passo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider text-surface-500 mb-1">
                Pós-condições <span className="text-surface-600">(opcional)</span>
              </label>
              <textarea
                className="h-16 w-full resize-none rounded-lg border border-[var(--border-glass)] bg-[var(--bg-input)] px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 outline-none focus:border-cyan-500/50"
                placeholder="Ex: sessão persistida no localStorage"
                value={post}
                onChange={(e) => setPost(e.target.value)}
              />
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
              <Plus className="h-3.5 w-3.5" />
              {busy ? (isEdit ? 'Salvando...' : 'Criando...') : isEdit ? 'Salvar alterações' : 'Criar Test Case'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
