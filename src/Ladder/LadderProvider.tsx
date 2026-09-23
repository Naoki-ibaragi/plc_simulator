import { useState, useEffect, useMemo, useRef } from "react";
import { type ReactNode } from "react";
import { EditCellStatusContext, LadderSelectionContext } from "./LadderContext";
import { COLUMN_NUM, createInitialLadderMap, createDeviceComment, createCommentRow, isCommentRow, type ladderCell, type CellType, type CellDevice} from "./Variants";
import { ladderStorageKey } from "../storageKeys";

interface Props {
  storageKey: string;
  defaultDeviceComment?: {[key:string]:string}; //設備固有のデバイス(位置決めユニットのR等)のコメント初期値
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

export function UserProvider({ storageKey, defaultDeviceComment, children }: Props) {
    const [isOpen,setIsOpen] = useState(false);
    const [cellX,setCellX] = useState(0);
    const [cellY,setCellY] = useState(0);
    const [selectedRow,setSelectedRow] = useState(-1);
    const [selectedCol,setSelectedCol] = useState(-1);
    const [selectionEndRow,setSelectionEndRow] = useState(-1);
    const [selectionEndCol,setSelectionEndCol] = useState(-1);
    const [ladderMap,setLadderMap] = useState<ladderCell[][]>(() => loadSavedLadder(storageKey)?.ladderMap ?? createInitialLadderMap());
    const [deviceComment,setDeviceComment] = useState(() => ({ ...createDeviceComment(), ...defaultDeviceComment, ...loadSavedLadder(storageKey)?.deviceComment }));
    const [initialInput,setInitialInput] = useState('');
    const [showTouchPanel,setShowTouchPanel] = useState(false);
    const [showLadder,setShowLadder] = useState(false);
    const [showDeviceList,setShowDeviceList] = useState(true);
    const [ladderDoc,setLadderDoc] = useState<Document>(document);
    const copiedCellsRef = useRef<{ cell:CellType, device:CellDevice, preset?:number, axis?:number }[][] | null>(null);
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
          if (!target.closest('[data-ladder-cell], [data-cell-edit-window], [data-keep-ladder-selection]')) {
              setSelectedRow(-1);
              setSelectedCol(-1);
              setSelectionEndRow(-1);
              setSelectionEndCol(-1);
          }
      };
      ladderDoc.addEventListener('click', handleDocumentClick);
      return () => ladderDoc.removeEventListener('click', handleDocumentClick);
    }, [ladderDoc]);

    //行コメント行を挿入した直後、その行が描画されてから位置を取得してコメント編集windowを開く
    const [pendingCommentRow,setPendingCommentRow] = useState(-1);
    useEffect(() => {
      if(pendingCommentRow === -1) return;
      const cellEl = ladderDoc.querySelector(`[data-ladder-cell][data-row="${pendingCommentRow}"][data-col="0"]`);
      if(!cellEl) return;
      const rect = cellEl.getBoundingClientRect();
      setCellX(rect.left);
      setCellY(rect.top);
      setInitialInput('');
      setIsOpen(true);
      setPendingCommentRow(-1);
    }, [pendingCommentRow, ladderMap, ladderDoc]);

    //選択行に行コメント行を挿入し、選択行以下を一つ下へずらす。挿入位置をまたぐ縦線は切り離す
    const insertCommentRow = () => {
      if(selectedRow < 0 || selectedRow >= ladderMap.length) return;
      const row = selectedRow;
      setLadderMap(prev => {
        const next = prev.map(r => r.slice());
        const cutLine = (r:number, idx:0|1) => {
          if(r < 0 || r >= next.length) return;
          next[r] = next[r].map(cell => ({ ...cell, hasLine: idx === 0 ? [false, cell.hasLine[1]] : [cell.hasLine[0], false] }));
        };
        cutLine(row - 1, 1);
        cutLine(row, 0);
        next.splice(row, 0, createCommentRow(''));
        return next;
      });
      setSelectedCol(0);
      setSelectionEndRow(row);
      setSelectionEndCol(0);
      setPendingCommentRow(row);
    };

    useEffect(() => {
        if (selectedRow === -1 || selectedCol === -1) return;
        let cellEl;
        //cellElを含むスクロール可能な祖先要素を探す(見出し行の分、scrollIntoViewだけでは
        //先頭行に到達してもscrollTopが0まで戻らず見出し行が隠れたままになるため使う)
        const findScrollParent = (el: Element | null): HTMLElement | null => {
            let node = el?.parentElement ?? null;
            while (node) {
                const style = ladderDoc.defaultView?.getComputedStyle(node);
                if (style && /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
                    return node;
                }
                node = node.parentElement;
            }
            return null;
        };
        const openCellEditWindowWithKey = (key: string, e?: KeyboardEvent) => {
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
                //開いた直後に入力欄へフォーカスが移るため、既定動作を止めないと押したキーが入力欄にもう一度入ってしまう
                e?.preventDefault();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Tab':
                    if(!isOpen) e.preventDefault();
                    break;
                case 'ArrowUp':
                    if(!isOpen) e.preventDefault();
                    if(!isOpen){
                      if(e.shiftKey){
                        //shift+↑で選択範囲を上に拡張する(アンカーは動かさない)
                        setSelectionEndRow((prev) => Math.max(0, (prev === -1 ? selectedRow : prev) - 1));
                        break;
                      }
                      //ctrl+↑で縦線を引く:selectedRowのhasLineの0番目(左上)とselectedRow-1のhasLineの1番目(左下)をbit反転する
                      if(e.ctrlKey && selectedRow != 0 && !isCommentRow(ladderMap[selectedRow]) && !isCommentRow(ladderMap[selectedRow - 1])){
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
                      if(newUpRow === 0){
                        //先頭行では見出し行も含めてウインドウ最上部まで戻す
                        findScrollParent(cellEl)?.scrollTo({ top: 0 });
                      } else {
                        cellEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                      }
                    }
                    break;
                case 'ArrowDown':
                    if(!isOpen) e.preventDefault();
                    if(!isOpen){
                      if(e.shiftKey){
                        //shift+↓で選択範囲を下に拡張する(アンカーは動かさない)
                        setSelectionEndRow((prev) => Math.min(ladderMap.length - 1, (prev === -1 ? selectedRow : prev) + 1));
                        break;
                      }
                      //ctrl+↓で縦線を引く:selectedRowのhasLineの1番目(左下)とselectedRow+1のhasLineの0番目(左上)をbit反転する
                      if(e.ctrlKey && selectedRow != ladderMap.length - 1 && !isCommentRow(ladderMap[selectedRow]) && !isCommentRow(ladderMap[selectedRow + 1])){
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
                      const newDownRow = Math.min(ladderMap.length - 1, selectedRow + 1);
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
                    if(!isOpen) e.preventDefault();
                    if(!isOpen){
                      if(e.shiftKey){
                        //shift+←で選択範囲を左に拡張する(アンカーは動かさない)
                        setSelectionEndCol((prev) => Math.max(0, (prev === -1 ? selectedCol : prev) - 1));
                        break;
                      }
                      if(e.ctrlKey && selectedCol != 0 && selectedCol != 1 && !isCommentRow(ladderMap[selectedRow])){
                        //ctrl+←で、選択中のセルではなく一つ左のセルに横線を引く
                        //(2列目では一番左の縦線(実線の外枠)に重なってしまうため線を引かない)
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
                    if(!isOpen) e.preventDefault();
                    if(!isOpen){
                      if(e.shiftKey){
                        //shift+→で選択範囲を右に拡張する(アンカーは動かさない)
                        setSelectionEndCol((prev) => Math.min(COLUMN_NUM - 1, (prev === -1 ? selectedCol : prev) + 1));
                        break;
                      }
                      if(e.ctrlKey && selectedCol != COLUMN_NUM - 1 && selectedCol != COLUMN_NUM - 2 && !isCommentRow(ladderMap[selectedRow])){
                        //ctrl+→で、選択中のセルではなく一つ右のセルに横線を引く
                        //(9列目では一番右の縦線(実線の外枠)に重なってしまうため線を引かない)
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
                      if(e.shiftKey){
                        //shift+enterで選択行の下に空行を挿入する。選択行と次の行が縦線で結ばれている列は、新しい行も縦線が貫通するようにする
                        if(e.repeat) break;
                        setLadderMap(prev => {
                          const newRow = prev[selectedRow].map(cell => ({
                            cell: "NONE" as CellType,
                            hasLine: [cell.hasLine[1], cell.hasLine[1]],
                            check: true,
                            device: null,
                          }));
                          return [...prev.slice(0, selectedRow + 1), newRow, ...prev.slice(selectedRow + 1)];
                        });
                        setSelectedRow(selectedRow + 1);
                        setSelectionEndRow(selectedRow + 1);
                        setSelectionEndCol(selectedCol);
                        break;
                      }
                      //キーリピートや、閉じた直後の連続発火(チャタリング)によるEnterで誤って再度開くのを防ぐ
                      if(e.repeat) break;
                      if(Date.now() - lastCloseAtRef.current < 200) break;
                      openCellEditWindowWithKey('');
                    }
                    break;
                }
                case 'Delete':{
                  if(isCommentRow(ladderMap[selectedRow])){
                    //行コメント行はdeleteで行ごと削除し、以下の行を上に詰める
                    if(isOpen) break;
                    e.preventDefault();
                    if(e.repeat) break;
                    setLadderMap(prev => prev.length <= 1 ? [createInitialLadderMap()[0]] : prev.filter((_, r) => r !== selectedRow));
                    const newRow = Math.max(0, Math.min(selectedRow, ladderMap.length - 2));
                    setSelectedRow(newRow);
                    setSelectionEndRow(newRow);
                    setSelectionEndCol(selectedCol);
                    break;
                  }
                  if(e.shiftKey){
                    //shift+deleteで選択行を削除する(最低1行は残す)。削除行を貫通していない縦線は取り除き、貫通している縦線は上下の行をつなぎ直す
                    if(isOpen || ladderMap.length <= 1) break;
                    e.preventDefault();
                    setLadderMap(prev => {
                      const next = prev.map(row => row.slice());
                      for(let c=0;c<COLUMN_NUM;c++){
                        const through = next[selectedRow][c].hasLine[0] && next[selectedRow][c].hasLine[1];
                        if(selectedRow > 0){
                          const above = next[selectedRow - 1][c];
                          next[selectedRow - 1][c] = { ...above, hasLine: [above.hasLine[0], through] };
                        }
                        if(selectedRow < next.length - 1){
                          const below = next[selectedRow + 1][c];
                          next[selectedRow + 1][c] = { ...below, hasLine: [through, below.hasLine[1]] };
                        }
                      }
                      next.splice(selectedRow, 1);
                      return next;
                    });
                    const newRow = Math.min(selectedRow, ladderMap.length - 2);
                    setSelectedRow(newRow);
                    setSelectionEndRow(newRow);
                    setSelectionEndCol(selectedCol);
                    break;
                  }
                  //選択範囲のcellをNoneにする
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
                    const copied: { cell:CellType, device:CellDevice, preset?:number, axis?:number }[][] = [];
                    for(let r=rowStart;r<=rowEnd;r++){
                      const rowCells: { cell:CellType, device:CellDevice, preset?:number, axis?:number }[] = [];
                      for(let c=colStart;c<=colEnd;c++){
                        rowCells.push({ cell: ladderMap[r][c].cell, device: ladderMap[r][c].device, preset: ladderMap[r][c].preset, axis: ladderMap[r][c].axis });
                      }
                      copied.push(rowCells);
                    }
                    copiedCellsRef.current = copied;
                    break;
                  }
                  if(!isCommentRow(ladderMap[selectedRow])) openCellEditWindowWithKey(e.key, e);
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
                    const copied: { cell:CellType, device:CellDevice, preset?:number, axis?:number }[][] = [];
                    for(let r=rowStart;r<=rowEnd;r++){
                      const rowCells: { cell:CellType, device:CellDevice, preset?:number, axis?:number }[] = [];
                      for(let c=colStart;c<=colEnd;c++){
                        rowCells.push({ cell: ladderMap[r][c].cell, device: ladderMap[r][c].device, preset: ladderMap[r][c].preset, axis: ladderMap[r][c].axis });
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
                  if(!isCommentRow(ladderMap[selectedRow])) openCellEditWindowWithKey(e.key, e);
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
                        if(targetRow >= ladderMap.length) break;
                        if(isCommentRow(next[targetRow])) continue; //行コメント行には貼り付けない
                        for(let c=0;c<copied[r].length;c++){
                          const targetCol = selectedCol + c;
                          if(targetCol >= COLUMN_NUM) break;
                          next[targetRow][targetCol] = {
                            ...next[targetRow][targetCol],
                            cell: copied[r][c].cell,
                            device: copied[r][c].device,
                            preset: copied[r][c].preset,
                            axis: copied[r][c].axis,
                            check: true,
                          };
                        }
                      }
                      return next;
                    });
                    break;
                  }
                  openCellEditWindowWithKey(e.key, e);
                  break;
                }
                default:{ //a~z,A~Zが押されたらcell編集windowを開き、入力された文字をセットする
                  if(/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !isCommentRow(ladderMap[selectedRow])){
                    openCellEditWindowWithKey(e.key, e);
                  }
                  break;
                }
            }
        };

        ladderDoc.addEventListener('keydown', handleKeyDown);
        return () => ladderDoc.removeEventListener('keydown', handleKeyDown);
    }, [selectedRow, selectedCol, selectionEndRow, selectionEndCol, isOpen, ladderMap, ladderDoc]);

  //selectedRow等はセル選択のたびに変わるが、ラダーは最大1000マス描画されるため、
  //isOpen/cellX/cellY/ladderDoc等ここでしか変わらない項目まで同じcontext値に含めると、
  //それらが変わるたびに全マスが再レンダーされてしまう。選択に直接必要な項目だけをmemo化して分離する
  const selectionValue = useMemo(() => ({
      selectedRow,
      setSelectedRow,
      selectedCol,
      setSelectedCol,
      selectionEndRow,
      setSelectionEndRow,
      selectionEndCol,
      setSelectionEndCol,
      setCellX,
      setCellY,
      setIsOpen,
  }), [selectedRow, selectedCol, selectionEndRow, selectionEndCol]);

  return (
    <LadderSelectionContext.Provider value={selectionValue}>
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
              showDeviceList,
              setShowDeviceList,
              ladderDoc,
              setLadderDoc,
              insertCommentRow,
          }}
      >
        {children}
      </EditCellStatusContext.Provider>
    </LadderSelectionContext.Provider>
  );
}