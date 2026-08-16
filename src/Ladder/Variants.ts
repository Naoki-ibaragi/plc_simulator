//NONE:空,LD:A接点,LDB:B接点,OUT:コイル,LINE:横線
export type CellType = "NONE" | "LD" | "LDB" | "LDP" | "LDF" | "TMR" | "OUT" | "LINE" | "INC" | "MOV" | "DMOV" | "BMOV";
export type CellDevice = string | null;
export type CellComment = string | null;

//Ladderの行・列数
export const COLUMN_NUM=10
export const ROW_NUM=100

//セル状態オブジェクト
export type ladderCell = {
    cell:CellType,
    hasLine:boolean[], //縦線があるか 0:左上、1:左下
    check:boolean, //セルの内容がPLCのルールに反していないか
    device:CellDevice, //デバイス番号
}

//100行x10列の配列でラダーを表現する初期状態を作る
export function createInitialLadderMap():ladderCell[][] {
    const map:ladderCell[][] = [];
    for(let y=0;y<ROW_NUM;y++){
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

//デバイスキー一覧を列挙する（X0~X31,Y0~Y31,D0~D99,M0~M99,T0~T99）
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
    return keys;
}

//コメントの初期化
export function createDeviceComment(){
    const commentObj:{[key:string]:string}={};
    for(const key of listDeviceKeys()){
        commentObj[key] = "";
    }
    return commentObj;
}

//デバイス値(ON/OFF)の初期化
export function createDeviceValue():{[key:string]:boolean}{
    const valueObj:{[key:string]:boolean}={};
    for(const key of listDeviceKeys()){
        valueObj[key] = false;
    }
    return valueObj;
}

const CELL_TYPES:CellType[] = ["LD","LDB","OUT","LINE"];
const DEVICE_REGEX = /^[A-Z]+[0-9]+$/;

export type ParsedCommand = {
    cell:CellType,
    device:CellDevice,
}

//「TYPE DEVICE」形式の命令をパースする（例: "LD X0", "OUT Y0", "LINE"）
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

    if(parts.length !== 2) return null;
    const device = parts[1].toUpperCase();
    if(!DEVICE_REGEX.test(device)) return null;

    return { cell:type as CellType, device };
}

