import { useGLTF } from '@react-three/drei'
import AssemblyEquipment from './AssemblyScene'
import counterModelUrl from './model/counter/counter_model.gltf'

useGLTF.preload(counterModelUrl);

//モジュールスコープの定数として保持し、毎レンダーで新しい配列を渡さないようにする
//(渡すたびに参照が変わるとAssemblyModelScene側のuseMemoが毎回再計算され、ワークの位置が初期値に戻ってしまう)
const MODEL_ROTATION_DEG: [number, number, number] = [0, 0, 0]
const CAMERA_POSITION: [number, number, number] = [1, 3, 6]

//カウンター。コンベア(Y0)上の3つのワークを搬送し、光電センサー(X1)の前を通過したワークを数える。
//ベルト終端を越えたワークはワークテーブルへ落下し、先に落ちたワークの上に積み重なる(ワーク同士の接触を考慮)。
//操作パネルの押しボタン(X0)・ランプ(Y1)を含め、挙動はmodel/counter/配下の*_assembly.json(動作定義ファイル)から決まる
function Counter() {
  return (
    <AssemblyEquipment
      modelUrl={counterModelUrl}
      modelFolder="counter"
      modelRotationDeg={MODEL_ROTATION_DEG}
      cameraPosition={CAMERA_POSITION}
    />
  )
}

export default Counter
