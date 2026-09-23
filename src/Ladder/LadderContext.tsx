import React from "react";
import { createContext } from "react";
import { type ladderCell, createDeviceComment, createInitialLadderMap } from "./Variants";

export type editCellStatus = {
    isOpen:boolean,
    setIsOpen:React.Dispatch<React.SetStateAction<boolean>>,
    cellX:number,
    setCellX:React.Dispatch<React.SetStateAction<number>>,
    cellY:number,
    setCellY:React.Dispatch<React.SetStateAction<number>>,
    selectedRow:number,
    setSelectedRow:React.Dispatch<React.SetStateAction<number>>,
    selectedCol:number,
    setSelectedCol:React.Dispatch<React.SetStateAction<number>>,
    selectionEndRow:number,
    setSelectionEndRow:React.Dispatch<React.SetStateAction<number>>,
    selectionEndCol:number,
    setSelectionEndCol:React.Dispatch<React.SetStateAction<number>>,
    ladderMap:ladderCell[][],
    setLadderMap:React.Dispatch<React.SetStateAction<ladderCell[][]>>,
    deviceComment:{[key:string]:string}
    setDeviceComment:React.Dispatch<React.SetStateAction<{[key:string]:string}>>,
    initialInput:string,
    setInitialInput:React.Dispatch<React.SetStateAction<string>>,
    showTouchPanel:boolean,
    setShowTouchPanel:React.Dispatch<React.SetStateAction<boolean>>,
    showLadder:boolean,
    setShowLadder:React.Dispatch<React.SetStateAction<boolean>>,
    showDeviceList:boolean,
    setShowDeviceList:React.Dispatch<React.SetStateAction<boolean>>,
    ladderDoc:Document,
    setLadderDoc:React.Dispatch<React.SetStateAction<Document>>,
    insertCommentRow:() => void, //選択行に行コメント行を挿入し(以下の行は一つ下へずれる)、コメント入力を開始する
}

//selectedRow/selectedCol/selectionEndRow/selectionEndColは、セル選択操作のたびに変化する。
//ラダーは多数のマス(行数×COLUMN_NUM)描画されるため、この4値だけをEditCellStatusContextと同居させると、
//isOpen/cellX/cellY/ladderDoc等、選択と無関係な項目が変化するたびにも全マスが再レンダーされてしまう。
//セルの表示(選択枠のハイライト)に直接必要なこの部分だけを切り出し、選択操作以外では全マスの再レンダーが起きないようにする
export type ladderSelectionStatus = {
    selectedRow:number,
    setSelectedRow:React.Dispatch<React.SetStateAction<number>>,
    selectedCol:number,
    setSelectedCol:React.Dispatch<React.SetStateAction<number>>,
    selectionEndRow:number,
    setSelectionEndRow:React.Dispatch<React.SetStateAction<number>>,
    selectionEndCol:number,
    setSelectionEndCol:React.Dispatch<React.SetStateAction<number>>,
    setCellX:React.Dispatch<React.SetStateAction<number>>,
    setCellY:React.Dispatch<React.SetStateAction<number>>,
    setIsOpen:React.Dispatch<React.SetStateAction<boolean>>,
}

export const LadderSelectionContext = createContext<ladderSelectionStatus>({
    selectedRow: -1,
    setSelectedRow: () => {},
    selectedCol: -1,
    setSelectedCol: () => {},
    selectionEndRow: -1,
    setSelectionEndRow: () => {},
    selectionEndCol: -1,
    setSelectionEndCol: () => {},
    setCellX: () => {},
    setCellY: () => {},
    setIsOpen: () => {},
});

export const EditCellStatusContext = createContext<editCellStatus>({
    isOpen: false,
    setIsOpen: () => {},
    cellX: 0,
    setCellX: () => {},
    cellY: 0,
    setCellY: () => {},
    selectedRow: -1,
    setSelectedRow: () => {},
    selectedCol: -1,
    setSelectedCol: () => {},
    selectionEndRow: -1,
    setSelectionEndRow: () => {},
    selectionEndCol: -1,
    setSelectionEndCol: () => {},
    ladderMap: createInitialLadderMap(),
    setLadderMap: () => {},
    deviceComment:createDeviceComment(),
    setDeviceComment: ()=>{},
    initialInput: '',
    setInitialInput: () => {},
    showTouchPanel: false,
    setShowTouchPanel: () => {},
    showLadder: false,
    setShowLadder: () => {},
    showDeviceList: true,
    setShowDeviceList: () => {},
    ladderDoc: document,
    setLadderDoc: () => {},
    insertCommentRow: () => {},
});