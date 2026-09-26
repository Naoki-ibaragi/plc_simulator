import { useContext, useEffect } from "react";
import { RuntimeContext } from "./RuntimeContext";
import { type IoSignal } from "./ioMap";

//設備モデル/タッチパネルが使う信号を登録する(I/O割付表の行、KV連携時の読み書き対象になる)。
//ownerごとに管理され、アンマウント時に登録解除される
export function useIoSignals(owner:string, signals:IoSignal[]) {
    const { registerIoSignals } = useContext(RuntimeContext);
    //配列の参照が毎レンダー変わっても、中身が同じなら登録し直さない
    const key = JSON.stringify(signals);
    useEffect(() => {
        registerIoSignals(owner, JSON.parse(key) as IoSignal[]);
        return () => registerIoSignals(owner, []);
    }, [owner, key, registerIoSignals]);
}
