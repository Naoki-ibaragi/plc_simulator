import React from 'react'
import { type CellType,type CellDevice, type CellComment, COLUMN_NUM} from '../Variants'
import { useContext } from 'react'
import { LadderSelectionContext } from '../LadderContext'
import { RuntimeContext, DeviceValueContext, WordValueContext } from '../../Runtime/RuntimeContext'

//DMデバイスの現在値を表示する。値は毎スキャン更新されるため、購読するコンテキストをこの小コンポーネントに閉じ込め、
//DMを使うセルだけが再レンダーされるようにする
function WordValueText({ device }: { device: string }) {
    const wordValue = useContext(WordValueContext);
    return (
        <text x="40" y="58" textAnchor="middle" style={{ fontSize: '11px' }} fill="#2563eb">{wordValue[device] ?? 0}</text>
    )
}

function LadderImage({ cell, device, preset, axis, row, col, hasLine, comment }: { cell: CellType, device:CellDevice, preset?:number, axis?:number, row: number, col: number, hasLine: boolean[],comment:CellComment }) {
    let content: React.ReactNode
    const selection = useContext(LadderSelectionContext);
    const { mode } = useContext(RuntimeContext);
    const deviceValue = useContext(DeviceValueContext);
    const isAnchor = selection.selectedRow === row && selection.selectedCol === col;
    const rangeRowStart = Math.min(selection.selectedRow, selection.selectionEndRow);
    const rangeRowEnd = Math.max(selection.selectedRow, selection.selectionEndRow);
    const rangeColStart = Math.min(selection.selectedCol, selection.selectionEndCol);
    const rangeColEnd = Math.max(selection.selectedCol, selection.selectionEndCol);
    const isInRange = selection.selectedRow !== -1 && selection.selectedCol !== -1 &&
        row >= rangeRowStart && row <= rangeRowEnd && col >= rangeColStart && col <= rangeColEnd;

    //ランモード中、接点/コイルの現在のON/OFF状態を可視化する(LD/OUT:ONで通電表示、LDB:OFFで通電表示)
    const isEnergized = mode === 'RUN' && !!device && (
        ((cell === 'LD' || cell === 'OUT' || cell === 'TMR') && deviceValue[device]) ||
        (cell === 'LDB' && !deviceValue[device])
    );

    const selectCell=(e:React.MouseEvent<HTMLDivElement>)=>{
        if(e.shiftKey && selection.selectedRow !== -1 && selection.selectedCol !== -1){
            //shift+クリックでアンカーはそのままに選択範囲を拡張する
            selection.setSelectionEndRow(row);
            selection.setSelectionEndCol(col);
            return;
        }
        selection.setSelectedRow(row);
        selection.setSelectedCol(col);
        selection.setSelectionEndRow(row);
        selection.setSelectionEndCol(col);
    }

    const editCell=(e:React.MouseEvent<HTMLDivElement>)=>{
        if(mode === 'RUN') return; //ランモード中は編集ウィンドウを開かない
        selection.setCellX(e.clientX);
        selection.setCellY(e.clientY);
        selection.setSelectedRow(row);
        selection.setSelectedCol(col);
        selection.setSelectionEndRow(row);
        selection.setSelectionEndCol(col);
        selection.setIsOpen(true);
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
                <line x1="20" y1="50" x2="60" y2="30" stroke="black"/>
            </>
        )
        break
        case 'LDP':
        content = (
            <>
                <line x1="0" y1="40" x2="30" y2="40" stroke="black"/>
                <line x1="30" y1="30" x2="30" y2="50" stroke="black"/>
                <line x1="50" y1="30" x2="50" y2="50" stroke="black"/>
                <line x1="50" y1="40" x2="80" y2="40" stroke="black"/>
                <line x1="40" y1="30" x2="40" y2="50" stroke="black"/>
                <line x1="40" y1="30" x2="35" y2="40" stroke="black"/>
                <line x1="40" y1="30" x2="45" y2="40" stroke="black"/>
            </>
        )
        break
        case 'LDF':
        content = (
            <>
                <line x1="0" y1="40" x2="30" y2="40" stroke="black"/>
                <line x1="30" y1="30" x2="30" y2="50" stroke="black"/>
                <line x1="50" y1="30" x2="50" y2="50" stroke="black"/>
                <line x1="50" y1="40" x2="80" y2="40" stroke="black"/>
                <line x1="40" y1="30" x2="40" y2="50" stroke="black"/>
                <line x1="40" y1="50" x2="35" y2="40" stroke="black"/>
                <line x1="40" y1="50" x2="45" y2="40" stroke="black"/>
            </>
        )
        break
        case 'LDP':
        case 'LDF': {
            //接点の中に立ち上がり(↑)/立ち下がり(↓)の矢印を描く
            const up = cell === 'LDP'
            content = (
                <>
                    <line x1="0" y1="40" x2="30" y2="40" stroke="black"/>
                    <line x1="30" y1="30" x2="30" y2="50" stroke="black"/>
                    <line x1="50" y1="30" x2="50" y2="50" stroke="black"/>
                    <line x1="50" y1="40" x2="80" y2="40" stroke="black"/>
                    <line x1="40" y1="34" x2="40" y2="46" stroke="black"/>
                    <polyline points={up ? "37,38 40,34 43,38" : "37,42 40,46 43,42"} fill="none" stroke="black"/>
                </>
            )
            break
        }
        case 'OUT':
        content = (
            <>
                <line x1="0" y1="40" x2="30" y2="40" stroke="black"/>
                <circle cx="40" cy="40" r="10" fill="#FFFFFF" stroke="black" />
                <line x1="50" y1="40" x2="80" y2="40" stroke="black"/>
            </>
        )
        break
        case 'TMR':
        content = (
            <>
            <line x1="0" y1="40" x2="20" y2="40" stroke="black"/>
            <line x1="20" y1="30" x2="20" y2="50" stroke="black"/>
            <line x1="60" y1="30" x2="60" y2="50" stroke="black"/>
            <line x1="60" y1="40" x2="80" y2="40" stroke="black"/>
            <text x="40" y="44" textAnchor="middle" style={{ fontSize: '12px' }} fill="black">{device}</text>
            {preset !== undefined && (
                <text x="40" y="20" textAnchor="middle" style={{ fontSize: '12px' }} fill="black">{preset}</text>
            )}
            </>
        )
        break
        case 'INC':
        content = (
            <>
            <line x1="0" y1="40" x2="15" y2="40" stroke="black"/>
            <line x1="65" y1="40" x2="80" y2="40" stroke="black"/>
            <line x1="15" y1="40" x2="30" y2="50" stroke="black"/>
            <line x1="15" y1="40" x2="30" y2="30" stroke="black"/>
            <line x1="65" y1="40" x2="50" y2="50" stroke="black"/>
            <line x1="65" y1="40" x2="50" y2="30" stroke="black"/>
            <text x="40" y="45" textAnchor="middle" style={{ fontSize: '14px' }} fill="black">INC</text>
            </>
        )
        break
        case 'U_WRPPNT':
        case 'U_RDAERC':
        content = (
            <>
            <line x1="0" y1="40" x2="8" y2="40" stroke="black"/>
            <rect x="8" y="24" width="64" height="32" fill="#FFFFFF" stroke="black"/>
            <line x1="72" y1="40" x2="80" y2="40" stroke="black"/>
            <text x="40" y="37" textAnchor="middle" style={{ fontSize: '9px' }} fill="black">{cell}</text>
            <text x="40" y="49" textAnchor="middle" style={{ fontSize: '9px' }} fill="black">{`軸${axis} ${device}`}</text>
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
        <div data-ladder-cell data-row={row} data-col={col} className={`shrink-0 w-20 ${isInRange && !isAnchor ? 'bg-blue-100' : ''}`} onClick={selectCell} onDoubleClick={editCell}>
            <svg viewBox="0 0 80 80" className='w-full h-auto block'>
                <rect x="0.5" y="0.5" width="79" height="79" fill="none" stroke="#d1d5db" strokeDasharray="4 3"/>
                {isAnchor && (
                    <rect x="1" y="1" width="78" height="78" fill="none" stroke="#3b82f6" strokeWidth="2"/>
                )}
                {device && cell !== 'TMR' && cell !== 'U_WRPPNT' && cell !== 'U_RDAERC' && (
                    <text x="40" y="20" textAnchor="middle" style={{ fontSize: '14px' }} fill="black">{device}</text>
                )}
                {hasLine[0] && <line x1="1" y1="0" x2="1" y2="41" stroke="black" strokeWidth="1.6"/>}
                {hasLine[1] && <line x1="1" y1="39" x2="1" y2="80" stroke="black" strokeWidth="1.6"/>}
                {col === 0 && <line x1="1" y1="0" x2="1" y2="80" stroke="black" strokeWidth="2"/>}
                {col === COLUMN_NUM - 1 && <line x1="79" y1="0" x2="79" y2="80" stroke="black" strokeWidth="2"/>}
                {isEnergized && <rect x="10" y="25" width="60" height="30" fill="rgba(37, 99, 235, 0.35)"/>}
                {content}
                {mode === 'RUN' && device && /^DM[0-9]+$/.test(device) && cell !== 'U_WRPPNT' && cell !== 'U_RDAERC' && <WordValueText device={device}/>}
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

//ラダーは最大1000マス描画されるため、親(LadderDisplay)が再レンダーされても自分のpropsが変わっていなければ
//再レンダーをスキップできるようmemo化する(context経由の値はLadderSelectionContext/DeviceValueContext等で
//必要なコンポーネントだけが再レンダーされるよう別途分離済み)
export default React.memo(LadderImage)