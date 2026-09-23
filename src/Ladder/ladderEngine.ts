import { type ladderCell, type CellType, type CellDevice, type WordValue, COLUMN_NUM, WORD_MAX, ALWAYS_ON_DEVICE, ALWAYS_OFF_DEVICE } from './Variants'

type SweepContext = {
    row:number,
    col:number,
    cellType:CellType,
    device:CellDevice,
    preset?:number, //TMRの設定時間(ms)
    axis?:number, //ユニット専用命令の軸番号
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
    const rowCount = ladderMap.length;
    const coilWrites = new Map<string,boolean>();
    let prevColOutput = new Array(rowCount).fill(true); //左レール(常に通電)

    for(let c=0;c<COLUMN_NUM;c++){
        const parent = Array.from({length:rowCount}, (_, i) => i);
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

        for(let r=0;r<rowCount-1;r++){
            if(ladderMap[r][c].hasLine[1]) union(r, r+1);
        }

        const groupInput = new Map<number, boolean>();
        for(let r=0;r<rowCount;r++){
            const root = find(r);
            groupInput.set(root, (groupInput.get(root) ?? false) || prevColOutput[r]);
        }

        const colOutput = new Array(rowCount);
        for(let r=0;r<rowCount;r++){
            const input = groupInput.get(find(r))!;
            const cell = ladderMap[r][c];
            const { output, coilValue } = evalCell({ row:r, col:c, cellType:cell.cell, device:cell.device, preset:cell.preset, axis:cell.axis, input });
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
            case 'LDP':
            case 'LDF':
                if(!input){
                    errors.push({ row, col, cell:cellType, message:'未結線です' });
                }
                return { output:input };
            case 'OUT':
            case 'INC':
            case 'TMR':
            case 'U_WRPPNT':
            case 'U_RDAERC':
                if(!input){
                    errors.push({ row, col, cell:cellType, message:'未結線です' });
                }
                return { output:input };
            default:
                return { output:false };
        }
    });

    return errors.length > 0 ? { ok:false, errors } : { ok:true };
}

//1スキャン分のデバイス値を計算する純粋関数。
//読み取りはスキャン開始時点のdeviceValueを参照し、同一スキャン内のコイル書き込みは他行の接点評価に影響しない。
//TMRセルの経過時間(ms)は"行,列"をキーにtimersで持ち回る。入力がOFFのTMRはエントリを持たない(=リセット)。
export type TimerState = Record<string, number>;

//位置決めユニットへの専用命令の実行要求。ラダー評価後にRuntimeProviderが軸ユニットへ反映する
export type UnitCommand =
    | { kind:'WRPPNT', axis:number, operand:string } //開始ポイント番号の書き込み(operandは数値 or DM)
    | { kind:'RDAERC', axis:number, operand:string } //軸エラーコードの読み出し先(DM)

export function evaluateScan(
    ladderMap:ladderCell[][],
    deviceValue:Record<string, boolean>,
    timers:TimerState,
    elapsedMs:number, //前回スキャンからの経過時間
    prevDeviceValue:Record<string, boolean>, //前回スキャン開始時点のデバイス値(LDP/LDFの立ち上がり/立ち下がり検出用)
    wordValue:WordValue, //ワードデバイス(DM)の値
):{ deviceValue:Record<string, boolean>, timers:TimerState, wordValue:WordValue, unitCommands:UnitCommand[] }{
    const unitCommands:UnitCommand[] = [];
    const nextTimers:TimerState = {};
    const nextWordValue:WordValue = { ...wordValue };
    const coilWrites = sweepColumns(ladderMap, ({ row, col, cellType, device, preset, axis, input }) => {
        switch(cellType){
            case 'TMR': {
                //入力ONの間だけカウントし、設定時間に達したらデバイスをONする
                if(!input) return { output:false, coilValue:false };
                const key = `${row},${col}`;
                const elapsed = (timers[key] ?? 0) + elapsedMs;
                nextTimers[key] = elapsed;
                return { output:input, coilValue: elapsed >= (preset ?? 0) };
            }
            case 'NONE':
                return { output:false };
            case 'LINE':
                return { output:input };
            case 'LD':
                return { output: input && !!(device && deviceValue[device]) };
            case 'LDB':
                return { output: input && !(device && deviceValue[device]) };
            case 'LDP':
                return { output: input && !!device && deviceValue[device] && !prevDeviceValue[device] };
            case 'LDF':
                return { output: input && !!device && !deviceValue[device] && prevDeviceValue[device] };
            case 'OUT':
                return { output:input, coilValue:input };
            case 'INC':
                //入力ONの間、毎スキャンDMの値を+1する(16bitでラップ)
                if(input && device){
                    nextWordValue[device] = ((nextWordValue[device] ?? 0) + 1) & WORD_MAX;
                }
                return { output:input };
            case 'U_WRPPNT':
            case 'U_RDAERC':
                //入力ONの間、毎スキャン実行する(実機のユニット専用命令と同様、エッジ検出はラダー側の接点で行う)
                if(input && device && axis){
                    unitCommands.push({ kind: cellType === 'U_WRPPNT' ? 'WRPPNT' : 'RDAERC', axis, operand:device });
                }
                return { output:input };
            default:
                return { output:false };
        }
    });

    const next = { ...deviceValue };
    for(const [device, value] of coilWrites){
        next[device] = value;
    }
    next[ALWAYS_ON_DEVICE] = true;
    next[ALWAYS_OFF_DEVICE] = false;
    return { deviceValue:next, timers:nextTimers, wordValue:nextWordValue, unitCommands };
}
