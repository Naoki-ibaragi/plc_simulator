import type { textObj } from '../TpVariants'

const colorClassMap: Record<textObj["color"], string> = {
  red: "text-red-500",
  green: "text-green-500",
  blue: "text-blue-500",
  yellow: "text-yellow-400",
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
      className={`absolute whitespace-nowrap bg-transparent cursor-move ${colorClassMap[obj.color]}`}
      style={{ left: obj.pointX, top: obj.pointY }}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
    >
        {obj.content}
    </div>
  )
}

export default Text
