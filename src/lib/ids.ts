export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID ?? 'tmctqs'

export const COLLECTION_IDS = {
  projects: import.meta.env.VITE_APPWRITE_COLLECTION_PROJECTS_ID ?? 'projects',
  suites: import.meta.env.VITE_APPWRITE_COLLECTION_SUITES_ID ?? 'suites',
  testCases: import.meta.env.VITE_APPWRITE_COLLECTION_TEST_CASES_ID ?? 'test_cases',
  environments:
    import.meta.env.VITE_APPWRITE_COLLECTION_ENVIRONMENTS_ID ?? 'environments',
  testRuns: import.meta.env.VITE_APPWRITE_COLLECTION_TEST_RUNS_ID ?? 'test_runs',
  runResults:
    import.meta.env.VITE_APPWRITE_COLLECTION_RUN_RESULTS_ID ?? 'run_results',
  issues: import.meta.env.VITE_APPWRITE_COLLECTION_ISSUES_ID ?? 'issues',
} as const

export const BUCKET_IDS = {
  issueEvidences:
    import.meta.env.VITE_APPWRITE_BUCKET_ISSUE_EVIDENCES ?? 'issue-evidences',
} as const
