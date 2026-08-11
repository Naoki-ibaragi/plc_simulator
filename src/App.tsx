import { useContext } from 'react'
import './App.css'
import LadderDisplay from './Ladder/LadderDisplay'
import CellEditWindow from './Ladder/CellEditWindow'
import { EditCellStatusContext } from './Ladder/LadderContext'
import DeviceList from './Ladder/DeviceList'
import MainMenu from './MainMenu'
import TouchPanel from './Touchpanel/Touchpanel'
import TpElementBar from './Touchpanel/TpElementBar'
import TpElementEditWindow from './Touchpanel/TpElementEditWindow'
import { RuntimeContext } from './Runtime/RuntimeContext'
import PickAndPlace from './Equipment/PickAndPlace'
import NewWindowPortal from './NewWindowPortal'

function App() {
  const { ladderMap,showTouchPanel,setShowTouchPanel,showEquipment,setShowEquipment } = useContext(EditCellStatusContext);
  const {deviceComment,setDeviceComment} = useContext(EditCellStatusContext);
  const { mode, compileErrors, tryEnterRun, exitToEdit } = useContext(RuntimeContext);

  return (
    <div className='flex flex-col h-screen'>
      <MainMenu
        showTouchPanel={showTouchPanel} setShowTouchPanel={setShowTouchPanel}
        showEquipment={showEquipment} setShowEquipment={setShowEquipment}
        mode={mode} tryEnterRun={tryEnterRun} exitToEdit={exitToEdit}
      />
      {compileErrors.length > 0 && (
        <div className='border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700'>
          <p className='font-medium'>コンパイルエラー: 未結線のセルがあります</p>
          <ul className='list-disc pl-5'>
            {compileErrors.map((err, i) => (
              <li key={i}>{`行${err.row + 1} 列${err.col + 1}: ${err.cell} が${err.message}`}</li>
            ))}
          </ul>
        </div>
      )}
      <div className='flex flex-1 min-h-0'>
        <DeviceList deviceComment={deviceComment} setDeviceComment={setDeviceComment}/>
        <div className='flex flex-col flex-1 min-w-0 min-h-0'>
          <div className='w-full flex-1 min-h-0 overflow-auto bg-gray-50'>
            <LadderDisplay ladderMap={ladderMap} deviceComment={deviceComment}/>
          </div>
        </div>
      </div>
      <CellEditWindow />
      {showTouchPanel && (
        <NewWindowPortal title='タッチパネル' width={900} height={520} onClose={() => setShowTouchPanel(false)}>
          <div className='flex h-full flex-col bg-gray-50'>
            <TouchPanel />
            {mode === 'EDIT' && <TpElementBar />}
            <TpElementEditWindow />
          </div>
        </NewWindowPortal>
      )}
      {showEquipment && (
        <NewWindowPortal title='設備モデル' width={900} height={600} onClose={() => setShowEquipment(false)}>
          <div className='h-full w-full bg-gray-50'>
            <PickAndPlace />
          </div>
        </NewWindowPortal>
      )}
    </div>
  )
}

export default App
