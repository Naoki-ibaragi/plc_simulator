import { useContext, useRef } from 'react'
import { TpContext } from './TpContext'
import { createLampObj, createButtonObj, createTextObj } from './TpVariants'
import Lamp from './Components/Lamp'
import Button from './Components/Button'

const ELEMENT_SIZE = 40 //w-10 h-10
const ELEMENT_RADIUS = ELEMENT_SIZE / 2 //ドロップ位置を要素の中心に合わせるためのオフセット
const MOVE_DATA_TYPE = "application/x-tp-move" //配置済み要素の移動であることを示すdataTransferのキー

function Touchpanel() {
  const tpStatus = useContext(TpContext);
  const panelRef = useRef<HTMLDivElement>(null);

  const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    const moveData = e.dataTransfer.getData(MOVE_DATA_TYPE);
    if (moveData) {
      const { id, offsetX, offsetY } = JSON.parse(moveData);
      const pointX = clamp(e.clientX - rect.left - offsetX, rect.width - ELEMENT_SIZE);
      const pointY = clamp(e.clientY - rect.top - offsetY, rect.height - ELEMENT_SIZE);
      tpStatus.setTpElements(prev => prev.map(el => el.id === id ? { ...el, pointX, pointY } : el));
      return;
    }

    const pointX = clamp(e.clientX - rect.left - ELEMENT_RADIUS, rect.width - ELEMENT_SIZE);
    const pointY = clamp(e.clientY - rect.top - ELEMENT_RADIUS, rect.height - ELEMENT_SIZE);
    const elementType = e.dataTransfer.getData("text/plain");
    if (elementType === "LAMP") {
      tpStatus.setTpElements(prev => [...prev, createLampObj(pointX, pointY)]);
    } else if (elementType === "BUTTON") {
      tpStatus.setTpElements(prev => [...prev, createButtonObj(pointX, pointY)]);
    }
  };

  const handleElementDragStart = (e: React.DragEvent, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    e.dataTransfer.setData(MOVE_DATA_TYPE, JSON.stringify({ id, offsetX, offsetY }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDoubleClick = (e: React.MouseEvent, id: string) => {
    tpStatus.setEditX(e.clientX);
    tpStatus.setEditY(e.clientY);
    tpStatus.setSelectedElementId(id);
    tpStatus.setIsEditOpen(true);
  };

  return (
    <div
      ref={panelRef}
      className="relative w-[80%] h-[400px] bg-gray-800"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {tpStatus.tpElements.map((element) => {
        switch (element.elementType) {
          case "LAMP":
            return (
              <Lamp
                key={element.id}
                obj={element}
                onDoubleClick={(e) => handleDoubleClick(e, element.id)}
                onDragStart={(e) => handleElementDragStart(e, element.id)}
              />
            )
          case "BUTTON":
            return (
              <Button
                key={element.id}
                obj={element}
                onDoubleClick={(e) => handleDoubleClick(e, element.id)}
                onDragStart={(e) => handleElementDragStart(e, element.id)}
              />
            )
        }
      })}
    </div>
  )
}

export default Touchpanel
