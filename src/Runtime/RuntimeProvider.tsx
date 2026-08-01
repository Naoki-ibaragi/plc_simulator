import { useContext, useEffect, useRef, useState } from "react";
import { type ReactNode } from "react";
import { RuntimeContext, type runMode } from "./RuntimeContext";
import { EditCellStatusContext } from "../Ladder/LadderContext";
import { createDeviceValue } from "../Ladder/Variants";
import { compileLadder, evaluateScan, type LadderCompileError } from "../Ladder/ladderEngine";

const SCAN_INTERVAL_MS = 100;

interface Props {
    children:ReactNode;
}

export function RuntimeProvider({ children }:Props) {
    const { ladderMap } = useContext(EditCellStatusContext);

    const [mode, setMode] = useState<runMode>("EDIT");
    const [compileErrors, setCompileErrors] = useState<LadderCompileError[]>([]);
    const [deviceValue, setDeviceValue] = useState<Record<string, boolean>>(createDeviceValue());
    const ladderMapRef = useRef(ladderMap);
    ladderMapRef.current = ladderMap;

    const tryEnterRun = () => {
        const result = compileLadder(ladderMapRef.current);
        if(!result.ok){
            setCompileErrors(result.errors);
            return;
        }
        setCompileErrors([]);
        setDeviceValue(createDeviceValue());
        setMode("RUN");
    };

    const exitToEdit = () => {
        setMode("EDIT");
    };

    const setInputDevice = (device:string, value:boolean) => {
        setDeviceValue(prev => ({ ...prev, [device]: value }));
    };

    //ランモード中は一定周期でラダーをスキャンし、デバイス値を更新する
    useEffect(() => {
        if(mode !== "RUN") return;
        const timer = setInterval(() => {
            setDeviceValue(prev => evaluateScan(ladderMapRef.current, prev));
        }, SCAN_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [mode]);

    return (
        <RuntimeContext.Provider
            value={{
                mode,
                compileErrors,
                deviceValue,
                setInputDevice,
                tryEnterRun,
                exitToEdit,
            }}
        >
            {children}
        </RuntimeContext.Provider>
    );
}
