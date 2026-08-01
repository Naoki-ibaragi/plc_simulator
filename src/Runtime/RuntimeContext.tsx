import { createContext } from "react";
import { createDeviceValue } from "../Ladder/Variants";
import { type LadderCompileError } from "../Ladder/ladderEngine";

export type runMode = "EDIT" | "RUN";

export type runtimeStatus = {
    mode:runMode,
    compileErrors:LadderCompileError[],
    deviceValue:Record<string, boolean>,
    setInputDevice:(device:string, value:boolean) => void,
    tryEnterRun:() => void,
    exitToEdit:() => void,
}

export const RuntimeContext = createContext<runtimeStatus>({
    mode: "EDIT",
    compileErrors: [],
    deviceValue: createDeviceValue(),
    setInputDevice: () => {},
    tryEnterRun: () => {},
    exitToEdit: () => {},
});
