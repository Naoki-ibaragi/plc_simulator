import type { buttonObj } from '../TpVariants'

const colorClassMap: Record<buttonObj["color"], string> = {
  red: "bg-red-500 active:bg-red-700",
  green: "bg-green-500 active:bg-green-700",
  blue: "bg-blue-500 active:bg-blue-700",
  yellow: "bg-yellow-400 active:bg-yellow-600",
}

type ButtonProps = {
  obj: buttonObj,
  onPress?: () => void,
  onRelease?: () => void,
  onDoubleClick?: (e: React.MouseEvent<HTMLButtonElement>) => void,
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void
}

function Button({ obj, onPress, onRelease, onDoubleClick, onDragStart }: ButtonProps) {
  return (
    <button
      draggable
      className={`absolute w-10 h-10 rounded-md border-2 border-gray-600 shadow-md cursor-move ${colorClassMap[obj.color]}`}
      style={{ left: obj.pointX, top: obj.pointY }}
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
    />
  )
}

export default Button
