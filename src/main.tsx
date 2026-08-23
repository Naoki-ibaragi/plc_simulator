import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MathJaxContext } from 'better-react-mathjax'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <MathJaxContext>
      <App />
    </MathJaxContext>
  </BrowserRouter>
)
