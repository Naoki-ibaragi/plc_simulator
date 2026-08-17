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
import { downloadJson, pickJsonFile, readJsonFile } from '../fileIO'
import type { ladderCell } from './Variants'

type LadderSaveData = {
    type: 'ladder',
    ladderMap: ladderCell[][],
    deviceComment: { [key: string]: string },
}

const ladderToolButtonClass = `
  px-2 py-1
  text-xs
  font-medium
  rounded-md
  border border-gray-300
  text-gray-600
  transition
  hover:bg-gray-100
`;

function LadderPageContent({ equipment }: { equipment: EquipmentEntry }) {
  const { ladderMap,showTouchPanel,setShowTouchPanel,showLadder,setShowLadder } = useContext(EditCellStatusContext);
  const { deviceComment,setDeviceComment,setLadderMap,showDeviceList,setShowDeviceList,ladderDoc } = useContext(EditCellStatusContext);
  const { mode, compileErrors, tryEnterRun, exitToEdit } = useContext(RuntimeContext);
  const EquipmentComponent = equipment.component;

  const handleSaveLadder = () => {
    const data: LadderSaveData = { type: 'ladder', ladderMap, deviceComment };
    downloadJson('ladder.json', data, ladderDoc);
  };

  const handleLoadLadder = async () => {
    const file = await pickJsonFile(ladderDoc);
    if (!file) return;
    try {
      const data = await readJsonFile<LadderSaveData>(file);
      if (data.type !== 'ladder') {
        ladderDoc.defaultView?.alert('ラダー用のファイルではありません');
        return;
      }
      if (!ladderDoc.defaultView?.confirm('現在のラダーデータを上書きして読み込みます。よろしいですか？')) return;
      setLadderMap(data.ladderMap);
      setDeviceComment(data.deviceComment);
    } catch (e) {
      ladderDoc.defaultView?.alert(e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました');
    }
  };

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
        <NewWindowPortal title='ラダー' width={1220} height={720} resizable onClose={() => setShowLadder(false)}>
          <div className='flex h-full flex-col bg-gray-50'>
            <LadderDocumentSync />
            <div className='flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2'>
              <button type='button' className={ladderToolButtonClass} onClick={() => setShowDeviceList((prev) => !prev)}>
                デバイスリスト{showDeviceList ? '非表示' : '表示'}
              </button>
              <span className='mx-1 h-6 w-px bg-gray-200' />
              <button type='button' className={ladderToolButtonClass} onClick={handleSaveLadder}>
                ラダー保存
              </button>
              <button type='button' className={ladderToolButtonClass} onClick={handleLoadLadder}>
                ラダー読込
              </button>
            </div>
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
              {showDeviceList && <DeviceList deviceComment={deviceComment} setDeviceComment={setDeviceComment}/>}
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
