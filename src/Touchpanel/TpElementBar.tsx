import { useContext } from 'react'
import { LADDER_WIDTH } from '../layoutConstants'
import { TpContext } from './TpContext'
import type { tpElementObj } from './TpVariants'
import { downloadJson, pickJsonFile, readJsonFile } from '../fileIO'

type TpSaveData = {
  type: 'touchpanel',
  tpElements: tpElementObj[],
}

function TpElementBar() {
  const { tpElements, setTpElements } = useContext(TpContext);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, elementType: "LAMP" | "BUTTON" | "TEXT") => {
    e.dataTransfer.setData("text/plain", elementType);
    e.dataTransfer.effectAllowed = "copy";
  };

  //別ウィンドウ内のボタンなので、ダウンロード/ファイル選択はそのウィンドウのdocumentを使う
  const handleSave = (e: React.MouseEvent<HTMLButtonElement>) => {
    const data: TpSaveData = { type: 'touchpanel', tpElements };
    downloadJson('touchpanel.json', data, e.currentTarget.ownerDocument);
  };

  const handleLoad = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const doc = e.currentTarget.ownerDocument;
    const file = await pickJsonFile(doc);
    if (!file) return;
    try {
      const data = await readJsonFile<TpSaveData>(file);
      if (data.type !== 'touchpanel') {
        doc.defaultView?.alert('タッチパネル用のファイルではありません');
        return;
      }
      if (!doc.defaultView?.confirm('現在のタッチパネルデータを上書きして読み込みます。よろしいですか？')) return;
      setTpElements(data.tpElements);
    } catch (err) {
      doc.defaultView?.alert(err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました');
    }
  };

  return (
    <div className="flex items-center gap-6 shrink-0 px-4 py-3 border border-gray-300 bg-gray-100 rounded-b-lg" style={{ width: LADDER_WIDTH }}>
      <span className="text-sm text-gray-600">部品をドラッグして配置</span>
      <button
        type='button'
        onClick={handleSave}
        className='px-2 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 transition hover:bg-gray-200'
      >
        保存
      </button>
      <button
        type='button'
        onClick={handleLoad}
        className='px-2 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 transition hover:bg-gray-200'
      >
        読込
      </button>
      <div className="flex flex-col items-center gap-1">
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, "LAMP")}
          className="w-10 h-10 rounded-md border-2 border-gray-600 bg-gray-300 cursor-grab active:cursor-grabbing"
          title="ランプ"
        />
        <span className="text-[10px] leading-none text-gray-600">ランプ</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, "BUTTON")}
          className="w-10 h-10 rounded-md border-2 border-gray-600 bg-blue-500 cursor-grab active:cursor-grabbing"
          title="ボタン"
        />
        <span className="text-[10px] leading-none text-gray-600">ボタン</span>
      </div>
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, "TEXT")}
        className="w-15 h-10 flex items-center justify-center border-2 border-gray-600 bg-gray-300 cursor-grab active:cursor-grabbing text-center"
        title="テキスト"
      >Text</div>
    </div>
  )
}

export default TpElementBar
