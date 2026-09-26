import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type ReactNode } from "react";
import { RuntimeContext, DeviceValueContext, WordValueContext, type runMode } from "./RuntimeContext";
import { EditCellStatusContext } from "../Ladder/LadderContext";
import { createDeviceValue, type WordValue } from "../Ladder/Variants";
import { compileLadder, evaluateScan, type LadderCompileError, type TimerState } from "../Ladder/ladderEngine";
import { createAxisStates, stepAxisUnit, type AxisState, type AxisUnitConfig } from "./axisUnit";
import { isKvLinkAvailable, kvConnect, kvDisconnect, kvSetWatch, kvWriteBit, onKvStatus, onKvValues } from "./kvLink";
import { loadKvIoMap, mergeIoSignals, resolveKvDevice, saveKvIoMap, type IoSignal, type KvIoMap } from "./ioMap";

const SCAN_INTERVAL_MS = 5;

interface Props {
    axisUnit?:AxisUnitConfig; //設備に位置決めユニットがある場合のみ指定する
    storageKey:string; //I/O割付を設備ごとに保存するためのキー(設備モデルID)
    children:ReactNode;
}

//KVから周期読出しするのは出力信号(PLC→アプリ)だけ。入力信号はアプリが書き込む側なので読む必要がない
function kvOutputDevices(signals:IoSignal[], map:KvIoMap):string[] {
    const devices = signals
        .filter(signal => signal.direction === "output")
        .map(signal => resolveKvDevice(map, signal.device))
        .filter((device): device is string => device !== null);
    return [...new Set(devices)].sort();
}

export function RuntimeProvider({ axisUnit, storageKey, children }:Props) {
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

    //---- KV STUDIOシミュレータ連携 ----
    const [kvActive, setKvActive] = useState(false);
    const [kvConnecting, setKvConnecting] = useState(false);
    const [kvError, setKvError] = useState<string | null>(null);
    //イベントハンドラから最新の状態を参照するためrefでも持つ(refの更新は描画中ではなく各setter内で行う)
    const kvActiveRef = useRef(false);
    //アプリからKVへ書き込んだ入力の値(KVデバイス名→値)。同じ値の再送を防ぎ、周期読出しの値よりこちらを優先する
    const kvWrittenRef = useRef<Record<string, boolean>>({});

    //設備モデル/タッチパネルが使う信号と、そのKVデバイスへの割付
    const signalOwnersRef = useRef<Record<string, IoSignal[]>>({});
    const [ioSignals, setIoSignals] = useState<IoSignal[]>([]);
    const ioSignalsRef = useRef<IoSignal[]>([]);
    const [kvIoMap, setKvIoMapState] = useState<KvIoMap>(() => loadKvIoMap(storageKey));
    const kvIoMapRef = useRef(kvIoMap);

    const registerIoSignals = useCallback((owner:string, signals:IoSignal[]) => {
        signalOwnersRef.current = { ...signalOwnersRef.current, [owner]: signals };
        const next = mergeIoSignals(Object.values(signalOwnersRef.current).flat());
        if(JSON.stringify(next) === JSON.stringify(ioSignalsRef.current)) return;
        ioSignalsRef.current = next;
        setIoSignals(next);
    }, []);

    const setKvIoMap = useCallback((map:KvIoMap) => {
        kvIoMapRef.current = map;
        setKvIoMapState(map);
        saveKvIoMap(storageKey, map);
    }, [storageKey]);

    const endKvLink = useCallback((error:string | null) => {
        if(!kvActiveRef.current){
            if(error) setKvError(error);
            return;
        }
        kvActiveRef.current = false;
        kvWrittenRef.current = {};
        setKvActive(false);
        setKvError(error);
        resetDeviceValue();
        setMode("EDIT");
    }, [resetDeviceValue]);

    const connectKv = useCallback(async () => {
        if(!isKvLinkAvailable() || kvActiveRef.current) return;
        setKvConnecting(true);
        setKvError(null);
        setCompileErrors([]);
        resetDeviceValue();
        kvWrittenRef.current = {};
        //接続直後に届く最初の読出し結果を取りこぼさないよう、応答を待つ前から受信を有効にしておく
        kvActiveRef.current = true;
        try{
            await kvConnect({ bits: kvOutputDevices(ioSignalsRef.current, kvIoMapRef.current), words: [] });
            setKvActive(true);
            setMode("RUN");
        }catch(e){
            kvActiveRef.current = false;
            setKvError(String(e));
        }finally{
            setKvConnecting(false);
        }
    }, [resetDeviceValue]);

    const disconnectKv = useCallback(() => {
        kvDisconnect().catch(() => {});
        endKvLink(null);
    }, [endKvLink]);

    //KVからの周期読出し結果と切断通知を受け取る
    useEffect(() => {
        if(!isKvLinkAvailable()) return;
        const unlisteners = [
            onKvValues(values => {
                if(!kvActiveRef.current) return;
                //KVデバイスの値を、割付元の信号(内蔵ラダー用の名前)の値として反映する
                const next = { ...deviceValueRef.current };
                for(const signal of ioSignalsRef.current){
                    if(signal.direction !== "output") continue;
                    const kvDevice = resolveKvDevice(kvIoMapRef.current, signal.device);
                    if(!kvDevice || !(kvDevice in values.bits)) continue;
                    //アプリが書き込むデバイスはアプリ側の値を正とする(書込みが反映される前の古い読出し値で戻らないように)
                    if(kvDevice in kvWrittenRef.current) continue;
                    next[signal.device] = values.bits[kvDevice];
                }
                deviceValueRef.current = next;
                setDeviceValue(next);
            }),
            onKvStatus(status => {
                if(!status.connected) endKvLink(status.error);
            }),
        ];
        return () => {
            unlisteners.forEach(promise => promise.then(unlisten => unlisten()));
        };
    }, [endKvLink]);

    //連携中に信号(設備・タッチパネル)や割付が変わったらKV側の読出し対象も差し替える
    const kvWatchKey = useMemo(() => kvOutputDevices(ioSignals, kvIoMap).join(","), [ioSignals, kvIoMap]);
    useEffect(() => {
        if(!kvActive) return;
        kvSetWatch({ bits: kvWatchKey ? kvWatchKey.split(",") : [], words: [] }).catch(e => setKvError(String(e)));
    }, [kvActive, kvWatchKey]);

    //連携中に設備ページを離れた場合も接続を残さない
    useEffect(() => () => {
        if(kvActiveRef.current) kvDisconnect().catch(() => {});
    }, []);

    const setInputDevice = useCallback((device:string, value:boolean) => {
        if(kvActiveRef.current){
            const kvDevice = resolveKvDevice(kvIoMapRef.current, device);
            if(kvDevice && kvWrittenRef.current[kvDevice] !== value){
                kvWrittenRef.current[kvDevice] = value;
                kvWriteBit(kvDevice, value).catch(e => setKvError(String(e)));
            }
        }
        //センサー等が毎フレーム現在値を書き込んでも、値が変わらなければ再レンダーしない
        if(deviceValueRef.current[device] === value) return;
        deviceValueRef.current = { ...deviceValueRef.current, [device]: value };
        setDeviceValue(deviceValueRef.current);
    }, []);

    //ランモード中は一定周期でラダーをスキャンし、デバイス値を更新する(KV連携中はKV側がスキャンするので行わない)
    useEffect(() => {
        if(mode !== "RUN" || kvActive) return;
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
    }, [mode, kvActive, axisUnit]);

    //mode/compileErrors等はランモード中ずっと変化しないため、deviceValueと同じcontext値に含めてしまうと
    //deviceValueの更新(100ms毎)のたびにmodeしか見ていないコンポーネントまで再レンダーされてしまう。
    //そのためこちらは変化した項目があるときだけ新しいオブジェクトになるようmemo化する
    const runtimeStatusValue = useMemo(() => ({
        mode,
        compileErrors,
        setInputDevice,
        tryEnterRun,
        //KV連携中に「編集に戻る」が押された場合は連携を終了する
        exitToEdit: kvActive ? disconnectKv : exitToEdit,
        axisPositionsRef,
        kvLink: {
            available: isKvLinkAvailable(),
            active: kvActive,
            connecting: kvConnecting,
            error: kvError,
            connect: () => { void connectKv(); },
            disconnect: disconnectKv,
        },
        registerIoSignals,
        ioSignals,
        kvIoMap,
        setKvIoMap,
    }), [mode, compileErrors, setInputDevice, tryEnterRun, exitToEdit, kvActive, kvConnecting, kvError, connectKv, disconnectKv, registerIoSignals, ioSignals, kvIoMap, setKvIoMap]);

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
