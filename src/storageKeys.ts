//設備モデル(equipmentId)ごとにラダー/タッチパネルのデータを分けて永続化するためのlocalStorageキー
export const ladderStorageKey = (equipmentId: string) => `plc-simulator:ladder:${equipmentId}`;
export const touchpanelStorageKey = (equipmentId: string) => `plc-simulator:touchpanel:${equipmentId}`;
