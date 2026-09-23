import { createContext, type MutableRefObject } from "react";
import { createDeviceValue, type WordValue } from "../Ladder/Variants";
import { type LadderCompileError } from "../Ladder/ladderEngine";

export type runMode = "EDIT" | "RUN";

export type runtimeStatus = {
    mode:runMode,
    compileErrors:LadderCompileError[],
    setInputDevice:(device:string, value:boolean) => void,
    tryEnterRun:() => void,
    exitToEdit:() => void,
    //位置決めユニットの各軸の現在位置(mm)。毎スキャン変わるためstateにせずrefで渡し、描画側がuseFrame等で読む
    axisPositionsRef:MutableRefObject<number[]>,
}

export const RuntimeContext = createContext<runtimeStatus>({
    mode: "EDIT",
    compileErrors: [],
    setInputDevice: () => {},
    tryEnterRun: () => {},
    exitToEdit: () => {},
    axisPositionsRef: { current: [] },
});

//deviceValueはランモード中100ms毎に更新されるため、RuntimeContextと同居させると
//mode/compileErrors等しか使わないコンポーネントまでランモード中ずっと不要な再レンダーを起こしてしまう。
//更新頻度が全く異なるためコンテキストを分離し、deviceValueを実際に使うコンポーネントだけが再レンダーされるようにする
export const DeviceValueContext = createContext<Record<string, boolean>>(createDeviceValue());

//ワードデバイス(DM)の値。ビットデバイスとは型が異なるため別コンテキストで持つ
export const WordValueContext = createContext<WordValue>({});
