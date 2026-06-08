import 'dotenv/config'
import pkg from 'node-appwrite'
const {
  Client,
  Databases,
  Permission,
  Role,
  Storage,
} = pkg

const endpoint = process.env.APPWRITE_ENDPOINT ?? process.env.VITE_APPWRITE_ENDPOINT
const projectId =
  process.env.APPWRITE_PROJECT_ID ?? process.env.VITE_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY

let databaseId =
  process.env.APPWRITE_DATABASE_ID ??
  process.env.VITE_APPWRITE_DATABASE_ID ??
  'tmctqs'

const databaseName = process.env.APPWRITE_DATABASE_NAME

const issueEvidencesBucketId =
  process.env.APPWRITE_BUCKET_ISSUE_EVIDENCES ??
  process.env.VITE_APPWRITE_BUCKET_ISSUE_EVIDENCES ??
  'issue-evidences'

const COLLECTION_IDS = {
  projects:      process.env.VITE_APPWRITE_COLLECTION_PROJECTS_ID ?? 'projects',
  suites:        process.env.VITE_APPWRITE_COLLECTION_SUITES_ID ?? 'suites',
  testCases:     process.env.VITE_APPWRITE_COLLECTION_TEST_CASES_ID ?? 'test_cases',
  environments:  process.env.VITE_APPWRITE_COLLECTION_ENVIRONMENTS_ID ?? 'environments',
  testRuns:      process.env.VITE_APPWRITE_COLLECTION_TEST_RUNS_ID ?? 'test_runs',
  runResults:    process.env.VITE_APPWRITE_COLLECTION_RUN_RESULTS_ID ?? 'run_results',
  issues:        process.env.VITE_APPWRITE_COLLECTION_ISSUES_ID ?? 'issues',
}

if (!endpoint || !projectId || !apiKey) {
  console.error('Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID or APPWRITE_API_KEY')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const databases = new Databases(client)
const storage = new Storage(client)

const defaultCollectionPermissions = [
  Permission.read(Role.users()),
  Permission.create(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
]

async function ensureDatabase() {
  try {
    await databases.get(databaseId)
    return
  } catch {
    if (databaseName) {
      try {
        const res = await databases.list()
        const found = res.databases?.find((db) => db.name === databaseName)
        if (found?.$id) {
          databaseId = found.$id
          await databases.get(databaseId)
          return
        }
      } catch (e) {
        if (e && e.code && e.code !== 404) throw e
      }
    }

    try {
      await databases.create(databaseId, 'TMCTQS', true)
    } catch (e) {
      if (!(e && e.code === 409)) throw e
    }
  }
}

async function ensureCollection(collectionId, name) {
  try {
    await databases.getCollection(databaseId, collectionId)
  } catch {
    try {
      await databases.createCollection(
        databaseId,
        collectionId,
        name,
        defaultCollectionPermissions,
        true,
        true,
      )
    } catch (e) {
      if (!(e && e.code === 409)) throw e
    }
  }
}

function ensureTextAttribute(collectionId, key, required = false, xdefault = undefined) {
  return ensureStringAttribute(collectionId, key, 65535, required, xdefault)
}

async function ensureStringAttribute(
  collectionId,
  key,
  size,
  required = false,
  xdefault = undefined,
  array = false,
) {
  try {
    await databases.getAttribute(databaseId, collectionId, key)
  } catch {
    try {
      await databases.createStringAttribute(
        databaseId,
        collectionId,
        key,
        size,
        required,
        xdefault,
        array,
        false,
      )
    } catch (e) {
      if (!(e && e.code === 409)) throw e
    }
  }
}

async function ensureIntegerAttribute(collectionId, key, required = false, xdefault = undefined) {
  try {
    await databases.getAttribute(databaseId, collectionId, key)
  } catch {
    try {
      await databases.createIntegerAttribute(
        databaseId,
        collectionId,
        key,
        required,
        xdefault,
        undefined,
        undefined,
        false,
      )
    } catch (e) {
      if (!(e && e.code === 409)) throw e
    }
  }
}

async function ensureEnumAttribute(
  collectionId,
  key,
  elements,
  required = false,
  xdefault = undefined,
  array = false,
) {
  try {
    await databases.getAttribute(databaseId, collectionId, key)
  } catch {
    try {
      await databases.createEnumAttribute(
        databaseId,
        collectionId,
        key,
        elements,
        required,
        xdefault,
        array,
      )
    } catch (e) {
      if (!(e && e.code === 409)) throw e
    }
  }
}

async function ensureIndex(
  collectionId,
  key,
  attributes,
  type = 'key',
  orders = undefined,
) {
  try {
    await databases.getIndex(databaseId, collectionId, key)
  } catch {
    try {
      await databases.createIndex(databaseId, collectionId, key, type, attributes, orders)
    } catch (e) {
      if (!(e && e.code === 409)) throw e
    }
  }
}

async function ensureBucket(bucketId, name) {
  try {
    await storage.getBucket(bucketId)
  } catch {
    try {
      await storage.createBucket(bucketId, name, defaultCollectionPermissions, true, true)
    } catch (e) {
      if (!(e && e.code === 409)) throw e
    }
  }
}

async function provisionProjects() {
  const c = COLLECTION_IDS.projects
  await ensureCollection(c, 'Projects')
  await ensureStringAttribute(c, 'name', 128, true)
  await ensureStringAttribute(c, 'code', 32, true)
  await ensureTextAttribute(c, 'description', false)
  await ensureStringAttribute(c, 'team_id', 64, true)
  await ensureIndex(c, 'idx_code_unique', ['code'], 'unique')
}

async function provisionSuites() {
  const c = COLLECTION_IDS.suites
  await ensureCollection(c, 'Suites')
  await ensureStringAttribute(c, 'project_id', 36, true)
  await ensureStringAttribute(c, 'name', 128, true)
  await ensureStringAttribute(c, 'parent_id', 36, false)
  await ensureTextAttribute(c, 'description', false)
  await ensureIndex(c, 'idx_project_id', ['project_id'])
  await ensureIndex(c, 'idx_parent_id', ['parent_id'])
}

async function provisionTestCases() {
  const c = COLLECTION_IDS.testCases
  await ensureCollection(c, 'Test Cases')
  await ensureStringAttribute(c, 'project_id', 36, true)
  await ensureStringAttribute(c, 'suite_id', 36, true)
  await ensureStringAttribute(c, 'title', 256, true)
  await ensureTextAttribute(c, 'pre_conditions', false)
  await ensureTextAttribute(c, 'post_conditions', false)
  await ensureEnumAttribute(c, 'severity', ['Blocker', 'Critical', 'High', 'Medium', 'Low'], true)
  await ensureEnumAttribute(c, 'priority', ['P0', 'P1', 'P2', 'P3'], true)
  await ensureTextAttribute(c, 'steps', true)
  await ensureIndex(c, 'idx_project_id', ['project_id'])
  await ensureIndex(c, 'idx_suite_id', ['suite_id'])
  await ensureIndex(c, 'idx_severity', ['severity'])
  await ensureIndex(c, 'idx_priority', ['priority'])
}

async function provisionEnvironments() {
  const c = COLLECTION_IDS.environments
  await ensureCollection(c, 'Environments')
  await ensureStringAttribute(c, 'project_id', 36, true)
  await ensureStringAttribute(c, 'name', 128, true)
  await ensureTextAttribute(c, 'description', false)
  await ensureIndex(c, 'idx_project_id', ['project_id'])
}

async function provisionTestRuns() {
  const c = COLLECTION_IDS.testRuns
  await ensureCollection(c, 'Test Runs')
  await ensureStringAttribute(c, 'project_id', 36, true)
  await ensureStringAttribute(c, 'environment_id', 36, true)
  await ensureStringAttribute(c, 'title', 256, true)
  await ensureEnumAttribute(c, 'status', ['draft', 'in_progress', 'completed'], true)
  await ensureIntegerAttribute(c, 'progress_percentage', true)
  await ensureIndex(c, 'idx_project_id', ['project_id'])
  await ensureIndex(c, 'idx_status', ['status'])
}

async function provisionRunResults() {
  const c = COLLECTION_IDS.runResults
  await ensureCollection(c, 'Run Results')
  await ensureStringAttribute(c, 'project_id', 36, true)
  await ensureStringAttribute(c, 'run_id', 36, true)
  await ensureStringAttribute(c, 'case_id', 36, true)
  await ensureEnumAttribute(c, 'status', ['not_run', 'passed', 'failed', 'blocked'], true)
  await ensureTextAttribute(c, 'step_results', false, '[]')
  await ensureTextAttribute(c, 'notes', false)
  await ensureIndex(c, 'idx_run_id', ['run_id'])
  await ensureIndex(c, 'idx_case_id', ['case_id'])
  await ensureIndex(c, 'idx_status', ['status'])
}

async function provisionIssues() {
  const c = COLLECTION_IDS.issues
  await ensureCollection(c, 'Issues')
  await ensureStringAttribute(c, 'project_id', 36, true)
  await ensureStringAttribute(c, 'title', 256, true)
  await ensureTextAttribute(c, 'description', false)
  await ensureEnumAttribute(c, 'severity', ['Blocker', 'Critical', 'High', 'Medium', 'Low'], true)
  await ensureEnumAttribute(c, 'status', ['open', 'in_progress', 'resolved', 'closed'], true)
  await ensureStringAttribute(c, 'case_id', 36, false)
  await ensureStringAttribute(c, 'run_id', 36, false)
  await ensureStringAttribute(c, 'evidence_file_ids', 36, false, undefined, true)
  await ensureIndex(c, 'idx_project_id', ['project_id'])
  await ensureIndex(c, 'idx_status', ['status'])
  await ensureIndex(c, 'idx_severity', ['severity'])
  await ensureIndex(c, 'idx_run_id', ['run_id'])
  await ensureIndex(c, 'idx_case_id', ['case_id'])
}

async function main() {
  await ensureDatabase()
  await ensureBucket(issueEvidencesBucketId, 'Issue evidences')

  await provisionProjects()
  await provisionSuites()
  await provisionTestCases()
  await provisionEnvironments()
  await provisionTestRuns()
  await provisionRunResults()
  await provisionIssues()

  console.log('Provisionamento do TMCTQS concluído.')
  console.log(`Database: ${databaseId}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
