import React, { useContext } from 'react'
import { type runMode } from './Runtime/RuntimeContext'
import { EditCellStatusContext } from './Ladder/LadderContext'
import { downloadJson, pickJsonFile, readJsonFile } from './fileIO'
import type { ladderCell } from './Ladder/Variants'

type LadderSaveData = {
    type: 'ladder',
    ladderMap: ladderCell[][],
    deviceComment: { [key: string]: string },
}

function MainMenu(
    {
        showTouchPanel, setShowTouchPanel,
        showEquipment, setShowEquipment,
        mode, tryEnterRun, exitToEdit,
    }:
    {
        showTouchPanel: boolean,
        setShowTouchPanel: React.Dispatch<React.SetStateAction<boolean>>,
        showEquipment: boolean,
        setShowEquipment: React.Dispatch<React.SetStateAction<boolean>>,
        mode: runMode,
        tryEnterRun: () => void,
        exitToEdit: () => void,
    }
) {
  const { ladderMap, deviceComment, setLadderMap, setDeviceComment } = useContext(EditCellStatusContext);

  const handleSaveLadder = () => {
    const data: LadderSaveData = { type: 'ladder', ladderMap, deviceComment };
    downloadJson('ladder.json', data);
  };

  const handleLoadLadder = async () => {
    const file = await pickJsonFile();
    if (!file) return;
    try {
      const data = await readJsonFile<LadderSaveData>(file);
      if (data.type !== 'ladder') {
        window.alert('ラダー用のファイルではありません');
        return;
      }
      if (!window.confirm('現在のラダーデータを上書きして読み込みます。よろしいですか？')) return;
      setLadderMap(data.ladderMap);
      setDeviceComment(data.deviceComment);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました');
    }
  };

  const fileButtonClass = `
    px-2 py-1
    text-xs
    font-medium
    rounded-md
    border border-gray-300
    text-gray-600
    transition
    hover:bg-gray-100
  `;

  const tabClass = (active: boolean) => `
    px-4 py-2
    text-sm
    font-medium
    rounded-md
    transition
    disabled:opacity-60
    disabled:cursor-not-allowed
    ${active
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-gray-600 hover:bg-gray-100'}
  `;

  return (
    <div className='flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2'>
      <button type='button' className={fileButtonClass} onClick={handleSaveLadder}>
        ラダー保存
      </button>
      <button type='button' className={fileButtonClass} onClick={handleLoadLadder}>
        ラダー読込
      </button>
      <button type='button' className={tabClass(showTouchPanel)} disabled={showTouchPanel} onClick={() => setShowTouchPanel(true)}>
        タッチパネル{showTouchPanel ? '(表示中)' : ''}
      </button>
      <button type='button' className={tabClass(showEquipment)} disabled={showEquipment} onClick={() => setShowEquipment(true)}>
        設備モデル{showEquipment ? '(表示中)' : ''}
      </button>
      <span className='mx-2 h-6 w-px bg-gray-200' />
      {mode === 'EDIT' ? (
        <button
          type='button'
          onClick={tryEnterRun}
          className='px-4 py-2 text-sm font-medium rounded-md transition bg-green-600 text-white shadow-sm hover:bg-green-700'
        >
          ▶ 実行
        </button>
      ) : (
        <button
          type='button'
          onClick={exitToEdit}
          className='px-4 py-2 text-sm font-medium rounded-md transition bg-red-600 text-white shadow-sm hover:bg-red-700'
        >
          ■ 編集に戻る
        </button>
      )}
    </div>
  )
}

export default MainMenu
