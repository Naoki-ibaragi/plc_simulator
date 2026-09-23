import React, { useContext } from 'react'
import { COLUMN_NUM } from '../Variants'
import { LadderSelectionContext } from '../LadderContext'
import { RuntimeContext } from '../../Runtime/RuntimeContext'

//行コメント行。回路は持たず、行全体にコメント文を表示する。
//キー操作(enter/delete)やセル位置の取得は他の行と同様にセル単位のdata属性で行うため、列数分の枠を並べる
function CommentRow({ row, comment }: { row: number, comment: string }) {
    const selection = useContext(LadderSelectionContext);
    const { mode } = useContext(RuntimeContext);
    const rangeRowStart = Math.min(selection.selectedRow, selection.selectionEndRow);
    const rangeRowEnd = Math.max(selection.selectedRow, selection.selectionEndRow);
    const isInRange = selection.selectedRow !== -1 && row >= rangeRowStart && row <= rangeRowEnd;

    const selectCell = (e: React.MouseEvent, col: number) => {
        if(e.shiftKey && selection.selectedRow !== -1 && selection.selectedCol !== -1){
            selection.setSelectionEndRow(row);
            selection.setSelectionEndCol(col);
            return;
        }
        selection.setSelectedRow(row);
        selection.setSelectedCol(col);
        selection.setSelectionEndRow(row);
        selection.setSelectionEndCol(col);
    }

    const editComment = (e: React.MouseEvent, col: number) => {
        if(mode === 'RUN') return;
        selection.setCellX(e.clientX);
        selection.setCellY(e.clientY);
        selection.setSelectedRow(row);
        selection.setSelectedCol(col);
        selection.setSelectionEndRow(row);
        selection.setSelectionEndCol(col);
        selection.setIsOpen(true);
    }

    return (
        <div className='flex'>
            <span className='shrink-0 w-12 bg-cyan-100 flex items-center justify-center'>{String(row+1).padStart(3, '0')}</span>
            <div className={`relative flex h-8 ${isInRange ? 'bg-blue-100' : 'bg-green-50'}`}>
                {Array.from({ length: COLUMN_NUM }, (_, col) => (
                    <div
                        key={col}
                        data-ladder-cell data-row={row} data-col={col}
                        className={`shrink-0 w-20 h-8 ${selection.selectedRow === row && selection.selectedCol === col ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                        onClick={(e) => selectCell(e, col)}
                        onDoubleClick={(e) => editComment(e, col)}
                    />
                ))}
                <span className='pointer-events-none absolute inset-y-0 left-2 flex items-center whitespace-nowrap text-sm text-green-700'>
                    {comment === '' ? '' : `; ${comment}`}
                </span>
            </div>
        </div>
    )
}

export default React.memo(CommentRow)
