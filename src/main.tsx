import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'
import App from './App.tsx'
import PublicLibraryStandalone from './pages/PublicLibraryStandalone.tsx'
import SharePageAccess from './pages/SharePageAccess.tsx'
import SpaceManagementWorkspacePage from './pages/SpaceManagementWorkspacePage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/public" element={<PublicLibraryStandalone />} />
          <Route path="/share/:token" element={<SharePageAccess />} />
          <Route path="/spaces/:teamId/manage" element={<SpaceManagementWorkspacePage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
