//NONE:空,LD:A接点,LDB:B接点,OUT:コイル,LINE:横線
//U_WRPPNT:位置決めユニットへ開始ポイント番号を書き込む,U_RDAERC:軸エラーコードをDMへ読み出す
export type CellType = "NONE" | "LD" | "LDB" | "LDP" | "LDF" | "TMR" | "OUT" | "LINE" | "INC" | "MOV" | "U_WRPPNT" | "U_RDAERC";
export type CellDevice = string | null;
export type CellComment = string | null;

//Ladderの行・列数
export const COLUMN_NUM=10
export const INITIAL_ROW_NUM=10 //初期行数(行はshift+enter/shift+deleteで増減する)

//セル状態オブジェクト
export type ladderCell = {
    cell:CellType,
    hasLine:boolean[], //縦線があるか 0:左上、1:左下
    check:boolean, //セルの内容がPLCのルールに反していないか
    device:CellDevice, //デバイス番号(ユニット専用命令の場合はオペランド:ポイント番号の数値 or DM)
    preset?:number, //TMRの設定時間(ms)
    axis?:number, //ユニット専用命令の軸番号(1~)
    rowComment?:string, //行コメント行の場合のみ、行の先頭列(0列目)のセルに持つコメント文。定義されている行は回路を持たない
}

//行コメント行かどうか(先頭列のセルがrowCommentを持つ行)
export function isCommentRow(row:ladderCell[] | undefined):boolean {
    return row?.[0]?.rowComment !== undefined;
}

//コメント文を持つ行コメント行を作る(回路は空で縦線も持たない)
export function createCommentRow(comment:string):ladderCell[] {
    return Array.from({length:COLUMN_NUM}, (_, x) => ({
        cell:"NONE" as CellType,
        hasLine:[false,false],
        check:true,
        device:null,
        ...(x === 0 ? { rowComment:comment } : {}),
    }));
}

//行x10列の配列でラダーを表現する初期状態を作る
export function createInitialLadderMap():ladderCell[][] {
    const map:ladderCell[][] = [];
    for(let y=0;y<INITIAL_ROW_NUM;y++){
        map[y] = [];
        for(let x=0;x<COLUMN_NUM;x++){
            map[y][x] = {
                cell:"NONE",
                hasLine:[false,false],
                check:true,
                device:null,
            };
        }
    }
    return map;
}

//特殊デバイス(CR)。ラダーからは接点としてのみ使え、コイルには書き込めない
export const ALWAYS_ON_DEVICE = 'CR0'; //常時ON
export const ALWAYS_OFF_DEVICE = 'CR1'; //常時OFF
const SPECIAL_COMMENT:{[key:string]:string} = {
    [ALWAYS_ON_DEVICE]: '常時ON',
    [ALWAYS_OFF_DEVICE]: '常時OFF',
};

//デバイスキー一覧を列挙する（X0~X31,Y0~Y31,D0~D99,M0~M99,T0~T99,CR0~CR1）
function listDeviceKeys():string[]{
    const keys:string[] = [];
    for(let i=0;i<100;i++){
        if(i<32){
            keys.push('X'+i);
            keys.push('Y'+i);
        }
        keys.push('D'+i);
        keys.push('M'+i);
        keys.push('T'+i);
    }
    keys.push(ALWAYS_ON_DEVICE, ALWAYS_OFF_DEVICE);
    return keys;
}

//コメントの初期化
export function createDeviceComment(){
    const commentObj:{[key:string]:string}={};
    for(const key of listDeviceKeys()){
        commentObj[key] = SPECIAL_COMMENT[key] ?? "";
    }
    return commentObj;
}

//デバイス値(ON/OFF)の初期化
export function createDeviceValue():{[key:string]:boolean}{
    const valueObj:{[key:string]:boolean}={};
    for(const key of listDeviceKeys()){
        valueObj[key] = key === ALWAYS_ON_DEVICE;
    }
    return valueObj;
}

//ワードデバイス(DM0~)の値。未設定のデバイスは0として扱う
export type WordValue = Record<string, number>;
export const WORD_MAX = 0xFFFF; //符号なし16bit

//右端にしか置けない命令(出力系)
export const RIGHT_END_CELLS:CellType[] = ["OUT","INC","U_WRPPNT","U_RDAERC"];

//位置決めユニットの専用命令(「U_XXX 軸番号 オペランド」形式)
export const UNIT_CELLS:CellType[] = ["U_WRPPNT","U_RDAERC"];

const CELL_TYPES:CellType[] = ["LD","LDB","OUT","TMR","LDP","LDF","INC","MOV","U_WRPPNT","U_RDAERC"];
const DEVICE_REGEX = /^[A-Z]+[0-9]+$/;

export type ParsedCommand = {
    cell:CellType,
    device:CellDevice,
    preset?:number, //TMRの設定時間(ms)
    axis?:number, //ユニット専用命令の軸番号
}

//「TYPE DEVICE」形式の命令をパースする（例: "LD X0", "OUT Y0", "TMR T0 100"(時間はms)）
//構文に問題があればnullを返す
export function parseCommand(input:string):ParsedCommand | null {
    const trimmed = input.trim();
    if(trimmed === "") return null;

    const parts = trimmed.split(/\s+/);
    const type = parts[0].toUpperCase();
    if(!CELL_TYPES.includes(type as CellType)) return null;

    if(type === "LINE"){
        if(parts.length !== 1) return null;
        return { cell:"LINE", device:null };
    }

    if(type === "TMR"){
        //TMR デバイス(Tのみ) 時間(ms)
        if(parts.length !== 3) return null;
        const timerDevice = parts[1].toUpperCase();
        if(!/^T[0-9]+$/.test(timerDevice)) return null;
        if(!/^[0-9]+$/.test(parts[2])) return null;
        return { cell:"TMR", device:timerDevice, preset:Number(parts[2]) };
    }

    if(UNIT_CELLS.includes(type as CellType)){
        //U_WRPPNT 軸番号 ポイント番号(数値 or DM) / U_RDAERC 軸番号 DM
        if(parts.length !== 3) return null;
        if(!/^[0-9]+$/.test(parts[1]) || Number(parts[1]) < 1) return null;
        const operand = parts[2].toUpperCase();
        const isWord = /^DM[0-9]+$/.test(operand);
        if(type === "U_WRPPNT" && !isWord && !/^[0-9]+$/.test(operand)) return null;
        if(type === "U_RDAERC" && !isWord) return null;
        return { cell:type as CellType, device:operand, axis:Number(parts[1]) };
    }

    if(parts.length !== 2) return null;
    const device = parts[1].toUpperCase();
    if(!DEVICE_REGEX.test(device)) return null;
    //CRは常時ON/OFFの固定値なのでコイルにはできない
    if(type === "OUT" && /^CR[0-9]+$/.test(device)) return null;
    //INCはワードデバイス(DM)のみ指定できる
    if(type === "INC" && !/^DM[0-9]+$/.test(device)) return null;

    return { cell:type as CellType, device };
}

