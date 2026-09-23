import { useGLTF } from '@react-three/drei'
import AssemblyEquipment from './AssemblyScene'
import pickAndPlaceModelUrl from './model/pick_and_place/pick_and_place_model.gltf'

useGLTF.preload(pickAndPlaceModelUrl);

//モジュールスコープの定数として保持し、毎レンダーで新しい配列を渡さないようにする
//(渡すたびに参照が変わるとAssemblyModelScene側のuseMemoが毎回再計算され、ワークの位置が初期値に戻ってしまう)
const MODEL_ROTATION_DEG: [number, number, number] = [0, 0, 0]
const CAMERA_POSITION: [number, number, number] = [5, 4, 8]

//ピック&プレース。エアシリンダー(Y0)が上下動し、その先端に取り付けられたエアチャック(Y1)がワークを把持する。
//オートスイッチ(X0/X1:シリンダー上下端、X2/X3:チャック開閉端)はワークの状態を検出する入力。
//操作パネルの押しボタン(X4~X7:上昇/下降/開/閉)・ランプ(Y2~Y5)を含め、
//挙動はmodel/pick_and_place/配下の*_assembly.json(動作定義ファイル)から決まる
function PickAndPlace() {
  return (
    <AssemblyEquipment
      modelUrl={pickAndPlaceModelUrl}
      modelFolder="pick_and_place"
      modelRotationDeg={MODEL_ROTATION_DEG}
      cameraPosition={CAMERA_POSITION}
    />
  )
}

export default PickAndPlace
