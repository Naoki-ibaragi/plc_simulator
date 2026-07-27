import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { UserProvider } from './UserProvider.tsx'
import { TpProvider } from './Touchpanel/TpProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <UserProvider>
    <TpProvider>
      <App />
    </TpProvider>
  </UserProvider>
)
