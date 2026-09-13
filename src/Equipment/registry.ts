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
  { id: 'button-patlight', label: '押しボタン&積層信号灯', component: lazy(() => import('./ButtonPatlight')) },
  { id: 'start-stop', label: 'スタート/ストップ', component: lazy(() => import('./StartStop')) },
  { id: 'button-light', label: 'ボタン&ランプ', component: lazy(() => import('./ButtonLight')) },
  { id: 'sorting', label: '仕分けステーション', component: lazy(() => import('./Sorting')) },
]

//A接点・B接点・コイル用の設備モデル
export const equipmentListContact: EquipmentEntry[]=[
  { id: 'button-patlight', label: '押しボタン&積層信号灯', component: lazy(() => import('./ButtonPatlight')) },
]

//パルス用の設備モデル
export const equipmentListPulse: EquipmentEntry[]=[
]

//自己保持回路用の設備モデル
export const equipmentListSelfHolding: EquipmentEntry[]=[
]

//数値演算用の設備モデル
export const equipmentListNumber: EquipmentEntry[]=[
]

//タイマー用の設備モデル
export const equipmentListTimer: EquipmentEntry[]=[
]

//応用編の設備モデル
export const equipmentListAdvanced: EquipmentEntry[]=[
]

export function getEquipmentById(id: string) {
  return equipmentList.find(equipment => equipment.id === id)
}
