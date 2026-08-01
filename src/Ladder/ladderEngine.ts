import { type ladderCell, type CellType, type CellDevice, COLUMN_NUM, ROW_NUM } from './Variants'

type SweepContext = {
    row:number,
    col:number,
    cellType:CellType,
    device:CellDevice,
    input:boolean, //同じ列で縦線結線されている行同士をORした、このセルへの入力値
}

type SweepResult = {
    output:boolean, //次の列へ伝わる出力値
    coilValue?:boolean, //OUTセルの場合のみ、書き込むデバイス値
}

//ladderMapを列ごとに左から右へスイープする共通処理。
//同じ列で縦線(hasLine)結線されている行はUnion-Findでグループ化し、グループ内の値をORして入力とする。
//コンパイル検証(配線の到達可能性チェック)と毎スキャンのデバイス値計算の両方から利用する。
function sweepColumns(ladderMap:ladderCell[][], evalCell:(ctx:SweepContext) => SweepResult):Map<string,boolean>{
    const coilWrites = new Map<string,boolean>();
    let prevColOutput = new Array(ROW_NUM).fill(true); //左レール(常に通電)

    for(let c=0;c<COLUMN_NUM;c++){
        const parent = Array.from({length:ROW_NUM}, (_, i) => i);
        const find = (x:number):number => {
            while(parent[x] !== x){
                parent[x] = parent[parent[x]];
                x = parent[x];
            }
            return x;
        };
        const union = (a:number, b:number) => {
            const ra = find(a), rb = find(b);
            if(ra !== rb) parent[ra] = rb;
        };

        for(let r=0;r<ROW_NUM-1;r++){
            if(ladderMap[r][c].hasLine[1]) union(r, r+1);
        }

        const groupInput = new Map<number, boolean>();
        for(let r=0;r<ROW_NUM;r++){
            const root = find(r);
            groupInput.set(root, (groupInput.get(root) ?? false) || prevColOutput[r]);
        }

        const colOutput = new Array(ROW_NUM);
        for(let r=0;r<ROW_NUM;r++){
            const input = groupInput.get(find(r))!;
            const cell = ladderMap[r][c];
            const { output, coilValue } = evalCell({ row:r, col:c, cellType:cell.cell, device:cell.device, input });
            colOutput[r] = output;
            if(coilValue !== undefined && cell.device){
                coilWrites.set(cell.device, coilValue);
            }
        }
        prevColOutput = colOutput;
    }

    return coilWrites;
}

export type LadderCompileError = {
    row:number,
    col:number,
    cell:CellType,
    message:string,
}

export type CompileResult =
    | { ok:true }
    | { ok:false, errors:LadderCompileError[] }

//配線トポロジーのみを検証する（デバイス値は使わない）。
//NONEセルは未結線として扱われ、その先のLD/LDB/OUTが左レールから到達不可能な場合はエラーとする。
export function compileLadder(ladderMap:ladderCell[][]):CompileResult{
    const errors:LadderCompileError[] = [];

    sweepColumns(ladderMap, ({ row, col, cellType, input }) => {
        switch(cellType){
            case 'NONE':
                return { output:false };
            case 'LINE':
                return { output:input };
            case 'LD':
            case 'LDB':
                if(!input){
                    errors.push({ row, col, cell:cellType, message:'未結線です' });
                }
                return { output:input };
            case 'OUT':
                if(!input){
                    errors.push({ row, col, cell:cellType, message:'未結線です' });
                }
                return { output:input };
        }
    });

    return errors.length > 0 ? { ok:false, errors } : { ok:true };
}

//1スキャン分のデバイス値を計算する純粋関数。
//読み取りはスキャン開始時点のdeviceValueを参照し、同一スキャン内のコイル書き込みは他行の接点評価に影響しない。
export function evaluateScan(ladderMap:ladderCell[][], deviceValue:Record<string, boolean>):Record<string, boolean>{
    const coilWrites = sweepColumns(ladderMap, ({ cellType, device, input }) => {
        switch(cellType){
            case 'NONE':
                return { output:false };
            case 'LINE':
                return { output:input };
            case 'LD':
                return { output: input && !!(device && deviceValue[device]) };
            case 'LDB':
                return { output: input && !(device && deviceValue[device]) };
            case 'OUT':
                return { output:input, coilValue:input };
        }
    });

    const next = { ...deviceValue };
    for(const [device, value] of coilWrites){
        next[device] = value;
    }
    return next;
}
