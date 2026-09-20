import { initI18n } from '@zentao/i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@zentao/design-system/style.css'
import { AppRouter } from './app/app-router'
import { AppProviders } from './app/providers/app-providers'

initI18n()

async function enableMocking(): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_API_MOCK === '1') {
    // domain-boundary-ok mock 基建的唯一激活点（00 §D4：MSW 默认关，VITE_API_MOCK=1 才起）
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }
}

void enableMocking().then(() => {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </StrictMode>,
  )
})
