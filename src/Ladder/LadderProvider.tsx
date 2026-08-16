import { useState, useEffect, useRef } from "react";
import { type ReactNode } from "react";
import { EditCellStatusContext } from "./LadderContext";
import { ROW_NUM, COLUMN_NUM, createInitialLadderMap, createDeviceComment, type ladderCell, type CellType, type CellDevice} from "./Variants";
import { ladderStorageKey } from "../storageKeys";

interface Props {
  storageKey: string;
  children: ReactNode;
}

//設備モデル(storageKey)ごとに保存済みのラダー/デバイスコメントを読み込む。保存が無ければnull
function loadSavedLadder(storageKey: string): { ladderMap: ladderCell[][], deviceComment: {[key:string]:string} } | null {
    try {
        const raw = localStorage.getItem(ladderStorageKey(storageKey));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function UserProvider({ storageKey, children }: Props) {
    const [isOpen,setIsOpen] = useState(false);
    const [cellX,setCellX] = useState(0);
    const [cellY,setCellY] = useState(0);
    const [selectedRow,setSelectedRow] = useState(-1);
    const [selectedCol,setSelectedCol] = useState(-1);
    const [selectionEndRow,setSelectionEndRow] = useState(-1);
    const [selectionEndCol,setSelectionEndCol] = useState(-1);
    const [ladderMap,setLadderMap] = useState<ladderCell[][]>(() => loadSavedLadder(storageKey)?.ladderMap ?? createInitialLadderMap());
    const [deviceComment,setDeviceComment] = useState(() => loadSavedLadder(storageKey)?.deviceComment ?? createDeviceComment());
    const [initialInput,setInitialInput] = useState('');
    const [showTouchPanel,setShowTouchPanel] = useState(false);
    const [showLadder,setShowLadder] = useState(false);
    const [ladderDoc,setLadderDoc] = useState<Document>(document);
    const copiedCellsRef = useRef<{ cell:CellType, device:CellDevice }[][] | null>(null);
    const lastCloseAtRef = useRef(0);

    //編集windowが閉じた直後の時刻を記録する(キーリピート/チャタリングでEnterが連続発火した際、
    //閉じた直後の余分な1回で誤って再度開いてしまうのを防ぐために使う)
    useEffect(() => {
      if(!isOpen) lastCloseAtRef.current = Date.now();
    }, [isOpen]);

    //ラダー/デバイスコメントの変更を設備モデルごとに自動保存する
    useEffect(() => {
      localStorage.setItem(ladderStorageKey(storageKey), JSON.stringify({ ladderMap, deviceComment }));
    }, [storageKey, ladderMap, deviceComment]);

    //ラダーポップアップを閉じたら選択状態をリセットする(ladderDocが元のwindowへ戻った後、
    //選択したままのセルを探せず操作が空振りするのを防ぐ)
    useEffect(() => {
      if (showLadder) return;
      setIsOpen(false);
      setSelectedRow(-1);
      setSelectedCol(-1);
      setSelectionEndRow(-1);
      setSelectionEndCol(-1);
    }, [showLadder]);

    //ラダー以外でクリックをしたらセルの選択を外す
    useEffect(() => {
      const handleDocumentClick = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-ladder-cell], [data-cell-edit-window]')) {
              setSelectedRow(-1);
              setSelectedCol(-1);
              setSelectionEndRow(-1);
              setSelectionEndCol(-1);
          }
      };
      ladderDoc.addEventListener('click', handleDocumentClick);
      return () => ladderDoc.removeEventListener('click', handleDocumentClick);
    }, [ladderDoc]);

    useEffect(() => {
        if (selectedRow === -1 || selectedCol === -1) return;
        let cellEl;
        const openCellEditWindowWithKey = (key: string) => {
            if (isOpen) return;
            const cellEl = ladderDoc.querySelector(
                `[data-ladder-cell][data-row="${selectedRow}"][data-col="${selectedCol}"]`
            );
            if (cellEl) {
                const rect = cellEl.getBoundingClientRect();
                setCellX(rect.left);
                setCellY(rect.top);
                setInitialInput(key);
                setIsOpen(true);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Tab':
                    if(!isOpen) e.preventDefault();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if(!isOpen){
                      if(e.shiftKey){
                        //shift+↑で選択範囲を上に拡張する(アンカーは動かさない)
                        setSelectionEndRow((prev) => Math.max(0, (prev === -1 ? selectedRow : prev) - 1));
                        break;
                      }
                      //ctrl+↑で縦線を引く:selectedRowのhasLineの0番目(左上)とselectedRow-1のhasLineの1番目(左下)をbit反転する
                      if(e.ctrlKey && selectedRow != 0){
                        setLadderMap(prev => {
                          const next = prev.map(row => row.slice());
                          const currentCell = next[selectedRow][selectedCol];
                          const aboveCell = next[selectedRow - 1][selectedCol];
                          next[selectedRow][selectedCol] = {
                            ...currentCell,
                            hasLine: [!currentCell.hasLine[0], currentCell.hasLine[1]],
                          };
                          next[selectedRow - 1][selectedCol] = {
                            ...aboveCell,
                            hasLine: [aboveCell.hasLine[0], !aboveCell.hasLine[1]],
                          };
                          return next;
                        });
                      }
                      const newUpRow = Math.max(0, selectedRow - 1);
                      setSelectedRow(newUpRow);
                      setSelectionEndRow(newUpRow);
                      setSelectionEndCol(selectedCol);
                      cellEl = ladderDoc.querySelector(
                          `[data-ladder-cell][data-row="${newUpRow}"][data-col="${selectedCol}"]`
                      );
                      cellEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if(!isOpen){
                      if(e.shiftKey){
                        //shift+↓で選択範囲を下に拡張する(アンカーは動かさない)
                        setSelectionEndRow((prev) => Math.min(ROW_NUM - 1, (prev === -1 ? selectedRow : prev) + 1));
                        break;
                      }
                      //ctrl+↓で縦線を引く:selectedRowのhasLineの1番目(左下)とselectedRow+1のhasLineの0番目(左上)をbit反転する
                      if(e.ctrlKey && selectedRow != ROW_NUM - 1){
                        setLadderMap(prev => {
                          const next = prev.map(row => row.slice());
                          const currentCell = next[selectedRow][selectedCol];
                          const belowCell = next[selectedRow + 1][selectedCol];
                          next[selectedRow][selectedCol] = {
                            ...currentCell,
                            hasLine: [currentCell.hasLine[0], !currentCell.hasLine[1]],
                          };
                          next[selectedRow + 1][selectedCol] = {
                            ...belowCell,
                            hasLine: [!belowCell.hasLine[0], belowCell.hasLine[1]],
                          };
                          return next;
                        });
                      }
                      const newDownRow = Math.min(ROW_NUM - 1, selectedRow + 1);
                      cellEl = ladderDoc.querySelector(
                          `[data-ladder-cell][data-row="${newDownRow}"][data-col="${selectedCol}"]`
                      );
                      cellEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                      setSelectedRow(newDownRow);
                      setSelectionEndRow(newDownRow);
                      setSelectionEndCol(selectedCol);
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if(!isOpen){
                      if(e.shiftKey){
                        //shift+←で選択範囲を左に拡張する(アンカーは動かさない)
                        setSelectionEndCol((prev) => Math.max(0, (prev === -1 ? selectedCol : prev) - 1));
                        break;
                      }
                      if(e.ctrlKey && selectedCol != 0){
                        //ctrl+←で、選択中のセルではなく一つ左のセルに横線を引く
                        setLadderMap(prev => {
                          const next = prev.map(row => row.slice());
                          next[selectedRow][selectedCol - 1] = {
                            ...next[selectedRow][selectedCol - 1],
                            cell: "LINE",
                            device: null,
                            check: true,
                          };
                          return next;
                        });
                      }
                      const newLeftCol = Math.max(0, selectedCol - 1);
                      setSelectedCol(newLeftCol);
                      setSelectionEndRow(selectedRow);
                      setSelectionEndCol(newLeftCol);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if(!isOpen){
                      if(e.shiftKey){
                        //shift+→で選択範囲を右に拡張する(アンカーは動かさない)
                        setSelectionEndCol((prev) => Math.min(COLUMN_NUM - 1, (prev === -1 ? selectedCol : prev) + 1));
                        break;
                      }
                      if(e.ctrlKey && selectedCol != COLUMN_NUM - 1){
                        //ctrl+→で、選択中のセルではなく一つ右のセルに横線を引く
                        setLadderMap(prev => {
                          const next = prev.map(row => row.slice());
                          next[selectedRow][selectedCol + 1] = {
                            ...next[selectedRow][selectedCol + 1],
                            cell: "LINE",
                            device: null,
                            check: true,
                          };
                          return next;
                        });
                      }
                      const newRightCol = Math.min(COLUMN_NUM - 1, selectedCol + 1);
                      setSelectedCol(newRightCol);
                      setSelectionEndRow(selectedRow);
                      setSelectionEndCol(newRightCol);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    isOpen ? setIsOpen(false):null;
                    break;
                case 'Enter': { //cell設定windowを開く
                    if(!isOpen){
                      e.preventDefault();
                      //キーリピートや、閉じた直後の連続発火(チャタリング)によるEnterで誤って再度開くのを防ぐ
                      if(e.repeat) break;
                      if(Date.now() - lastCloseAtRef.current < 200) break;
                      openCellEditWindowWithKey('');
                    }
                    break;
                }
                case 'Delete':{ //選択範囲のcellをNoneにする
                  const rowStart = Math.min(selectedRow, selectionEndRow);
                  const rowEnd = Math.max(selectedRow, selectionEndRow);
                  const colStart = Math.min(selectedCol, selectionEndCol);
                  const colEnd = Math.max(selectedCol, selectionEndCol);
                  setLadderMap(prev => {
                    const next = prev.map(row => row.slice());
                    for(let r=rowStart;r<=rowEnd;r++){
                      for(let c=colStart;c<=colEnd;c++){
                        next[r][c] = {
                          ...next[r][c],
                          cell: "NONE",
                          device: null,
                          check: true,
                        };
                      }
                    }
                    return next;
                  });
                  break;
                }
                case 'c':
                case 'C':{ //選択範囲をコピー
                  if((e.ctrlKey || e.metaKey) && !isOpen){
                    e.preventDefault();
                    const rowStart = Math.min(selectedRow, selectionEndRow);
                    const rowEnd = Math.max(selectedRow, selectionEndRow);
                    const colStart = Math.min(selectedCol, selectionEndCol);
                    const colEnd = Math.max(selectedCol, selectionEndCol);
                    const copied: { cell:CellType, device:CellDevice }[][] = [];
                    for(let r=rowStart;r<=rowEnd;r++){
                      const rowCells: { cell:CellType, device:CellDevice }[] = [];
                      for(let c=colStart;c<=colEnd;c++){
                        rowCells.push({ cell: ladderMap[r][c].cell, device: ladderMap[r][c].device });
                      }
                      copied.push(rowCells);
                    }
                    copiedCellsRef.current = copied;
                    break;
                  }
                  openCellEditWindowWithKey(e.key);
                  break;
                }
                case 'x':
                case 'X':{ //選択範囲を切り取り
                  if((e.ctrlKey || e.metaKey) && !isOpen){
                    e.preventDefault();
                    const rowStart = Math.min(selectedRow, selectionEndRow);
                    const rowEnd = Math.max(selectedRow, selectionEndRow);
                    const colStart = Math.min(selectedCol, selectionEndCol);
                    const colEnd = Math.max(selectedCol, selectionEndCol);
                    const copied: { cell:CellType, device:CellDevice }[][] = [];
                    for(let r=rowStart;r<=rowEnd;r++){
                      const rowCells: { cell:CellType, device:CellDevice }[] = [];
                      for(let c=colStart;c<=colEnd;c++){
                        rowCells.push({ cell: ladderMap[r][c].cell, device: ladderMap[r][c].device });
                      }
                      copied.push(rowCells);
                    }
                    copiedCellsRef.current = copied;
                    setLadderMap(prev => {
                      const next = prev.map(row => row.slice());
                      for(let r=rowStart;r<=rowEnd;r++){
                        for(let c=colStart;c<=colEnd;c++){
                          next[r][c] = {
                            ...next[r][c],
                            cell: "NONE",
                            device: null,
                            check: true,
                          };
                        }
                      }
                      return next;
                    });
                    break;
                  }
                  openCellEditWindowWithKey(e.key);
                  break;
                }
                case 'v':
                case 'V':{ //アンカーセルを起点に貼り付け
                  if((e.ctrlKey || e.metaKey) && !isOpen && copiedCellsRef.current){
                    e.preventDefault();
                    const copied = copiedCellsRef.current;
                    setLadderMap(prev => {
                      const next = prev.map(row => row.slice());
                      for(let r=0;r<copied.length;r++){
                        const targetRow = selectedRow + r;
                        if(targetRow >= ROW_NUM) break;
                        for(let c=0;c<copied[r].length;c++){
                          const targetCol = selectedCol + c;
                          if(targetCol >= COLUMN_NUM) break;
                          next[targetRow][targetCol] = {
                            ...next[targetRow][targetCol],
                            cell: copied[r][c].cell,
                            device: copied[r][c].device,
                            check: true,
                          };
                        }
                      }
                      return next;
                    });
                    break;
                  }
                  openCellEditWindowWithKey(e.key);
                  break;
                }
                default:{ //a~z,A~Zが押されたらcell編集windowを開き、入力された文字をセットする
                  if(/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey){
                    openCellEditWindowWithKey(e.key);
                  }
                  break;
                }
            }
        };

        ladderDoc.addEventListener('keydown', handleKeyDown);
        return () => ladderDoc.removeEventListener('keydown', handleKeyDown);
    }, [selectedRow, selectedCol, selectionEndRow, selectionEndCol, isOpen, ladderMap, ladderDoc]);

  return (
    <EditCellStatusContext.Provider
        value={{
            isOpen,
            setIsOpen,
            cellX,
            setCellX,
            cellY,
            setCellY,
            selectedRow,
            setSelectedRow,
            selectedCol,
            setSelectedCol,
            selectionEndRow,
            setSelectionEndRow,
            selectionEndCol,
            setSelectionEndCol,
            ladderMap,
            setLadderMap,
            deviceComment,
            setDeviceComment,
            initialInput,
            setInitialInput,
            showTouchPanel,
            setShowTouchPanel,
            showLadder,
            setShowLadder,
            ladderDoc,
            setLadderDoc,
        }}
    >
      {children}
    </EditCellStatusContext.Provider>
  );
}