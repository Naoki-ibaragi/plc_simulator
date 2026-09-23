import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { AxisUnitConfig } from '../Runtime/axisUnit'
import { electricActuatorAxisUnit } from './electricActuatorConfig'

export type EquipmentEntry = {
  id: string,
  label: string,
  component: LazyExoticComponent<ComponentType>,
  axisUnit?: AxisUnitConfig, //位置決めユニットを使う設備のみ。軸の仕様とポイントテーブルを持つ
}

//新しい設備モデルを追加する場合はここに1件追加するだけでよい(メインページの一覧・ラダーページへの動的ロードに自動反映される)
export const equipmentList: EquipmentEntry[] = [
  { id: 'button-light', label: 'ボタン&ランプ', component: lazy(() => import('./ButtonLight')) },
  { id: 'sorting', label: '仕分けステーション', component: lazy(() => import('./Sorting')) },
  { id: 'electric-actuator', label: '電動アクチュエータ', component: lazy(() => import('./ElectricActuator')), axisUnit: electricActuatorAxisUnit },
  { id: 'pick-and-place', label: 'ピック&プレース', component: lazy(() => import('./PickAndPlace')) },
  { id: 'counter', label: 'カウンター', component: lazy(() => import('./Counter')) },
]

//A接点・B接点・コイル用の設備モデル
export const equipmentListContact: EquipmentEntry[]=[
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
