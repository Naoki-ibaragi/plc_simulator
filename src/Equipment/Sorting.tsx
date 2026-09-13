import { useGLTF } from '@react-three/drei'
import AssemblyEquipment from './AssemblyScene'
import sortingModelUrl from './model/sorting/sorting_model.gltf'

useGLTF.preload(sortingModelUrl);

//仕分けステーション。コンベア(Y0)でワークを搬送し、エアシリンダー(Y1)で押し出す。
//オートスイッチ(X0/X1)・近接センサー(X2)・光電センサー(X3)はワークの状態を検出する入力。
//挙動はmodel/sorting/配下の*_assembly.json(動作定義ファイル)から決まる。
//CADエクスポート時の座標系(Z-up)のままだとモデル全体がX軸周りに90°傾いて見えるため、Y-upに補正している。
//向きが逆になる場合は-90を90に変えること
function Sorting() {
  return <AssemblyEquipment modelUrl={sortingModelUrl} modelFolder="sorting" modelRotationDeg={[-90, 0, 0]} />
}

export default Sorting
