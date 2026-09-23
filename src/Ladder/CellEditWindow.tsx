import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditCellStatusContext } from './LadderContext'
import { parseCommand,COLUMN_NUM,RIGHT_END_CELLS,isCommentRow } from './Variants'

function CellEditWindow() {
  const cellEditStatus = useContext(EditCellStatusContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  //選択中の行が行コメント行の場合は、命令ではなくコメント文を編集する
  const isCommentEdit = isCommentRow(cellEditStatus.ladderMap[cellEditStatus.selectedRow]);
  const [position, setPosition] = useState<{ left: number, top: number } | null>(null);

  //表示位置がブラウザウインドウ(ラダーをポップアップ表示中はそのウインドウ)を超える場合は、
  //右/下方向ではなく左/上方向に表示を切り替える
  useLayoutEffect(() => {
    const el = windowRef.current;
    if (!cellEditStatus?.isOpen || !el) {
      setPosition(null);
      return;
    }
    const view = cellEditStatus.ladderDoc.defaultView ?? window;
    const { offsetWidth: w, offsetHeight: h } = el;
    let left = cellEditStatus.cellX;
    let top = cellEditStatus.cellY;
    if (left + w > view.innerWidth) left -= w;
    if (top + h > view.innerHeight) top -= h;
    setPosition({
      left: Math.max(0, Math.min(left, view.innerWidth - w)),
      top: Math.max(0, Math.min(top, view.innerHeight - h)),
    });
  }, [cellEditStatus?.isOpen, cellEditStatus?.cellX, cellEditStatus?.cellY, cellEditStatus?.ladderDoc, error]);

  useEffect(() => {
    if (cellEditStatus?.isOpen) {
      setError(null);
      const input = inputRef.current;
      if (!input) return;
      //キー入力で開いた場合はその文字を、それ以外は既に書き込まれているセルの内容を初期値にする
      const { initialInput, ladderMap, selectedRow, selectedCol } = cellEditStatus;
      const current = ladderMap[selectedRow]?.[selectedCol];
      const existing = isCommentRow(ladderMap[selectedRow])
        ? ladderMap[selectedRow][0].rowComment ?? ''
        : current && current.cell !== 'NONE'
        ? [current.cell, current.axis, current.device, current.preset].filter(v => v !== null && v !== undefined).join(' ')
        : '';
      input.value = initialInput || existing;
      input.focus({ preventScroll: true });
      if (initialInput) {
        input.setSelectionRange(input.value.length, input.value.length);
      } else {
        input.select();
      }
    }
  }, [cellEditStatus?.isOpen]);

  if(!cellEditStatus) return null;

  const handleOk = () => {
    const value = inputRef.current?.value ?? '';
    if (isCommentEdit) {
      const { selectedRow } = cellEditStatus;
      cellEditStatus.setLadderMap(prev => {
        const next = prev.map(row => row.slice());
        next[selectedRow][0] = { ...next[selectedRow][0], rowComment: value };
        return next;
      });
      setError(null);
      cellEditStatus.setIsOpen(false);
      return;
    }
    const parsed = parseCommand(value);
    if (!parsed) {
      setError('構文が不正です（例: LD X0 / OUT Y0 / TMR T0 100(ms) / INC DM0 / U_WRPPNT 1 5）');
      return;
    }

    const { selectedRow, selectedCol } = cellEditStatus;
    if(RIGHT_END_CELLS.includes(parsed.cell)){
      //OUT/INC命令が出された場合、最終列に命令セルを移し、そこまでの間は既存セルを上書きして横線でつなぐ.
      cellEditStatus.setLadderMap(prev => {
        const next = prev.map(row => row.slice());
        for(let col=selectedCol;col<COLUMN_NUM-1;col++){
          next[selectedRow][col] = {
            ...next[selectedRow][col],
            cell: "LINE",
            device: null,
            preset: undefined,
            check: true,
          };
        }
        next[selectedRow][COLUMN_NUM-1] = {
          ...next[selectedRow][COLUMN_NUM-1],
          cell: parsed.cell,
          device: parsed.device,
          preset: undefined,
          axis: parsed.axis,
          check: true,
        };
        return next;
      });
      cellEditStatus.setSelectedCol(COLUMN_NUM-1);

    }else{
      cellEditStatus.setLadderMap(prev => {
        const next = prev.map(row => row.slice());
        next[selectedRow][selectedCol] = {
          ...next[selectedRow][selectedCol],
          cell: parsed.cell,
          device: parsed.device,
          preset: parsed.preset,
          axis: parsed.axis,
          check: true,
        };
        return next;
      });
      //右端でなければ一つ右のセルに選択を移す
      if (selectedCol < COLUMN_NUM-1) {
        cellEditStatus.setSelectedCol(selectedCol+1);
      }
    }

    setError(null);
    cellEditStatus.setIsOpen(false);
  };

  return (
    cellEditStatus.isOpen ?
      <div
        ref={windowRef}
        data-cell-edit-window
        className='fixed z-100 w-72 rounded-xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden'
        style={{ left: position?.left ?? cellEditStatus.cellX, top: position?.top ?? cellEditStatus.cellY, opacity: position ? 1 : 0 }}
      >
        <div className='flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200'>
          <span className='text-sm font-medium text-gray-700'>
            {isCommentEdit
              ? `行${cellEditStatus.selectedRow+1}のコメントを編集`
              : `(${cellEditStatus.selectedCol+1},${cellEditStatus.selectedRow+1})を編集`}
          </span>
          <button
            type='button'
            aria-label='close'
            className='flex h-5 w-5 items-center justify-center rounded-full text-gray-400 leading-none hover:bg-gray-200 hover:text-gray-600 transition'
            onClick={() => cellEditStatus.setIsOpen(false)}
          >
            ×
          </button>
        </div>
        <div className='flex flex-col gap-3 p-4'>
          <input
            ref={inputRef}
            type="text"
            placeholder={isCommentEdit ? 'コメントを入力してください' : '命令を入力してください'}
            onChange={() => error && setError(null)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleOk(); }}
            className={`
              w-full
              rounded-lg
              border
              bg-white
              px-3 py-2
              text-sm
              text-gray-900
              placeholder:text-gray-400
              shadow-sm
              transition
              focus:outline-none
              focus:ring-2
              ${error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'}
            `}
          />
          {error && (
            <p className='text-xs text-red-500'>{error}</p>
          )}
          <button
            type='button'
            onClick={handleOk}
            className='
              self-end
              rounded-lg
              bg-blue-600
              px-4 py-1.5
              text-sm
              font-medium
              text-white
              shadow-sm
              transition
              hover:bg-blue-700
              focus:outline-none
              focus:ring-2
              focus:ring-blue-500/40
            '
          >
            OK
          </button>
        </div>
      </div>
    :null
  )
}

export default CellEditWindow
