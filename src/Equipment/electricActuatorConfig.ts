import type { AxisUnitConfig } from '../Runtime/axisUnit'

//電動アクチュエータの軸仕様とポイントテーブル(現状は固定)。
//座標はモデルの初期位置(ステージがレール端側にある位置)を機械原点(0mm)とし、レール中央方向をプラスとする。
//ストロークはレール長(約500mm)からステージ長を引いた範囲に収まるよう250mmとしている
export const ELECTRIC_ACTUATOR_STROKE_MM = 250

export const electricActuatorAxisUnit: AxisUnitConfig = {
    axes: [
        {
            initialPosition: 100, //電源投入直後は原点から離れた位置にあり、原点復帰で原点(0mm)へ戻る
            homeSpeed: 50,
            homeAccel: 200,
            servoReadyMs: 300,
            points: {
                1: { position: 50, speed: 100, accel: 400 },
                2: { position: 100, speed: 100, accel: 400 },
                3: { position: 150, speed: 100, accel: 400 },
                4: { position: 200, speed: 100, accel: 400 },
                5: { position: 250, speed: 100, accel: 400 },
            },
        },
    ],
}
