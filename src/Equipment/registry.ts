import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type EquipmentEntry = {
  id: string,
  label: string,
  component: LazyExoticComponent<ComponentType>,
}

//新しい設備モデルを追加する場合はここに1件追加するだけでよい(メインページの一覧・ラダーページへの動的ロードに自動反映される)
export const equipmentList: EquipmentEntry[] = [
  { id: 'sensor-count', label: 'センサーカウント', component: lazy(() => import('./SensorCount')) },
  { id: 'cylinder', label: 'エアシリンダー', component: lazy(() => import('./Equipment')) },
  { id: 'control-panel', label: '操作パネル', component: lazy(() => import('./ControlPanel')) },
  { id: 'pick-and-place', label: 'ピック&プレース', component: lazy(() => import('./PickAndPlace')) },
]

export function getEquipmentById(id: string) {
  return equipmentList.find(equipment => equipment.id === id)
}
