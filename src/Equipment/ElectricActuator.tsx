import { useContext, useEffect, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import AssemblyEquipment from './AssemblyScene'
import { RuntimeContext } from '../Runtime/RuntimeContext'
import electricActuatorUrl from './model/electric_actuator/simple_electric_actuator_model.gltf'

useGLTF.preload(electricActuatorUrl);

//モデルはZ軸が下向き(ステージ等がテーブル面より-Z側に載っている)のため、Y-upへ補正するには+90°回す。
//上下逆・向きが違って見える場合はこの値を調整すること。
//モジュールスコープの定数として保持し、毎レンダーで新しい配列を渡さないようにする(AssemblyModelSceneのuseMemoが再計算されないように)
const MODEL_ROTATION_DEG: [number, number, number] = [90, 0, 0]
const CAMERA_POSITION: [number, number, number] = [4, 4, 6]

//現在位置の表示(動作確認用の数値表示)
function PositionDisplay() {
  const { axisPositionsRef } = useContext(RuntimeContext);
  const [positionMm, setPositionMm] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setPositionMm(axisPositionsRef.current[0] ?? 0), 100);
    return () => clearInterval(timer);
  }, [axisPositionsRef]);

  return (
    <div className='pointer-events-none absolute left-3 top-3 rounded-md bg-white/80 px-3 py-1.5 text-sm text-gray-800 shadow'>
      軸1 現在位置: {positionMm.toFixed(1)} mm
    </div>
  )
}

//電動アクチュエータ。ステージの動きは位置決めユニット(軸1、R/専用命令)で制御する。
//押しボタン(X0~X3)・ランプ(Y0~Y3)を含め、挙動はmodel/electric_actuator/配下の*_assembly.json(動作定義ファイル)から決まる
function ElectricActuator() {
  return (
    <div className='relative h-full w-full'>
      <AssemblyEquipment
        modelUrl={electricActuatorUrl}
        modelFolder="electric_actuator"
        modelRotationDeg={MODEL_ROTATION_DEG}
        cameraPosition={CAMERA_POSITION}
      />
      <PositionDisplay />
    </div>
  )
}

export default ElectricActuator
