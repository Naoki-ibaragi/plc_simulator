import { useEffect, useState } from "react";
import { type ReactNode } from "react";
import { TpContext } from "./TpContext";
import { type tpElementObj } from "./TpVariants";

interface Props {
  children: ReactNode;
}

export function TpProvider({ children }: Props) {
    const [tpElements, setTpElements] = useState<tpElementObj[]>([]);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editX, setEditX] = useState(0);
    const [editY, setEditY] = useState(0);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

    //編集windowの外側をクリックしたら閉じる
    useEffect(() => {
      const handleDocumentClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-tp-edit-window]')) {
          setIsEditOpen(false);
        }
      };
      document.addEventListener('click', handleDocumentClick);
      return () => document.removeEventListener('click', handleDocumentClick);
    }, []);

    return (
        <TpContext.Provider
            value={{
                tpElements,
                setTpElements,
                isEditOpen,
                setIsEditOpen,
                editX,
                setEditX,
                editY,
                setEditY,
                selectedElementId,
                setSelectedElementId,
            }}
        >
            {children}
        </TpContext.Provider>
    );
}
