import { useEffect, useState } from "react";
import { type ReactNode } from "react";
import { TpContext } from "./TpContext";
import { type tpElementObj } from "./TpVariants";
import { touchpanelStorageKey } from "../storageKeys";

interface Props {
  storageKey: string;
  children: ReactNode;
}

//設備モデル(storageKey)ごとに保存済みのタッチパネル配置を読み込む。保存が無ければ空配列
function loadSavedTpElements(storageKey: string): tpElementObj[] {
    try {
        const raw = localStorage.getItem(touchpanelStorageKey(storageKey));
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function TpProvider({ storageKey, children }: Props) {
    const [tpElements, setTpElements] = useState<tpElementObj[]>(() => loadSavedTpElements(storageKey));
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editX, setEditX] = useState(0);
    const [editY, setEditY] = useState(0);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

    //タッチパネル配置の変更を設備モデルごとに自動保存する
    useEffect(() => {
      localStorage.setItem(touchpanelStorageKey(storageKey), JSON.stringify(tpElements));
    }, [storageKey, tpElements]);

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
