import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { databases, ID, Query, teamDocPermissions } from '../lib/appwrite'
import { appwriteErrorMessage } from '../lib/appwriteError'
import { COLLECTION_IDS, DATABASE_ID } from '../lib/ids'
import type { Priority, Severity, SuiteDoc, TestCaseDoc } from '../lib/model'
import { decodeSteps, encodeSteps } from '../lib/steps'
import { useAuth } from '../auth/auth'
import { useProject } from '../lib/project'

const severityOptions: Severity[] = ['Blocker', 'Critical', 'High', 'Medium', 'Low']
const priorityOptions: Priority[] = ['P0', 'P1', 'P2', 'P3']

export function TestsPage() {
  const { user } = useAuth()
  const { project } = useProject()
  const [suites, setSuites] = useState<SuiteDoc[]>([])
  const [cases, setCases] = useState<TestCaseDoc[]>([])
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [suiteName, setSuiteName] = useState('')
  const [suiteParentId, setSuiteParentId] = useState<string>('')
  const [suiteDesc, setSuiteDesc] = useState('')
  const [busySuite, setBusySuite] = useState(false)

  const [caseTitle, setCaseTitle] = useState('')
  const [caseSeverity, setCaseSeverity] = useState<Severity>('Medium')
  const [casePriority, setCasePriority] = useState<Priority>('P2')
  const [casePre, setCasePre] = useState('')
  const [casePost, setCasePost] = useState('')
  const [caseSteps, setCaseSteps] = useState([{ action: '', expected_result: '' }])
  const [busyCase, setBusyCase] = useState(false)

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

  async function loadAll() {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const suiteRes = await databases.listDocuments<SuiteDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.suites,
        queries: [Query.equal('project_id', project.$id), Query.limit(100)],
      })
      setSuites(suiteRes.documents)

      const firstSuite = suiteRes.documents[0]?.$id ?? null
      setSelectedSuiteId((prev) => prev ?? firstSuite)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Suites'))
    } finally {
      setLoading(false)
    }
  }

  async function loadCases(nextSuiteId: string | null) {
    if (!project || !nextSuiteId) {
      setCases([])
      return
    }
    try {
      const caseRes = await databases.listDocuments<TestCaseDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.testCases,
        queries: [
          Query.equal('project_id', project.$id),
          Query.equal('suite_id', nextSuiteId),
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ],
      })
      setCases(caseRes.documents)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao carregar Test Cases'))
    }
  }

  useEffect(() => {
    loadAll()
  }, [project?.$id])

  useEffect(() => {
    loadCases(selectedSuiteId)
  }, [selectedSuiteId, project?.$id])

  async function createSuite() {
    if (!project) return
    const name = suiteName.trim()
    if (!name) return
    setBusySuite(true)
    setError(null)
    try {
      await databases.createDocument<SuiteDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.suites,
        documentId: ID.unique(),
        data: {
          project_id: project.$id,
          name,
          parent_id: suiteParentId || null,
          description: suiteDesc.trim() || undefined,
        },
        permissions: teamDocPermissions(project.team_id, user?.$id),
      })
      setSuiteName('')
      setSuiteParentId('')
      setSuiteDesc('')
      await loadAll()
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar Suite'))
    } finally {
      setBusySuite(false)
    }
  }

  async function deleteSuite(suiteId: string) {
    if (!project) return
    setError(null)
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_IDS.suites, suiteId)
      if (selectedSuiteId === suiteId) setSelectedSuiteId(null)
      await loadAll()
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao excluir Suite'))
    }
  }

  async function createCase() {
    if (!project || !selectedSuiteId) return
    const title = caseTitle.trim()
    if (!title) return

    setBusyCase(true)
    setError(null)
    try {
      const steps = caseSteps
        .map((s) => ({
          action: s.action.trim(),
          expected_result: s.expected_result.trim(),
        }))
        .filter((s) => s.action || s.expected_result)

      await databases.createDocument<TestCaseDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.testCases,
        documentId: ID.unique(),
        data: {
          project_id: project.$id,
          suite_id: selectedSuiteId,
          title,
          pre_conditions: casePre.trim() || undefined,
          post_conditions: casePost.trim() || undefined,
          severity: caseSeverity,
          priority: casePriority,
          steps: encodeSteps(steps),
        },
        permissions: teamDocPermissions(project.team_id, user?.$id),
      })

      setCaseTitle('')
      setCasePre('')
      setCasePost('')
      setCaseSeverity('Medium')
      setCasePriority('P2')
      setCaseSteps([{ action: '', expected_result: '' }])
      await loadCases(selectedSuiteId)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao criar Test Case'))
    } finally {
      setBusyCase(false)
    }
  }

  async function deleteCase(caseId: string) {
    if (!selectedSuiteId) return
    setError(null)
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_IDS.testCases, caseId)
      await loadCases(selectedSuiteId)
    } catch (e) {
      setError(appwriteErrorMessage(e, 'Falha ao excluir Test Case'))
    }
  }

  if (!project) {
    return (
      <div className="rounded-lg border border-surface-800 bg-surface-900/50 p-4">
        <div className="text-sm font-semibold">Tests</div>
        <div className="mt-2 text-sm text-surface-300">
          Selecione um <span className="font-semibold">Project</span> para gerenciar Suites
          e Test Cases.
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
      <div>
        <div className="text-lg font-semibold">Tests</div>
        <div className="mt-1 text-xs text-surface-400">
          CRUD manual de Suites e Test Cases (hierarquia estilo Qase)
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-surface-800 bg-surface-900/50 p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Suites</div>
            <button
              type="button"
              className="rounded-md bg-surface-900 px-2 py-1 text-xs text-surface-200 hover:bg-surface-800"
              onClick={() => loadAll()}
              disabled={loading}
            >
              Atualizar
            </button>
          </div>

          <div className="mt-3 space-y-1">
            {suiteTree.map(({ suite, depth }) => (
              <div key={suite.$id} className="flex items-center gap-2">
                <button
                  type="button"
                  className={[
                    'flex-1 rounded-md border px-3 py-2 text-left text-sm',
                    selectedSuiteId === suite.$id
                      ? 'border-brand-700 bg-brand-950/40'
                      : 'border-surface-800 bg-[var(--bg-input)] hover:bg-surface-900',
                  ].join(' ')}
                  onClick={() => setSelectedSuiteId(suite.$id)}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-surface-500" style={{ width: depth * 12 }} />
                    <div className="font-semibold">{suite.name}</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="rounded-md bg-surface-900 px-2 py-2 text-xs text-surface-300 hover:bg-surface-800"
                  onClick={() => deleteSuite(suite.$id)}
                  title="Excluir Suite"
                >
                  Excluir
                </button>
              </div>
            ))}
            {!suiteTree.length ? (
              <div className="text-xs text-surface-400">Nenhuma Suite ainda.</div>
            ) : null}
          </div>

          <div className="mt-4 border-t border-surface-800 pt-4">
            <div className="text-sm font-semibold">Nova Suite</div>
            <div className="mt-3 grid gap-3">
              <div>
                <label className="text-xs text-surface-400">Name</label>
                <input
                  className="mt-1 w-full rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                  value={suiteName}
                  onChange={(e) => setSuiteName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-surface-400">Parent (opcional)</label>
                <select
                  className="mt-1 w-full rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                  value={suiteParentId}
                  onChange={(e) => setSuiteParentId(e.target.value)}
                >
                  <option value="">Sem parent</option>
                  {suiteTree.map(({ suite, depth }) => (
                    <option key={suite.$id} value={suite.$id}>
                      {`${' '.repeat(depth * 2)}${suite.name}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-surface-400">Description</label>
                <textarea
                  className="mt-1 h-20 w-full resize-none rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                  value={suiteDesc}
                  onChange={(e) => setSuiteDesc(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
                disabled={busySuite || !suiteName.trim()}
                onClick={() => createSuite()}
              >
                {busySuite ? 'Criando...' : 'Criar Suite'}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-surface-800 bg-surface-900/50 p-4 lg:col-span-2">
          <div className="text-sm font-semibold">Test Cases</div>
          <div className="mt-1 text-xs text-surface-400">
            {selectedSuiteId ? `Suite selecionada: ${selectedSuiteId}` : 'Selecione uma Suite'}
          </div>

          <div className="mt-4 space-y-2">
            {cases.map((c) => {
              const steps = decodeSteps(c.steps)
              return (
                <div
                  key={c.$id}
                  className="rounded-md border border-surface-800 bg-[var(--bg-input)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{c.title}</div>
                      <div className="mt-1 text-xs text-surface-400">
                        Severity: <span className="font-semibold">{c.severity}</span> ·
                        Priority: <span className="font-semibold">{c.priority}</span> ·
                        Steps: <span className="font-semibold">{steps.length}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-md bg-surface-900 px-2 py-1 text-xs text-surface-300 hover:bg-surface-800"
                      onClick={() => deleteCase(c.$id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })}
            {!cases.length ? (
              <div className="text-xs text-surface-400">Nenhum Test Case nesta Suite.</div>
            ) : null}
          </div>

          <div className="mt-6 border-t border-surface-800 pt-4">
            <div className="text-sm font-semibold">Novo Test Case</div>
            <div className="mt-3 grid gap-3">
              <div>
                <label className="text-xs text-surface-400">Title</label>
                <input
                  className="mt-1 w-full rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  disabled={!selectedSuiteId}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-surface-400">Severity</label>
                  <select
                    className="mt-1 w-full rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                    value={caseSeverity}
                    onChange={(e) => setCaseSeverity(e.target.value as Severity)}
                    disabled={!selectedSuiteId}
                  >
                    {severityOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-surface-400">Priority</label>
                  <select
                    className="mt-1 w-full rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                    value={casePriority}
                    onChange={(e) => setCasePriority(e.target.value as Priority)}
                    disabled={!selectedSuiteId}
                  >
                    {priorityOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-surface-400">Pre-conditions</label>
                  <textarea
                    className="mt-1 h-20 w-full resize-none rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                    value={casePre}
                    onChange={(e) => setCasePre(e.target.value)}
                    disabled={!selectedSuiteId}
                  />
                </div>
                <div>
                  <label className="text-xs text-surface-400">Post-conditions</label>
                  <textarea
                    className="mt-1 h-20 w-full resize-none rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                    value={casePost}
                    onChange={(e) => setCasePost(e.target.value)}
                    disabled={!selectedSuiteId}
                  />
                </div>
              </div>

              <div className="rounded-md border border-surface-800 bg-[var(--bg-input)] p-3">
                <div className="text-xs font-semibold text-surface-300">Steps</div>
                <div className="mt-2 space-y-2">
                  {caseSteps.map((s, idx) => (
                    <div key={idx} className="grid gap-2 sm:grid-cols-2">
                      <input
                        className="rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                        placeholder="action"
                        value={s.action}
                        onChange={(e) => {
                          const next = caseSteps.slice()
                          next[idx] = { ...next[idx], action: e.target.value }
                          setCaseSteps(next)
                        }}
                        disabled={!selectedSuiteId}
                      />
                      <input
                        className="rounded-md border border-surface-800 bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-brand-500"
                        placeholder="expected_result"
                        value={s.expected_result}
                        onChange={(e) => {
                          const next = caseSteps.slice()
                          next[idx] = { ...next[idx], expected_result: e.target.value }
                          setCaseSteps(next)
                        }}
                        disabled={!selectedSuiteId}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-surface-900 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800"
                    onClick={() =>
                      setCaseSteps([...caseSteps, { action: '', expected_result: '' }])
                    }
                    disabled={!selectedSuiteId}
                  >
                    Adicionar Step
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-surface-900 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800"
                    onClick={() => setCaseSteps([{ action: '', expected_result: '' }])}
                    disabled={!selectedSuiteId}
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
                disabled={busyCase || !selectedSuiteId || !caseTitle.trim()}
                onClick={() => createCase()}
              >
                {busyCase ? 'Criando...' : `Criar Test Case na Suite`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
