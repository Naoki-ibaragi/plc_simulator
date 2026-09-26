import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

//KV STUDIOシミュレータとの上位リンク通信(src-tauri/src/kv_link.rs)のフロント側API。
//デバイス名はKVの表記(例: "MR0", "X0", "DM0")で指定する

export type KvWatchList = { bits: string[]; words: string[] };
export type KvConnectInfo = { modelCode: string; running: boolean };
export type KvDeviceSnapshot = { bits: Record<string, boolean>; words: Record<string, number> };
export type KvLinkStatus = { connected: boolean; error: string | null };

export const KV_DEFAULT_HOST = "127.0.0.1";
export const KV_DEFAULT_PORT = 8501;

//ブラウザ(npm run dev)で開いている場合はRust側が無いため使えない
export const isKvLinkAvailable = () => isTauri();

//Rust側(hostlink.rs normalize_device)と同じ条件。未入力や不正な名前を監視対象に含めると接続自体が失敗するため事前に除く
export function toKvDeviceName(device:string):string | null {
    const name = device.trim().toUpperCase();
    return /^[A-Z][A-Z0-9]{1,15}$/.test(name) && /[0-9]/.test(name) ? name : null;
}

export function kvConnect(watch:KvWatchList, options:{ host?:string, port?:number, intervalMs?:number } = {}) {
    return invoke<KvConnectInfo>("kv_connect", {
        host: options.host ?? KV_DEFAULT_HOST,
        port: options.port ?? KV_DEFAULT_PORT,
        //ループバック通信で1回の読出しは1ms未満のため、短い周期でも負荷は小さい
        intervalMs: options.intervalMs ?? 20,
        watch,
    });
}

export const kvDisconnect = () => invoke<void>("kv_disconnect");
export const kvSetWatch = (watch:KvWatchList) => invoke<void>("kv_set_watch", { watch });
export const kvWriteBit = (device:string, value:boolean) => invoke<void>("kv_write_bit", { device, value });
export const kvWriteWord = (device:string, value:number) => invoke<void>("kv_write_word", { device, value });
export const kvRawCommand = (command:string) => invoke<string>("kv_raw_command", { command });

//監視デバイスの値が変化するたびに呼ばれる
export const onKvValues = (handler:(values:KvDeviceSnapshot) => void):Promise<UnlistenFn> =>
    listen<KvDeviceSnapshot>("kv-link:values", event => handler(event.payload));

//接続/切断(通信エラーによる切断を含む)のたびに呼ばれる
export const onKvStatus = (handler:(status:KvLinkStatus) => void):Promise<UnlistenFn> =>
    listen<KvLinkStatus>("kv-link:status", event => handler(event.payload));
