import { useContext, useEffect, useRef, useState } from 'react'
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
import Equipment from './Equipment/Equipment'

function App() {
  const { ladderMap,showDeviceList,setShowDeviceList,showLadder,setShowLadder,showTouchPanel,setShowTouchPanel,showEquipment,setShowEquipment } = useContext(EditCellStatusContext);
  const {deviceComment,setDeviceComment} = useContext(EditCellStatusContext);
  const { mode, compileErrors, tryEnterRun, exitToEdit } = useContext(RuntimeContext);
  const showBoth = showLadder && showTouchPanel;

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [ladderHeightPercent, setLadderHeightPercent] = useState(50);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const percent = ((e.clientY - rect.top) / rect.height) * 100;
      setLadderHeightPercent(Math.min(90, Math.max(10, percent)));
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className='flex flex-col h-screen'>
      <MainMenu
        showDeviceList={showDeviceList} setShowDeviceList={setShowDeviceList}
        showLadder={showLadder} setShowLadder={setShowLadder}
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
        {showDeviceList && (
          <DeviceList deviceComment={deviceComment} setDeviceComment={setDeviceComment}/>
        )}
        <div ref={splitContainerRef} className='flex flex-col flex-1 min-w-0 min-h-0'>
          {showLadder && (
            <div
              className={`w-full overflow-auto bg-gray-50 ${showBoth ? 'shrink-0' : 'flex-1 min-h-0'}`}
              style={showBoth ? { height: `${ladderHeightPercent}%` } : undefined}
            >
              <LadderDisplay ladderMap={ladderMap} deviceComment={deviceComment}/>
            </div>
          )}
          {showBoth && (
            <div
              onMouseDown={() => { isDraggingRef.current = true; }}
              className='h-1.5 w-full shrink-0 cursor-row-resize bg-gray-300 hover:bg-blue-400 transition-colors'
            />
          )}
          {showTouchPanel && (
            <div className='flex-1 min-h-0 w-full overflow-auto bg-gray-50 flex flex-col'>
              <TouchPanel />
              {mode === 'EDIT' && <TpElementBar />}
            </div>
          )}
          
          {showEquipment && (
            <div className='flex-1 min-h-0 w-full overflow-hidden bg-gray-50 border-t border-gray-200'>
              <Equipment />
            </div>
          )}
          {/*showEquipment && (
            <div className='flex-1 min-h-0 w-full overflow-hidden bg-gray-50 border-t border-gray-200'>
              <ControlPanel />
            </div>
          )*/}
        </div>
      </div>
      <CellEditWindow />
      <TpElementEditWindow />
    </div>
  )
}

export default App
