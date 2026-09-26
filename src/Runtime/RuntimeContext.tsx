import { createContext, type MutableRefObject } from "react";
import { createDeviceValue, type WordValue } from "../Ladder/Variants";
import { type LadderCompileError } from "../Ladder/ladderEngine";
import { type IoSignal, type KvIoMap } from "./ioMap";

export type runMode = "EDIT" | "RUN";

//KV STUDIOシミュレータとの連携状態。連携中はmodeが"RUN"になり、内部のラダーエンジンの代わりに
//KVのデバイス値で設備を動かす(入力デバイスはアプリ→KVへ書込み、それ以外はKV→アプリへ周期読出し)
export type kvLinkStatus = {
    available:boolean, //Tauri版でのみtrue(ブラウザ版はソケット通信できない)
    active:boolean,
    connecting:boolean,
    error:string | null,
    connect:() => void,
    disconnect:() => void,
}

export type runtimeStatus = {
    mode:runMode,
    compileErrors:LadderCompileError[],
    setInputDevice:(device:string, value:boolean) => void,
    tryEnterRun:() => void,
    exitToEdit:() => void,
    //位置決めユニットの各軸の現在位置(mm)。毎スキャン変わるためstateにせずrefで渡し、描画側がuseFrame等で読む
    axisPositionsRef:MutableRefObject<number[]>,
    kvLink:kvLinkStatus,
    //設備モデル/タッチパネルが使う信号を登録する(owner単位で上書き。useIoSignals経由で使う)
    registerIoSignals:(owner:string, signals:IoSignal[]) => void,
    ioSignals:IoSignal[], //登録済みの全信号(同じデバイスは1つにまとめ済み)
    kvIoMap:KvIoMap, //KV連携時のI/O割付
    setKvIoMap:(map:KvIoMap) => void,
}

export const RuntimeContext = createContext<runtimeStatus>({
    mode: "EDIT",
    compileErrors: [],
    setInputDevice: () => {},
    tryEnterRun: () => {},
    exitToEdit: () => {},
    axisPositionsRef: { current: [] },
    kvLink: { available: false, active: false, connecting: false, error: null, connect: () => {}, disconnect: () => {} },
    registerIoSignals: () => {},
    ioSignals: [],
    kvIoMap: {},
    setKvIoMap: () => {},
});

//deviceValueはランモード中100ms毎に更新されるため、RuntimeContextと同居させると
//mode/compileErrors等しか使わないコンポーネントまでランモード中ずっと不要な再レンダーを起こしてしまう。
//更新頻度が全く異なるためコンテキストを分離し、deviceValueを実際に使うコンポーネントだけが再レンダーされるようにする
export const DeviceValueContext = createContext<Record<string, boolean>>(createDeviceValue());

//ワードデバイス(DM)の値。ビットデバイスとは型が異なるため別コンテキストで持つ
export const WordValueContext = createContext<WordValue>({});
