import { Route, Routes } from 'react-router-dom'
import MainPage from './MainPage'
import AbountPLC from './Pages/AbountPLC'
import AboutLadder from './Pages/AboutLadder'
import AboutDevice from './Pages/AboutDevice'
import AboutSimulation from './Pages/AboutSimulation'
import AboutTouchpanel from './Pages/AboutTouchpanel'
import AfterClass from './Pages/AfterClass'
import LadderPage from './Ladder/LadderPage'

function App() {
  return (
    <Routes>
      <Route path='/' element={<MainPage />} />
      <Route path='/aboutPLC' element={<AbountPLC />} />
      <Route path='/aboutLadder' element={<AboutLadder />} />
      <Route path='/aboutDevice' element={<AboutDevice />} />
      <Route path='/aboutSimulation' element={<AboutSimulation />} />
      <Route path='/aboutTouchpanel' element={<AboutTouchpanel />} />
      <Route path='/afterClass' element={<AfterClass />} />
      <Route path='/ladder/:equipmentId' element={<LadderPage />} />
    </Routes>
  )
}

export default App
