import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App'
import { ErrorBoundary } from './features/shell/ErrorBoundary'
import './i18n'
import { QueryProvider } from './lib/QueryProvider'
import { setupPwa } from './lib/pwa'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found in index.html')

createRoot(container).render(
  <StrictMode>
    {/* Per fora del router i del client de dades a posta: així també atrapa el
        que peti muntant-los, que és quan no hi hauria res per a ensenyar. */}
    <ErrorBoundary>
      <BrowserRouter>
        <QueryProvider>
          <App />
        </QueryProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

setupPwa()
