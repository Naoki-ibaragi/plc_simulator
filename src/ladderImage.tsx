import React from 'react'
import { type CellType,type CellDevice, type CellComment} from './Variants'
import { useContext } from 'react'
import { EditCellStatusContext } from './UserContext'

function LadderImage({ cell, device, row, col, hasLine, comment }: { cell: CellType, device:CellDevice, row: number, col: number, hasLine: boolean[],comment:CellComment }) {
    let content: React.ReactNode
    const cellEditStatus = useContext(EditCellStatusContext);
    const isSelected = cellEditStatus.selectedRow === row && cellEditStatus.selectedCol === col;

    const selectCell=()=>{
        cellEditStatus.setSelectedRow(row);
        cellEditStatus.setSelectedCol(col);
    }

    const editCell=(e:React.MouseEvent<HTMLDivElement>)=>{
        cellEditStatus.setCellX(e.clientX);
        cellEditStatus.setCellY(e.clientY);
        cellEditStatus.setSelectedRow(row);
        cellEditStatus.setSelectedCol(col);
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
        <div data-ladder-cell data-row={row} data-col={col} className={`w-20 border border-dotted ${isSelected ? 'border-blue-500' : 'border-gray-300'}`} onClick={selectCell} onDoubleClick={editCell}>
            <svg viewBox="0 0 80 80" className='w-full h-auto block'>
                {device && (
                    <text x="40" y="20" textAnchor="middle" style={{ fontSize: '14px' }} fill="black">{device}</text>
                )}
                {hasLine[0] && <line x1="0" y1="0" x2="0" y2="40" stroke="black"/>}
                {hasLine[1] && <line x1="0" y1="40" x2="0" y2="80" stroke="black"/>}
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