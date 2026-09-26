import { toKvDeviceName } from "./kvLink";

//I/O割付。設備モデル/タッチパネルが使うデバイス(内蔵ラダー用の名前。以下「信号」)を、
//KV連携時にKVのどのデバイスへ対応させるかを設備ごとに保持する

//input: アプリ(設備のボタン/センサー等)→PLCへ書き込む信号、output: PLC→アプリへ読み出す信号(ランプ/シリンダー等)
export type IoDirection = "input" | "output";
export type IoSource = "equipment" | "touchpanel";

export type IoSignal = {
    device:string, //内蔵ラダーで使うデバイス名(モデルの動作定義JSON/タッチパネル要素に書かれた名前)
    direction:IoDirection,
    label:string, //割付表に表示する対象の説明(例: "押しボタン button_component")
    source:IoSource,
}

//信号(内蔵ラダー用デバイス名) → KVデバイス名。未割付の信号は同じ名前のままKVへ送る
export type KvIoMap = Record<string, string>;

export const kvIoMapStorageKey = (equipmentId: string) => `plc-simulator:kv-io-map:${equipmentId}`;

export function loadKvIoMap(storageKey:string):KvIoMap {
    try{
        const raw = localStorage.getItem(kvIoMapStorageKey(storageKey));
        const parsed:unknown = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed as KvIoMap : {};
    }catch{
        return {};
    }
}

export function saveKvIoMap(storageKey:string, map:KvIoMap) {
    try{
        localStorage.setItem(kvIoMapStorageKey(storageKey), JSON.stringify(map));
    }catch{
        //保存できない環境(ストレージ無効等)でも割付自体はメモリ上で有効
    }
}

//KV連携時に実際に読み書きするKVデバイス名。不正な名前ならnull
export function resolveKvDevice(map:KvIoMap, device:string):string | null {
    const assigned = map[device]?.trim();
    return toKvDeviceName(assigned ? assigned : device);
}

//同じ信号が複数の部品で使われる場合(1つの出力で複数ランプを点灯する等)は1行にまとめる
export function mergeIoSignals(signals:IoSignal[]):IoSignal[] {
    const merged = new Map<string, IoSignal>();
    for(const signal of signals){
        const existing = merged.get(signal.device);
        if(!existing){
            merged.set(signal.device, { ...signal });
            continue;
        }
        if(!existing.label.split(" / ").includes(signal.label)) existing.label += ` / ${signal.label}`;
        //出力(PLC→アプリ)として使う部品が1つでもあれば読出し対象にする
        if(signal.direction === "output") existing.direction = "output";
    }
    return [...merged.values()].sort((a, b) => compareDevices(a.device, b.device));
}

//X2 < X10 となるよう、種別→番号の順で並べる
export function compareDevices(a:string, b:string):number {
    const pa = /^([A-Z]*)(\d*)$/.exec(a);
    const pb = /^([A-Z]*)(\d*)$/.exec(b);
    if(pa && pb && pa[1] === pb[1] && pa[2] && pb[2]) return Number(pa[2]) - Number(pb[2]);
    return a.localeCompare(b);
}

//KVのリレー系デバイス(R/MR/LR/CR)は「チャンネル×100+ビット(00~15)」の番号体系(R015の次はR100)
const CHANNEL_RELAY = /^(R|MR|LR|CR)(\d+)$/;

//startからoffset点目のリレーを返す(例: R58000 + 17 → R58101)。リレー系以外/不正な番号ならnull
export function offsetRelayDevice(start:string, offset:number):string | null {
    const match = CHANNEL_RELAY.exec(start.trim().toUpperCase());
    if(!match) return null;
    const number = Number(match[2]);
    const startBit = number % 100;
    if(startBit > 15) return null;
    const index = Math.floor(number / 100) * 16 + startBit + offset;
    const channel = Math.floor(index / 16);
    const bit = index % 16;
    return `${match[1]}${channel}${String(bit).padStart(2, "0")}`;
}
