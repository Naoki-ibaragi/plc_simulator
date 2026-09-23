import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type ReactNode } from "react";
import { RuntimeContext, DeviceValueContext, WordValueContext, type runMode } from "./RuntimeContext";
import { EditCellStatusContext } from "../Ladder/LadderContext";
import { createDeviceValue, type WordValue } from "../Ladder/Variants";
import { compileLadder, evaluateScan, type LadderCompileError, type TimerState } from "../Ladder/ladderEngine";
import { createAxisStates, stepAxisUnit, type AxisState, type AxisUnitConfig } from "./axisUnit";

const SCAN_INTERVAL_MS = 5;

interface Props {
    axisUnit?:AxisUnitConfig; //設備に位置決めユニットがある場合のみ指定する
    children:ReactNode;
}

export function RuntimeProvider({ axisUnit, children }:Props) {
    const { ladderMap } = useContext(EditCellStatusContext);

    const [mode, setMode] = useState<runMode>("EDIT");
    const [compileErrors, setCompileErrors] = useState<LadderCompileError[]>([]);
    const [deviceValue, setDeviceValue] = useState<Record<string, boolean>>(createDeviceValue());
    const [wordValue, setWordValue] = useState<WordValue>({});
    const wordValueRef = useRef<WordValue>({});
    const ladderMapRef = useRef(ladderMap);
    ladderMapRef.current = ladderMap;
    //スキャンでタイマー経過時間を更新するため、最新のデバイス値/タイマー状態はrefで保持する
    const deviceValueRef = useRef<Record<string, boolean>>(deviceValue);
    const timersRef = useRef<TimerState>({});
    const prevScanValueRef = useRef<Record<string, boolean>>(deviceValue); //前回スキャン開始時点のデバイス値
    const initialAxisStates = useMemo(() => axisUnit ? createAxisStates(axisUnit) : [], [axisUnit]);
    const axisStatesRef = useRef<AxisState[]>(initialAxisStates);
    const axisPositionsRef = useRef<number[]>(initialAxisStates.map(state => state.position));

    const resetDeviceValue = useCallback(() => {
        deviceValueRef.current = createDeviceValue();
        prevScanValueRef.current = deviceValueRef.current;
        timersRef.current = {};
        wordValueRef.current = {};
        if(axisUnit){
            axisStatesRef.current = createAxisStates(axisUnit);
            axisPositionsRef.current = axisStatesRef.current.map(state => state.position);
        }
        setDeviceValue(deviceValueRef.current);
        setWordValue(wordValueRef.current);
    }, [axisUnit]);

    const tryEnterRun = useCallback(() => {
        const result = compileLadder(ladderMapRef.current);
        if(!result.ok){
            setCompileErrors(result.errors);
            return;
        }
        setCompileErrors([]);
        resetDeviceValue();
        setMode("RUN");
    }, [resetDeviceValue]);

    const exitToEdit = useCallback(() => {
        resetDeviceValue();
        setMode("EDIT");
    }, [resetDeviceValue]);

    const setInputDevice = useCallback((device:string, value:boolean) => {
        //センサー等が毎フレーム現在値を書き込んでも、値が変わらなければ再レンダーしない
        if(deviceValueRef.current[device] === value) return;
        deviceValueRef.current = { ...deviceValueRef.current, [device]: value };
        setDeviceValue(deviceValueRef.current);
    }, []);

    //ランモード中は一定周期でラダーをスキャンし、デバイス値を更新する
    useEffect(() => {
        if(mode !== "RUN") return;
        let lastScanAt = performance.now();
        const timer = setInterval(() => {
            const now = performance.now();
            const elapsedMs = now - lastScanAt;
            const result = evaluateScan(ladderMapRef.current, deviceValueRef.current, timersRef.current, elapsedMs, prevScanValueRef.current, wordValueRef.current);
            lastScanAt = now;
            let nextDeviceValue = result.deviceValue;
            let nextWordValue = result.wordValue;

            //位置決めユニット: 専用命令の反映 → 軸の動作 → 入力リレーの書き戻し(実機のリフレッシュ順)
            if(axisUnit){
                const states = axisStatesRef.current.slice();
                nextWordValue = { ...nextWordValue };
                for(const cmd of result.unitCommands){
                    const index = cmd.axis - 1;
                    if(!states[index]) continue;
                    if(cmd.kind === 'WRPPNT'){
                        const point = /^[0-9]+$/.test(cmd.operand) ? Number(cmd.operand) : (nextWordValue[cmd.operand] ?? 0);
                        states[index] = { ...states[index], startPoint: point };
                    }else{
                        nextWordValue[cmd.operand] = states[index].errorCode;
                    }
                }
                const step = stepAxisUnit(states, axisUnit, nextDeviceValue, elapsedMs);
                axisStatesRef.current = step.states;
                axisPositionsRef.current = step.states.map(state => state.position);
                nextDeviceValue = { ...nextDeviceValue, ...step.writes };
            }

            prevScanValueRef.current = deviceValueRef.current;
            timersRef.current = result.timers;
            deviceValueRef.current = nextDeviceValue;
            setDeviceValue(nextDeviceValue);
            wordValueRef.current = nextWordValue;
            setWordValue(nextWordValue);
        }, SCAN_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [mode, axisUnit]);

    //mode/compileErrors等はランモード中ずっと変化しないため、deviceValueと同じcontext値に含めてしまうと
    //deviceValueの更新(100ms毎)のたびにmodeしか見ていないコンポーネントまで再レンダーされてしまう。
    //そのためこちらは変化した項目があるときだけ新しいオブジェクトになるようmemo化する
    const runtimeStatusValue = useMemo(() => ({
        mode,
        compileErrors,
        setInputDevice,
        tryEnterRun,
        exitToEdit,
        axisPositionsRef,
    }), [mode, compileErrors, setInputDevice, tryEnterRun, exitToEdit]);

    return (
        <RuntimeContext.Provider value={runtimeStatusValue}>
            <DeviceValueContext.Provider value={deviceValue}>
                <WordValueContext.Provider value={wordValue}>
                    {children}
                </WordValueContext.Provider>
            </DeviceValueContext.Provider>
        </RuntimeContext.Provider>
    );
}
