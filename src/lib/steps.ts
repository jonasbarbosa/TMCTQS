import type { Step, StepResult } from './model'

export function encodeSteps(steps: Step[]) {
  return JSON.stringify(steps)
}

export function decodeSteps(raw: string | undefined | null): Step[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        action: typeof s.action === 'string' ? s.action : '',
        expected_result:
          typeof s.expected_result === 'string' ? s.expected_result : '',
      }))
      .filter((s) => s.action || s.expected_result)
  } catch {
    return []
  }
}

export function encodeStepResults(stepResults: StepResult[]) {
  return JSON.stringify(stepResults)
}

export function decodeStepResults(raw: string | undefined | null): StepResult[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        status:
          s.status === 'passed' || s.status === 'failed' || s.status === 'skipped'
            ? s.status
            : 'skipped',
        actual_result:
          typeof s.actual_result === 'string' ? s.actual_result : undefined,
      }))
  } catch {
    return []
  }
}

