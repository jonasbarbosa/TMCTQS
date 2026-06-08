import type { Models } from './appwrite'

export type Severity = 'Blocker' | 'Critical' | 'High' | 'Medium' | 'Low'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export type RunStatus = 'draft' | 'in_progress' | 'completed'
export type CaseResultStatus = 'not_run' | 'passed' | 'failed' | 'blocked'

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'validated' | 'closed'

export type Step = {
  action: string
  expected_result: string
}

export type StepResult = {
  status: 'passed' | 'failed' | 'skipped'
  actual_result?: string
}

export type ProjectDoc = Models.Document & {
  name: string
  code: string
  description?: string
  team_id: string
}

export type SuiteDoc = Models.Document & {
  project_id: string
  name: string
  parent_id?: string | null
  description?: string
}

export type TestCaseDoc = Models.Document & {
  project_id: string
  suite_id: string
  title: string
  pre_conditions?: string
  post_conditions?: string
  severity: Severity
  priority: Priority
  steps: string
}

export type EnvironmentDoc = Models.Document & {
  project_id: string
  name: string
  description?: string
}

export type TestRunDoc = Models.Document & {
  project_id: string
  suite_id?: string | null
  environment_id: string
  title: string
  status: RunStatus
  progress_percentage: number
  created_by?: string
  executed_by?: string | null
  scheduled_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  parent_run_id?: string | null
}

export type RunResultDoc = Models.Document & {
  project_id: string
  run_id: string
  case_id: string
  status: CaseResultStatus
  step_results: string
  notes?: string
  started_at?: string | null
  finished_at?: string | null
  executed_by?: string | null
  actual_result?: string
}

export type IssueDoc = Models.Document & {
  project_id: string
  title: string
  description?: string
  severity: Severity
  status: IssueStatus
  case_id?: string
  run_id?: string
  evidence_file_ids?: string[]
}

