import { COLUMN_NUM } from './Ladder/Variants'

//ラダー表の1セル幅(px)・行番号列幅(px)。LadderDisplayのグリッド(w-12 + w-20×COLUMN_NUM)と一致させること
const CELL_WIDTH = 80
const ROW_HEADER_WIDTH = 48

export const LADDER_WIDTH = ROW_HEADER_WIDTH + CELL_WIDTH * COLUMN_NUM
