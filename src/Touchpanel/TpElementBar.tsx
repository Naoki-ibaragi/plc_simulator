import { LADDER_WIDTH } from '../layoutConstants'

function TpElementBar() {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, elementType: "LAMP" | "BUTTON" | "TEXT") => {
    e.dataTransfer.setData("text/plain", elementType);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="flex items-center gap-6 shrink-0 px-4 py-3 border border-gray-300 bg-gray-100 rounded-b-lg" style={{ width: LADDER_WIDTH }}>
      <span className="text-sm text-gray-600">部品をドラッグして配置</span>
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, "LAMP")}
        className="w-10 h-10 rounded-full border-2 border-gray-600 bg-gray-300 cursor-grab active:cursor-grabbing"
        title="ランプ"
      />
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, "BUTTON")}
        className="w-10 h-10 rounded-full border-2 border-gray-600 bg-blue-500 cursor-grab active:cursor-grabbing"
        title="ボタン"
      />
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, "TEXT")}
        className="w-15 h-10 border-2 border-gray-600 bg-gray-300 cursor-grab active:cursor-grabbing text-center"
        title="テキスト"
      >Text</div>
    </div>
  )
}

export default TpElementBar
