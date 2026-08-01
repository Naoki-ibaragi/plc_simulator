import React from 'react'
import { type runMode } from './Runtime/RuntimeContext'

function MainMenu(
    {
        showDeviceList, setShowDeviceList,
        showLadder, setShowLadder,
        showTouchPanel, setShowTouchPanel,
        showEquipment, setShowEquipment,
        mode, tryEnterRun, exitToEdit,
    }:
    {
        showDeviceList: boolean,
        setShowDeviceList: React.Dispatch<React.SetStateAction<boolean>>,
        showLadder: boolean,
        setShowLadder: React.Dispatch<React.SetStateAction<boolean>>,
        showTouchPanel: boolean,
        setShowTouchPanel: React.Dispatch<React.SetStateAction<boolean>>,
        showEquipment: boolean,
        setShowEquipment: React.Dispatch<React.SetStateAction<boolean>>,
        mode: runMode,
        tryEnterRun: () => void,
        exitToEdit: () => void,
    }
) {
  const tabClass = (active: boolean) => `
    px-4 py-2
    text-sm
    font-medium
    rounded-md
    transition
    ${active
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-gray-600 hover:bg-gray-100'}
  `;

  return (
    <div className='flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2'>
      <button type='button' className={tabClass(showDeviceList)} onClick={() => setShowDeviceList(prev => !prev)}>
        デバイスリスト
      </button>
      <button type='button' className={tabClass(showLadder)} onClick={() => setShowLadder(prev => !prev)}>
        ラダー図
      </button>
      <button type='button' className={tabClass(showTouchPanel)} onClick={() => setShowTouchPanel(prev => !prev)}>
        タッチパネル
      </button>
      <button type='button' className={tabClass(showEquipment)} onClick={() => setShowEquipment(prev => !prev)}>
        設備モデル
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
