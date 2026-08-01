import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { UserProvider } from './Ladder/LadderProvider.tsx'
import { RuntimeProvider } from './Runtime/RuntimeProvider.tsx'
import { TpProvider } from './Touchpanel/TpProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <UserProvider>
    <RuntimeProvider>
      <TpProvider>
        <App />
      </TpProvider>
    </RuntimeProvider>
  </UserProvider>
)
