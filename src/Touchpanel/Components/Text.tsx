import type { textObj } from '../TpVariants'

const colorClassMap: Record<textObj["color"], string> = {
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-400",
}

type textProps = {
  obj: textObj,
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void,
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
}

function Text({ obj, onDoubleClick, onDragStart }: textProps) {
  return (
    <div
      draggable
      className={`absolute w-20 h-10 border-2 border-gray-600 cursor-move ${colorClassMap[obj.color]}`}
      style={{ left: obj.pointX, top: obj.pointY }}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
    >
        {obj.content}
    </div>
  )
}

export default Text
