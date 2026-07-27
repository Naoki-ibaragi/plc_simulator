import { useContext } from 'react'
import './App.css'
import LadderDisplay from './LadderDisplay'
import CellEditWindow from './CellEditWindow'
import { EditCellStatusContext } from './UserContext'
import DeviceList from './DeviceList'
import MainMenu from './MainMenu'
import TouchPanel from './Touchpanel/Touchpanel'
import TpElementBar from './Touchpanel/TpElementBar'
import TpElementEditWindow from './Touchpanel/TpElementEditWindow'

function App() {
  const { ladderMap,displayPage,setDisplayPage } = useContext(EditCellStatusContext);
  const {deviceComment,setDeviceComment} = useContext(EditCellStatusContext);

  return (
    <div className='flex flex-col min-h-screen pr-72'>
      <MainMenu displayPage={displayPage} setDisplayPage={setDisplayPage}/>
      <div className='flex items-start gap-4 p-4 pt-16'>
        {displayPage === 2 ? (
          <div className='flex flex-col flex-1'>
            <TouchPanel />
            <TpElementBar />
          </div>
        ) : (
          <LadderDisplay ladderMap={ladderMap} deviceComment={deviceComment}/>
        )}
      </div>
      <CellEditWindow />
      <TpElementEditWindow />
      <DeviceList deviceComment={deviceComment} setDeviceComment={setDeviceComment}/>
    </div>
  )
}

export default App
