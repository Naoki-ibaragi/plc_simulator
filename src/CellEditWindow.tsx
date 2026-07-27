import { useContext, useEffect, useRef, useState } from 'react'
import { EditCellStatusContext } from './UserContext'
import { parseCommand,COLUMN_NUM } from './Variants'

function CellEditWindow() {
  const cellEditStatus = useContext(EditCellStatusContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cellEditStatus?.isOpen) {
      setError(null);
      if (inputRef.current) {
        inputRef.current.value = cellEditStatus.initialInput;
      }
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [cellEditStatus?.isOpen]);

  if(!cellEditStatus) return null;

  const handleOk = () => {
    const value = inputRef.current?.value ?? '';
    const parsed = parseCommand(value);
    if (!parsed) {
      setError('構文が不正です（例: LD X0 / OUT Y0 / LINE）');
      return;
    }

    //OUT命令より右に命令セルがすでに存在する場合は構文エラーを出す
    const { selectedRow, selectedCol } = cellEditStatus;
    if(parsed.cell==="OUT"){
      for(let col=selectedCol+1;col<COLUMN_NUM;col++){
        if(cellEditStatus.ladderMap[selectedRow][col].cell != "NONE"){
          setError('この位置にOUT命令を設置できません')
          return;
        }
      } 
      //OUT命令が出された場合、最最終に命令セルを移す.
      cellEditStatus.setLadderMap(prev => {
        const next = prev.map(row => row.slice());
        next[selectedRow][COLUMN_NUM-1] = {
          ...next[selectedRow][COLUMN_NUM-1],
          cell: parsed.cell,
          device: parsed.device,
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
          check: true,
        };
        return next;
      });
    }

    setError(null);
    cellEditStatus.setIsOpen(false);
  };

  return (
    cellEditStatus.isOpen ?
      <div
        data-cell-edit-window
        className='fixed z-100 w-72 rounded-xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden'
        style={{ left: cellEditStatus.cellX, top: cellEditStatus.cellY }}
      >
        <div className='flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200'>
          <span className='text-sm font-medium text-gray-700'>
            ({cellEditStatus.selectedCol+1},{cellEditStatus.selectedRow+1})を編集
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
            placeholder="命令を入力してください"
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
