import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { databases } from './appwrite'
import { COLLECTION_IDS, DATABASE_ID } from './ids'
import type { ProjectDoc } from './model'

type ProjectContextValue = {
  project: ProjectDoc | null
  setProject: (project: ProjectDoc | null) => void
  validating: boolean
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

const LS_KEY = 'tmctqs:selectedProject'

function readStored(): ProjectDoc | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ProjectDoc
  } catch {
    return null
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProjectState] = useState<ProjectDoc | null>(() => readStored())
  const [validating, setValidating] = useState<boolean>(() => !!readStored())

  useEffect(() => {
    if (!project) {
      setValidating(false)
      return
    }
    let cancelled = false
    setValidating(true)
    databases
      .getDocument<ProjectDoc>({
        databaseId: DATABASE_ID,
        collectionId: COLLECTION_IDS.projects,
        documentId: project.$id,
      })
      .then((fresh) => {
        if (cancelled) return
        setProjectState(fresh)
        localStorage.setItem(LS_KEY, JSON.stringify(fresh))
      })
      .catch(() => {
        if (cancelled) return
        setProjectState(null)
        localStorage.removeItem(LS_KEY)
      })
      .finally(() => {
        if (cancelled) return
        setValidating(false)
      })
    return () => {
      cancelled = true
    }
  }, [project?.$id])

  const value = useMemo<ProjectContextValue>(
    () => ({
      project,
      validating,
      setProject(next) {
        setProjectState(next)
        if (!next) localStorage.removeItem(LS_KEY)
        else localStorage.setItem(LS_KEY, JSON.stringify(next))
      },
    }),
    [project, validating],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('ProjectProvider ausente')
  return ctx
}

