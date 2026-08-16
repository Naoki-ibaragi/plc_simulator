import { Suspense, useContext } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import LadderDisplay from './LadderDisplay'
import CellEditWindow from './CellEditWindow'
import { EditCellStatusContext } from './LadderContext'
import DeviceList from './DeviceList'
import LadderDocumentSync from './LadderDocumentSync'
import MainMenu from '../MainMenu'
import TouchPanel from '../Touchpanel/Touchpanel'
import TpElementBar from '../Touchpanel/TpElementBar'
import TpElementEditWindow from '../Touchpanel/TpElementEditWindow'
import { RuntimeContext } from '../Runtime/RuntimeContext'
import NewWindowPortal from '../NewWindowPortal'
import { UserProvider } from './LadderProvider'
import { RuntimeProvider } from '../Runtime/RuntimeProvider'
import { TpProvider } from '../Touchpanel/TpProvider'
import { getEquipmentById, type EquipmentEntry } from '../Equipment/registry'
import EquipmentLoading from '../Equipment/EquipmentLoading'

function LadderPageContent({ equipment }: { equipment: EquipmentEntry }) {
  const { ladderMap,showTouchPanel,setShowTouchPanel,showLadder,setShowLadder } = useContext(EditCellStatusContext);
  const { deviceComment,setDeviceComment } = useContext(EditCellStatusContext);
  const { mode, compileErrors, tryEnterRun, exitToEdit } = useContext(RuntimeContext);
  const EquipmentComponent = equipment.component;

  return (
    <div className='flex flex-col h-screen'>
      <MainMenu
        equipmentLabel={equipment.label}
        showTouchPanel={showTouchPanel} setShowTouchPanel={setShowTouchPanel}
        showLadder={showLadder} setShowLadder={setShowLadder}
        mode={mode} tryEnterRun={tryEnterRun} exitToEdit={exitToEdit}
      />
      <div className='flex-1 min-h-0'>
        <Suspense fallback={<EquipmentLoading />}>
          <EquipmentComponent />
        </Suspense>
      </div>
      {showTouchPanel && (
        <NewWindowPortal title='タッチパネル' width={900} height={520} onClose={() => setShowTouchPanel(false)}>
          <div className='flex h-full flex-col bg-gray-50'>
            <TouchPanel />
            {mode === 'EDIT' && <TpElementBar />}
            <TpElementEditWindow />
          </div>
        </NewWindowPortal>
      )}
      {showLadder && (
        <NewWindowPortal title='ラダー' width={1200} height={720} resizable onClose={() => setShowLadder(false)}>
          <div className='flex h-full flex-col bg-gray-50'>
            <LadderDocumentSync />
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
          </div>
        </NewWindowPortal>
      )}
    </div>
  )
}

//URLの設備モデルIDごとに、ラダー/タッチパネルのstateを完全に独立させて持たせる
//(equipmentIdをkeyにしてProvider一式を再マウントすることで、別の設備モデルへ切り替えた際に前の設備のデータが混ざらないようにする)
function LadderPage() {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  const equipment = equipmentId ? getEquipmentById(equipmentId) : undefined;

  if (!equipmentId || !equipment) return <Navigate to='/' replace />;

  return (
    <UserProvider key={equipmentId} storageKey={equipmentId}>
      <RuntimeProvider>
        <TpProvider storageKey={equipmentId}>
          <LadderPageContent equipment={equipment} />
        </TpProvider>
      </RuntimeProvider>
    </UserProvider>
  )
}

export default LadderPage
