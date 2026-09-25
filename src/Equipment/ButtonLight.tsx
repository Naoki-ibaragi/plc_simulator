import { useGLTF } from '@react-three/drei'
import AssemblyEquipment from './AssemblyScene'
import buttonLightUrl from './model/button_light/button_light.gltf'

useGLTF.preload(buttonLightUrl);
const MODEL_ROTATION_DEG: [number, number, number] = [0, 0, 0]
const CAMERA_POSITION: [number, number, number] = [0, 10, 10]

//押しボタン(X1)とランプ(X0)。挙動はmodel/button_light/配下の*_assembly.json(動作定義ファイル)から決まる
function ButtonLight() {
  return(
  <AssemblyEquipment 
    modelUrl={buttonLightUrl} 
    modelFolder="button_light" 
    modelRotationDeg={MODEL_ROTATION_DEG}
    cameraPosition={CAMERA_POSITION}
  />
  )
}

export default ButtonLight


