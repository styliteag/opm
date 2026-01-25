import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import Home from './pages/Home.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import Login from './pages/Login.tsx'
import Networks from './pages/Networks.tsx'
import NetworkDetail from './pages/NetworkDetail.tsx'
import Scans from './pages/Scans.tsx'
import ScanDetail from './pages/ScanDetail.tsx'
import Alerts from './pages/Alerts.tsx'
import Scanners from './pages/Scanners.tsx'
import Users from './pages/Users.tsx'
import OpenPorts from './pages/OpenPorts.tsx'
import './index.css'

const queryClient = new QueryClient()
const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'networks',
        element: <Networks />,
      },
      {
        path: 'networks/:networkId',
        element: <NetworkDetail />,
      },
      {
        path: 'scans',
        element: <Scans />,
      },
      {
        path: 'scans/:scanId',
        element: <ScanDetail />,
      },
      {
        path: 'alerts',
        element: <Alerts />,
      },
      {
        path: 'ports',
        element: <OpenPorts />,
      },
      {
        path: 'scanners',
        element: <Scanners />,
      },
      {
        path: 'users',
        element: <Users />,
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
