import type { lampObj } from '../TpVariants'

const colorClassMap: Record<lampObj["color"], string> = {
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-400",
}

type LampProps = {
  obj: lampObj,
  isOn?: boolean, //bitDeviceのON/OFF状態
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void,
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
}

function Lamp({ obj, isOn = false, onDoubleClick, onDragStart }: LampProps) {
  return (
    <div
      draggable
      className={`absolute w-10 h-10 rounded-md border-2 border-gray-600 cursor-move ${isOn ? colorClassMap[obj.color] : "bg-gray-300"}`}
      style={{ left: obj.pointX, top: obj.pointY }}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
    />
  )
}

export default Lamp
