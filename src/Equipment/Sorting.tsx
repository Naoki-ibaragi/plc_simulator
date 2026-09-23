import { useGLTF } from '@react-three/drei'
import AssemblyEquipment from './AssemblyScene'
import sortingModelUrl from './model/sorting/sorting_model.gltf'

useGLTF.preload(sortingModelUrl);

//CADエクスポート時の座標系(Z-up)のままだとモデル全体がX軸周りに90°傾いて見えるため、Y-upに補正している。
//向きが逆になる場合は-90を90に変えること。
//モジュールスコープの定数として保持し、毎レンダーで新しい配列を渡さないようにする
//(渡すたびに参照が変わるとAssemblyModelScene側のuseMemoが毎回再計算され、ワークの位置が初期値に戻ってしまう)
const MODEL_ROTATION_DEG: [number, number, number] = [-90, 0, 0]

//初期視点。ベルト(コンベア)はワールドX軸方向に長いため、+Z側からベルトの側面全体を見渡せる位置にしている。
//見る向きを変えたい場合はこの座標を調整すること(AssemblyEquipmentのcameraPositionプロップ)
const CAMERA_POSITION: [number, number, number] = [0, 1.5, 5]

//仕分けステーション。コンベア(Y0)でワークを搬送し、エアシリンダー(Y1)で押し出す。
//オートスイッチ(X0/X1)・近接センサー(X2)・光電センサー(X3)はワークの状態を検出する入力。
//挙動はmodel/sorting/配下の*_assembly.json(動作定義ファイル)から決まる
function Sorting() {
  return (
    <AssemblyEquipment
      modelUrl={sortingModelUrl}
      modelFolder="sorting"
      modelRotationDeg={MODEL_ROTATION_DEG}
      cameraPosition={CAMERA_POSITION}
    />
  )
}

export default Sorting
