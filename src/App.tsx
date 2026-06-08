import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { RequireAuth } from './auth/auth'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { ExecutionPage } from './pages/ExecutionPage'
import { IssuesPage } from './pages/IssuesPage'
import { LoginPage } from './pages/LoginPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ReportsPage } from './pages/ReportsPage'
import { RunsListPage } from './pages/RunsListPage'
import { SuitesPage } from './pages/SuitesPage'
import { TestCasesPage } from './pages/TestCasesPage'
import { TestRunPage } from './pages/TestRunPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'dashboards', element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'tests', element: <SuitesPage /> },
      { path: 'test-cases', element: <TestCasesPage /> },
      { path: 'execution', element: <ExecutionPage /> },
      { path: 'execution/:runId', element: <TestRunPage /> },
      { path: 'runs', element: <RunsListPage /> },
      { path: 'issues', element: <IssuesPage /> },
      { path: 'reports', element: <ReportsPage /> },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
