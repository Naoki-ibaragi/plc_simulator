import React from 'react'
import { type CellType,type CellDevice, type CellComment} from '../Variants'
import { useContext } from 'react'
import { EditCellStatusContext } from '../LadderContext'
import { RuntimeContext } from '../../Runtime/RuntimeContext'

function LadderImage({ cell, device, row, col, hasLine, comment }: { cell: CellType, device:CellDevice, row: number, col: number, hasLine: boolean[],comment:CellComment }) {
    let content: React.ReactNode
    const cellEditStatus = useContext(EditCellStatusContext);
    const { mode, deviceValue } = useContext(RuntimeContext);
    const isAnchor = cellEditStatus.selectedRow === row && cellEditStatus.selectedCol === col;
    const rangeRowStart = Math.min(cellEditStatus.selectedRow, cellEditStatus.selectionEndRow);
    const rangeRowEnd = Math.max(cellEditStatus.selectedRow, cellEditStatus.selectionEndRow);
    const rangeColStart = Math.min(cellEditStatus.selectedCol, cellEditStatus.selectionEndCol);
    const rangeColEnd = Math.max(cellEditStatus.selectedCol, cellEditStatus.selectionEndCol);
    const isInRange = cellEditStatus.selectedRow !== -1 && cellEditStatus.selectedCol !== -1 &&
        row >= rangeRowStart && row <= rangeRowEnd && col >= rangeColStart && col <= rangeColEnd;
    const isSelected = isAnchor || isInRange;

    //ランモード中、接点/コイルの現在のON/OFF状態を可視化する(LD/OUT:ONで通電表示、LDB:OFFで通電表示)
    const isEnergized = mode === 'RUN' && !!device && (
        ((cell === 'LD' || cell === 'OUT') && deviceValue[device]) ||
        (cell === 'LDB' && !deviceValue[device])
    );

    const selectCell=(e:React.MouseEvent<HTMLDivElement>)=>{
        if(e.shiftKey && cellEditStatus.selectedRow !== -1 && cellEditStatus.selectedCol !== -1){
            //shift+クリックでアンカーはそのままに選択範囲を拡張する
            cellEditStatus.setSelectionEndRow(row);
            cellEditStatus.setSelectionEndCol(col);
            return;
        }
        cellEditStatus.setSelectedRow(row);
        cellEditStatus.setSelectedCol(col);
        cellEditStatus.setSelectionEndRow(row);
        cellEditStatus.setSelectionEndCol(col);
    }

    const editCell=(e:React.MouseEvent<HTMLDivElement>)=>{
        if(mode === 'RUN') return; //ランモード中は編集ウィンドウを開かない
        cellEditStatus.setCellX(e.clientX);
        cellEditStatus.setCellY(e.clientY);
        cellEditStatus.setSelectedRow(row);
        cellEditStatus.setSelectedCol(col);
        cellEditStatus.setSelectionEndRow(row);
        cellEditStatus.setSelectionEndCol(col);
        cellEditStatus.setIsOpen(true);
    }

    switch (cell) {
        case 'LD':
        content = (
            <>
                <line x1="0" y1="40" x2="30" y2="40" stroke="black"/>
                <line x1="30" y1="30" x2="30" y2="50" stroke="black"/>
                <line x1="50" y1="30" x2="50" y2="50" stroke="black"/>
                <line x1="50" y1="40" x2="80" y2="40" stroke="black"/>
            </>
        )
        break
        case 'LDB':
        content = (
            <>
                <line x1="0" y1="40" x2="30" y2="40" stroke="black"/>
                <line x1="30" y1="30" x2="30" y2="50" stroke="black"/>
                <line x1="50" y1="30" x2="50" y2="50" stroke="black"/>
                <line x1="50" y1="40" x2="80" y2="40" stroke="black"/>
                <line x1="35" y1="45" x2="45" y2="35" stroke="black"/>
            </>
        )
        break
        case 'OUT':
        content = (
            <>
            <line x1="0" y1="40" x2="30" y2="40" stroke="black"/>
            <circle cx="40" cy="40" r="10" stroke="black" fill="none"/>
            <line x1="50" y1="40" x2="80" y2="40" stroke="black"/>
            </>
        )
        break
        case 'LINE':
        content = <line x1="0" y1="40" x2="120" y2="40" stroke="black"/>
        break
        case 'NONE':
        content = null
        break
    }

    return (
        <div data-ladder-cell data-row={row} data-col={col} className={`w-20 ${isInRange && !isAnchor ? 'bg-blue-100' : ''}`} onClick={selectCell} onDoubleClick={editCell}>
            <svg viewBox="0 0 80 80" className='w-full h-auto block'>
                <rect x="0.5" y="0.5" width="79" height="79" fill="none" stroke="#d1d5db" strokeDasharray="4 3"/>
                {isSelected && (
                    <rect x="1" y="1" width="78" height="78" fill="none" stroke="#3b82f6" strokeWidth="2"/>
                )}
                {device && (
                    <text x="40" y="20" textAnchor="middle" style={{ fontSize: '14px' }} fill="black">{device}</text>
                )}
                {hasLine[0] && <line x1="0.5" y1="0" x2="0.5" y2="40" stroke="black"/>}
                {hasLine[1] && <line x1="0.5" y1="40" x2="0.5" y2="80" stroke="black"/>}
                {isEnergized && <rect x="10" y="25" width="60" height="30" fill="rgba(37, 99, 235, 0.35)"/>}
                {content}
                {comment && (
                    <>
                        <text x="40" y="65" textAnchor="middle" style={{ fontSize: '9px' }} fill="green">{comment.slice(0,8)}</text>
                        <text x="40" y="75" textAnchor="middle" style={{ fontSize: '9px' }} fill="green">{comment.slice(8,16)}</text>
                    </>
                )}
            </svg>
        </div>
    )
}

export default LadderImage