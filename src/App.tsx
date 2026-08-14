import { Route, Routes } from 'react-router-dom'
import MainPage from './MainPage'
import LadderPage from './Ladder/LadderPage'

function App() {
  return (
    <Routes>
      <Route path='/' element={<MainPage />} />
      <Route path='/ladder/:equipmentId' element={<LadderPage />} />
    </Routes>
  )
}

export default App
