import { useState, useEffect, useRef } from "react";
import { type ReactNode } from "react";
import { EditCellStatusContext } from "./LadderContext";
import { ROW_NUM, COLUMN_NUM, createInitialLadderMap, createDeviceComment, type ladderCell, type CellType, type CellDevice} from "./Variants";

interface Props {
  children: ReactNode;
}

export function UserProvider({ children }: Props) {
    const [isOpen,setIsOpen] = useState(false);
    const [cellX,setCellX] = useState(0);
    const [cellY,setCellY] = useState(0);
    const [selectedRow,setSelectedRow] = useState(-1);
    const [selectedCol,setSelectedCol] = useState(-1);
    const [ladderMap,setLadderMap] = useState<ladderCell[][]>(createInitialLadderMap());
    const [deviceComment,setDeviceComment] = useState(createDeviceComment());
    const [initialInput,setInitialInput] = useState('');
    const [showDeviceList,setShowDeviceList] = useState(true);
    const [showLadder,setShowLadder] = useState(true);
    const [showTouchPanel,setShowTouchPanel] = useState(false);
    const [showEquipment,setShowEquipment] = useState(false);
    const copiedCellRef = useRef<{ cell:CellType, device:CellDevice } | null>(null);

    //ラダー以外でクリックをしたらセルの選択を外す
    useEffect(() => {
      const handleDocumentClick = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-ladder-cell], [data-cell-edit-window]')) {
              setSelectedRow(-1);
              setSelectedCol(-1);
          }
      };
      document.addEventListener('click', handleDocumentClick);
      return () => document.removeEventListener('click', handleDocumentClick);
    }, []);

    useEffect(() => {
        if (selectedRow === -1 || selectedCol === -1) return;
        let cellEl;
        const openCellEditWindowWithKey = (key: string) => {
            if (isOpen) return;
            const cellEl = document.querySelector(
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
                      setSelectedRow((prev) => Math.max(0, prev - 1));
                      cellEl = document.querySelector(
                          `[data-ladder-cell][data-row="${selectedRow-1}"][data-col="${selectedCol}"]`
                      );
                      cellEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if(!isOpen){
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
                      cellEl = document.querySelector(
                          `[data-ladder-cell][data-row="${selectedRow+1}"][data-col="${selectedCol}"]`
                      );
                      cellEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                      setSelectedRow((prev) => Math.min(ROW_NUM - 1, prev + 1));
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if(!isOpen){
                      if(e.ctrlKey){
                        setLadderMap(prev => {
                          const next = prev.map(row => row.slice());
                          next[selectedRow][selectedCol] = {
                            ...next[selectedRow][selectedCol],
                            cell: "LINE",
                            device: null,
                            check: true,
                          };
                          return next;
                        });
                      }
                      setSelectedCol((prev) => Math.max(0, prev - 1));
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if(!isOpen){
                      if(e.ctrlKey){
                        setLadderMap(prev => {
                          const next = prev.map(row => row.slice());
                          next[selectedRow][selectedCol] = {
                            ...next[selectedRow][selectedCol],
                            cell: "LINE",
                            device: null,
                            check: true,
                          };
                          return next;
                        });
                      }
                      setSelectedCol((prev) => Math.min(COLUMN_NUM - 1, prev + 1));
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    isOpen ? setIsOpen(false):null;
                    break;
                case 'Enter': { //cell設定windowを開く
                    if(!isOpen){
                      e.preventDefault();
                      openCellEditWindowWithKey('');
                    }
                    break;
                }
                case 'Delete':{ //cellをNoneにする
                  setLadderMap(prev => {
                    const next = prev.map(row => row.slice());
                    next[selectedRow][selectedCol] = {
                      ...next[selectedRow][selectedCol],
                      cell: "NONE",
                      device: null,
                      check: true,
                    };
                    return next;
                  });
                  break;
                }
                case 'c':
                case 'C':{ //セルをコピー
                  if((e.ctrlKey || e.metaKey) && !isOpen){
                    e.preventDefault();
                    const current = ladderMap[selectedRow][selectedCol];
                    copiedCellRef.current = {
                      cell: current.cell,
                      device: current.device,
                    };
                    break;
                  }
                  openCellEditWindowWithKey(e.key);
                  break;
                }
                case 'v':
                case 'V':{ //セルに貼り付け
                  if((e.ctrlKey || e.metaKey) && !isOpen && copiedCellRef.current){
                    e.preventDefault();
                    const copied = copiedCellRef.current;
                    setLadderMap(prev => {
                      const next = prev.map(row => row.slice());
                      next[selectedRow][selectedCol] = {
                        ...next[selectedRow][selectedCol],
                        cell: copied.cell,
                        device: copied.device,
                        check: true,
                      };
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

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedRow, selectedCol, isOpen, ladderMap]);

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
            ladderMap,
            setLadderMap,
            deviceComment,
            setDeviceComment,
            initialInput,
            setInitialInput,
            showDeviceList,
            setShowDeviceList,
            showLadder,
            setShowLadder,
            showTouchPanel,
            setShowTouchPanel,
            showEquipment,
            setShowEquipment,
        }}
    >
      {children}
    </EditCellStatusContext.Provider>
  );
}