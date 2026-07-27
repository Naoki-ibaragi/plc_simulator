import { createContext } from "react";
import type { tpElementObj } from "./TpVariants";

export type tpStatus = {
    tpElements:tpElementObj[],
    setTpElements:React.Dispatch<React.SetStateAction<tpElementObj[]>>,
    isEditOpen:boolean,
    setIsEditOpen:React.Dispatch<React.SetStateAction<boolean>>,
    editX:number,
    setEditX:React.Dispatch<React.SetStateAction<number>>,
    editY:number,
    setEditY:React.Dispatch<React.SetStateAction<number>>,
    selectedElementId:string | null,
    setSelectedElementId:React.Dispatch<React.SetStateAction<string | null>>
}

export const TpContext = createContext<tpStatus>({
    tpElements: [],
    setTpElements: () => {},
    isEditOpen: false,
    setIsEditOpen: () => {},
    editX: 0,
    setEditX: () => {},
    editY: 0,
    setEditY: () => {},
    selectedElementId: null,
    setSelectedElementId: () => {},
});
