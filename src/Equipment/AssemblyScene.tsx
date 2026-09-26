import { Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Color, Quaternion, Vector3, type Group, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { RuntimeContext, DeviceValueContext } from '../Runtime/RuntimeContext'
import { FactoryEnvironment, FACTORY_HALF_SIZE } from './FactoryEnvironment'
import { useIoSignals } from '../Runtime/useIoSignals'
import { type IoSignal } from '../Runtime/ioMap'

const MODEL_TARGET_SIZE = 6 //CADモデルの単位系(mm等)に関わらず、シーン内で見やすい最大辺長に正規化する
const STROKE_SPEED = 0.02 //ボタンストロークの追従速度(m/s相当)
const EMISSIVE_INTENSITY_ON = 1.5

//元モデルのマテリアルはmetallic/roughnessが既定値(共に1.0)のままエクスポートされており、
//環境マップなしのシンプルな平行光+環境光だけでは金属反射しか起きずCAD上の見た目より暗く沈む。
//塗装された樹脂/金属パーツに近い見た目になるよう明示的に上書きする
const MATERIAL_METALNESS = 0.3
const MATERIAL_ROUGHNESS = 0.5

type Axis = 'x' | 'y' | 'z'

type LightAssemblyConfig = {
  type: 'light'
  node: string //モデル内のアセンブリノード名(このJSONファイルが対応する部品)
  device: string //ONのとき発光させる出力デバイス
  color: string //点灯色(CSSカラー)
  target?: string //アセンブリ内で発光させる子ノード名。省略時は"light"
}

type Vector3Tuple = [number, number, number]

//ワーク対象の指定。1つなら"work"のように文字列、複数なら["work","work001"]のように配列で指定できる
type WorkNodes = string | string[]

function workNodeNames(workNodes: WorkNodes | undefined): string[] {
  if (workNodes === undefined) return ['work'];
  return Array.isArray(workNodes) ? workNodes : [workNodes];
}

type ButtonAssemblyConfig = {
  type: 'button'
  node: string
  device: string //クリック時にONにする入力デバイス
  //alternate:1回押すと次に押されるまで状態を保持する(押すたびにON/OFFが切り替わる)。省略時はalternate
  //momentary:押している間だけボタン部が光ってデバイスがONになり、離すと元に戻る
  mode?: 'alternate' | 'momentary'
  stroke: Vector3Tuple //押し込みの方向と量を表す3次元ベクトル(mm、ノードのローカル座標系)
  target?: string //アセンブリ内で可動させる子ノード名。省略時は"button"
}

type ComBairAssemblyConfig = {
  type: 'combair'
  node: string //コンベア本体のノード名(このノードのワールドバウンディングボックスとワークの接触を判定する)
  device: string //ONの間だけ速度ベクトルが有効になる出力デバイス
  work_node?: WorkNodes //搬送されるワークのノード名(複数可)。省略時は"work"
  velocity: Vector3Tuple //ワークに与える速度ベクトル(mm/s、このノードのローカル座標系)。ワークと接触している間だけ適用される
  contact_margin?: number //接触判定のバウンディングボックスに持たせる余裕(mm)。省略時はCOMBAIR_DEFAULT_CONTACT_MARGIN
  //ワークを搬送しなくなる(手放す)条件。省略時は"center"
  //center: ワーク中心がベルト範囲外に出たら手放す(横から押し出されるワークを、はみ出した後まで搬送し続けないようにするため)
  //clear: ワークがベルト範囲から完全に抜けるまで搬送し続ける(ベルト終端から落下させる場合に、端に引っかかった位置で落ちないようにするため)
  release?: 'center' | 'clear'
  //稼働中の目印としてベルトの周回軌道に沿って動かす子ノード名(任意)。deviceがONの間だけvelocityの大きさで周回する
  flag_targets?: string[]
  belt_target?: string //周回軌道の基準にするベルトの子ノード名。省略時は"belt"
}

type AirCylinderSensorConfig = {
  target?: string //シリンダー内のオートスイッチノード名
  device: string //検出時にONにする入力デバイス
}

type AirCylinderAssemblyConfig = {
  type: 'aircylinder'
  node: string //シリンダー本体のノード名
  device: string //ONでロッドを前進させる出力デバイス(ソレノイドバルブ想定)
  rod_target?: string //可動させる子ノード名。省略時は"rod"
  axis?: Axis //ストローク軸(このノードのローカル座標系)。省略時は"x"
  direction?: 1 | -1 //前進方向の符号。省略時は1
  stroke: number //ストローク量(mm)
  speed?: number //ストローク速度(mm/s)。省略時はAIRCYLINDER_DEFAULT_SPEED
  work_node?: WorkNodes //接触判定の対象になるワークのノード名(複数可)。省略時は"work"
  contact_margin?: number //ロッドの接触判定用バウンディングボックスに持たせる余裕(mm)。省略時はAIRCYLINDER_DEFAULT_CONTACT_MARGIN
  sensor_extended?: AirCylinderSensorConfig //前進端(ストローク上限)検出。target省略時は"autosensor1"
  sensor_retracted?: AirCylinderSensorConfig //後退端(ストローク下限)検出。target省略時は"autosensor2"
  //ロッド上に固定され、ロッドと一緒に動くべき他のアセンブリのノード名(このノードと同じ親を持つ兄弟ノードを想定)。
  //例: ロッド先端に取り付けられたエアチャック一式や、その接続用プレート
  carry_nodes?: string[]
}

type AirChuckSensorConfig = {
  target?: string //チャック内のオートスイッチノード名
  device: string //検出時にONにする入力デバイス
}

//type:"air_chuck" アセンブリ。deviceがONの間、左右フィンガー(finger_right/finger_left)を中心へ向けて閉じ、OFFで開く(平行グリッパー想定)。
//フィンガーはあくまで駆動源で、実際にワークを挟み込むのはフィンガーに固定されたチャックプレート(chuck_plate_right/left)側。
//そのためチャックプレート(および任意で付属のネジ等)はフィンガーの開閉量だけ追従して動かす(finger_right_carry/finger_left_carry)。
//ワークとの接触・把持はContactVelocityAssemblyが別途、チャックプレート(grip_right_target/grip_left_target)の実速度を見て処理する
type AirChuckAssemblyConfig = {
  type: 'air_chuck'
  node: string //チャック本体のアセンブリノード名
  device: string //ONでフィンガーを閉じる(グリップする)出力デバイス
  finger_right_target?: string //省略時は"finger_right"
  finger_left_target?: string //省略時は"finger_left"
  axis?: Axis //開閉方向の軸(このノードのローカル座標系)。省略時は"x"
  direction?: 1 | -1 //ON時にfinger_rightが動く方向の符号(finger_leftは常に逆符号で動く)。省略時は1
  stroke: number //片側フィンガーが中心へ向かって移動する量(mm)
  speed?: number //フィンガーの移動速度(mm/s)。省略時はAIRCYLINDER_DEFAULT_SPEED
  //finger_rightの開閉量(ローカル差分)だけ一緒に動かす兄弟ノード名(同じ親=このアセンブリノードを持つ想定)。
  //省略時は["chuck_plate_right","finger_right_screw_bottom","finger_right_screw_top"]
  finger_right_carry?: string[]
  //finger_leftの開閉量だけ一緒に動かす兄弟ノード名。省略時は["chuck_plate_left","finger_left_screw_bottom","finger_left_screw_top"]
  finger_left_carry?: string[]
  //ワークとの接触判定・把持速度の算出に使うノード名(実際にワークを挟み込む部品)。省略時は"chuck_plate_right"/"chuck_plate_left"
  grip_right_target?: string
  grip_left_target?: string
  work_node?: WorkNodes //把持対象のワークのノード名(複数可)。省略時は"work"
  contact_margin?: number //把持側ノードの接触判定用バウンディングボックスに持たせる余裕(mm)。省略時はAIRCYLINDER_DEFAULT_CONTACT_MARGIN
  sensor_open?: AirChuckSensorConfig //開端検出。target省略時は"autosensor_open"
  sensor_close?: AirChuckSensorConfig //閉端検出。target省略時は"autosensor_close"
}

//type:"gravity" アセンブリ。work_nodeがどの機器にも接触・把持されていない間、支え(床または他のワーク)の上面に
//達するまで一定速度で落下させる。床はfloor_nodeのうちワーク中心の真下(水平面X/Z)にあるものの中で最も高い上面、
//該当する床がなければワールドY=0(グリッド面)。他のワークとは水平面での重なりがあれば上に積み重なり、
//積まれたワークは下のワークの水平移動に追従する。重力の向きは常にこのシミュレータのワールド座標系の
//鉛直方向(Y軸負方向)固定であり、CAD側の座標系(Z-up等)やmodelRotationDegの補正回転には影響されない
type GravityAssemblyConfig = {
  type: 'gravity'
  work_node?: WorkNodes //対象ワークのノード名(複数可)。省略時は"work"
  speed?: number //自由落下速度(mm/s)。加速度ではなく一定速度モデル。省略時はGRAVITY_DEFAULT_SPEED
  floor_node?: string | string[] //落下を止める床/テーブル等のノード名(複数可)。省略時はワールドY=0
}

type ProximitySensorAssemblyConfig = {
  type: 'proximity_sensor'
  node: string //センサー本体のノード名
  device: string //検出時にONにする入力デバイス
  tip_target?: string //検出面の子ノード名。省略時は"tip"
  axis?: Axis //検出方向(法線)の軸(tipのローカル座標系)。省略時は"x"
  direction?: 1 | -1 //法線の正負どちら向きが検出方向か。省略時は1
  range: number //tipから法線方向の検出距離(mm)
  work_node?: WorkNodes //検出対象のワークのノード名(複数可。いずれか1つでも検出範囲にあればON)。省略時は"work"
}

type LightGateAssemblyConfig = {
  type: 'light_gate'
  emitter_node: string //投光器のノード名
  emitter_target?: string //投光器側の基準子ノード名。省略時は"center"
  receiver_node: string //受光器のノード名
  receiver_target?: string //受光器側の基準子ノード名。省略時は"center001"
  receiver_indicator_target?: string //deviceがONの間発光させる受光器側の子ノード名(任意)。省略時は"light"
  device: string //modeに応じてON/OFFする入力デバイス
  //出力モード。省略時は"dark_on"
  //dark_on: center間にワークが存在する(遮光している)ときON
  //light_on: center間にワークが存在しない(入光している)ときON
  mode?: 'dark_on' | 'light_on'
  beam_width?: number //center同士を結ぶ直線からこの距離(mm)以内なら検出とみなす。省略時はLIGHT_GATE_DEFAULT_BEAM_WIDTH
  work_node?: WorkNodes //検出対象のワークのノード名(複数可。いずれか1つでも検出範囲にあればON)。省略時は"work"
}

type AxisAssemblyConfig = {
  type: 'axis'
  axis_number?: number //位置決めユニットの軸番号(1~)。省略時は1
  nodes: string[] //軸の位置に合わせて一緒に動かすノード名(ステージ、ワークテーブル等)
  axis: Axis //ノードの親座標系での移動方向の軸
  direction?: 1 | -1 //軸座標のプラス方向がaxisのどちら向きか。省略時は1
}

export type AssemblyConfig =
  | LightAssemblyConfig
  | ButtonAssemblyConfig
  | ComBairAssemblyConfig
  | AirCylinderAssemblyConfig
  | AirChuckAssemblyConfig
  | GravityAssemblyConfig
  | ProximitySensorAssemblyConfig
  | LightGateAssemblyConfig
  | AxisAssemblyConfig

//model/<フォルダ名>/配下に置かれた*.json(アセンブリ単位の動作定義ファイル)を一括で収集する。
//Vite の import.meta.glob は静的なパターンしか解析できないため、モデルフォルダを追加してもこの1箇所の変更は不要
const assemblyConfigModules = import.meta.glob<AssemblyConfig>('./model/*/*.json', { eager: true, import: 'default' })

function getConfigsForModel(modelFolder: string): AssemblyConfig[] {
  const prefix = `./model/${modelFolder}/`
  return Object.entries(assemblyConfigModules)
    .filter(([path]) => path.startsWith(prefix))
    .map(([, config]) => config)
}

//I/O割付表に表示する部品種別の名前
const ASSEMBLY_TYPE_LABEL: Record<string, string> = {
  button: '押しボタン',
  light: 'ランプ',
  combair: 'コンベア',
  aircylinder: 'エアシリンダ',
  air_chuck: 'エアチャック',
  proximity_sensor: '近接センサ',
  light_gate: '光電センサ',
}

const SENSOR_LABEL: Record<string, string> = {
  sensor_extended: '前進端',
  sensor_retracted: '後退端',
  sensor_open: '開端',
  sensor_close: '閉端',
}

//動作定義から、部品が使う信号(デバイス)とその向きを集める。I/O割付表の行とKV連携時の読み書き対象になる
//(ボタン/センサーはアプリ→PLCへの入力、ランプ/シリンダー等の駆動はPLC→アプリへの出力)
function collectIoSignals(configs: AssemblyConfig[]): IoSignal[] {
  const signals: IoSignal[] = []
  for (const config of configs) {
    if (config.type === 'gravity' || config.type === 'axis') continue
    const typeLabel = ASSEMBLY_TYPE_LABEL[config.type] ?? config.type
    const node = config.type === 'light_gate' ? config.receiver_node : config.node
    const isInput = config.type === 'button' || config.type === 'proximity_sensor' || config.type === 'light_gate'
    signals.push({ device: config.device, direction: isInput ? 'input' : 'output', label: `${typeLabel} ${node}`, source: 'equipment' })
    if (config.type === 'aircylinder' || config.type === 'air_chuck') {
      for (const key of ['sensor_extended', 'sensor_retracted', 'sensor_open', 'sensor_close'] as const) {
        const sensor = (config as Partial<Record<typeof key, { device: string }>>)[key]
        if (sensor) signals.push({ device: sensor.device, direction: 'input', label: `${typeLabel} ${node} ${SENSOR_LABEL[key]}`, source: 'equipment' })
      }
    }
  }
  return signals
}

function DeviceLabel({ label }: { label: string }) {
  return (
    <Html position={[0, 0.03, 0]} center style={{ pointerEvents: 'none' }}>
      <div className="whitespace-nowrap rounded bg-gray-900/80 px-2 py-1 text-xs text-white">
        {label}
      </div>
    </Html>
  )
}

//type:"light" アセンブリ。対象子ノードのマテリアルを複製し、deviceがONの間だけ発光させる
function LightAssembly({ scene, config }: { scene: Group; config: LightAssemblyConfig }) {
  const deviceValue = useContext(DeviceValueContext);
  const deviceValueRef = useRef(deviceValue);
  deviceValueRef.current = deviceValue;
  const materialsRef = useRef<MeshStandardMaterial[] | null>(null);

  useEffect(() => {
    const assemblyNode = scene.getObjectByName(config.node);
    const targetNode = assemblyNode?.getObjectByName(config.target ?? 'light');
    if (!targetNode) return;
    const materials: MeshStandardMaterial[] = [];
    targetNode.traverse(child => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const cloned = (mesh.material as MeshStandardMaterial).clone();
      cloned.color = new Color(config.color);
      cloned.emissive = new Color(config.color);
      cloned.emissiveIntensity = 0;
      mesh.material = cloned;
      materials.push(cloned);
    });
    materialsRef.current = materials;
  }, [scene, config]);

  useFrame(() => {
    const materials = materialsRef.current;
    if (!materials) return;
    const intensity = deviceValueRef.current[config.device] ? EMISSIVE_INTENSITY_ON : 0;
    materials.forEach(mat => { mat.emissiveIntensity = intensity; });
  });

  return null;
}

//type:"button" アセンブリ。mode(省略時alternate)によって動作が異なる。
//alternate: OFF状態でクリックすると押し込みストローク→ボタン部発光→deviceONの順に遷移し、
//  ON状態でクリックすると消灯→復帰ストローク→deviceOFFの順に遷移する(1クリックで状態がトグルする押しボタン)。
//  アニメーション中(pressing/releasing)のクリックは無視する
//momentary: ボタンを押している間だけ、押し込み・ボタン部発光・deviceONとなり、離す(またはボタン上から外れる)と
//  消灯・deviceOFFとなって復帰ストロークする。押した瞬間・離した瞬間に即座に発光/デバイスを切り替える
function ButtonAssembly({ scene, config, resetToken }: { scene: Group; config: ButtonAssemblyConfig; resetToken: number }) {
  const { setInputDevice } = useContext(RuntimeContext);
  const groupRef = useRef<Group>(null);
  const attachedRef = useRef(false);
  const baseRef = useRef(new Vector3());
  const phaseRef = useRef<'off' | 'pressing' | 'on' | 'releasing'>('off');
  const heldRef = useRef(false); //momentary: 現在押されているか
  const materialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const [hovered, setHovered] = useState(false);
  const strokeVec = useMemo(() => new Vector3(...config.stroke).divideScalar(1000), [config.stroke]);
  const momentary = config.mode === 'momentary';

  //対象子ノードを自コンポーネント所有のグループへ付け替え、他の部品に影響を与えず単独でストロークさせる。
  //あわせてマテリアルを複製し、他のボタン/ランプに影響を与えず単独で発光強度を制御できるようにする
  useEffect(() => {
    if (attachedRef.current || !groupRef.current) return;
    const assemblyNode = scene.getObjectByName(config.node);
    const targetNode = assemblyNode?.getObjectByName(config.target ?? 'button');
    if (!targetNode) return;
    scene.updateMatrixWorld(true);

    const materials: MeshStandardMaterial[] = [];
    targetNode.traverse(child => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const cloned = (mesh.material as MeshStandardMaterial).clone();
      cloned.emissive = cloned.color.clone();
      cloned.emissiveIntensity = 0;
      mesh.material = cloned;
      materials.push(cloned);
    });
    materialsRef.current = materials;

    groupRef.current.attach(targetNode);
    baseRef.current.copy(groupRef.current.position);
    attachedRef.current = true;
  }, [scene, config]);

  //対象ノードはscene直下ではなく自コンポーネント所有のグループへ付け替え済みのため、
  //モデルリセット(resetToken変化)の通常経路では戻らない。ここで押し込み状態・位置・発光を明示的に戻す
  useEffect(() => {
    if (resetToken === 0 || !attachedRef.current || !groupRef.current) return;
    groupRef.current.position.copy(baseRef.current);
    phaseRef.current = 'off';
    heldRef.current = false;
    materialsRef.current?.forEach(mat => { mat.emissiveIntensity = 0; });
  }, [resetToken]);

  //現在位置をtargetへ向けてSTROKE_SPEEDで進め、到達したらtrueを返す
  const moveToward = (group: Group, target: Vector3, delta: number) => {
    const diff = target.clone().sub(group.position);
    const step = STROKE_SPEED * delta;
    if (diff.length() <= step) {
      group.position.copy(target);
      return true;
    }
    group.position.add(diff.normalize().multiplyScalar(step));
    return false;
  };

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const base = baseRef.current;

    if (momentary) {
      //押している間は押し込み位置へ、離したら元の位置へ戻す(発光/deviceはpress/releaseで即時に切り替え済み)
      moveToward(group, heldRef.current ? base.clone().add(strokeVec) : base, delta);
      return;
    }

    const phase = phaseRef.current;
    if (phase !== 'pressing' && phase !== 'releasing') return;
    const reached = moveToward(group, phase === 'pressing' ? base.clone().add(strokeVec) : base, delta);
    if (reached) {
      if (phase === 'pressing') {
        //押し切ったタイミングで発光とdeviceONを行う
        materialsRef.current?.forEach(mat => { mat.emissiveIntensity = EMISSIVE_INTENSITY_ON; });
        setInputDevice(config.device, true);
        phaseRef.current = 'on';
      } else {
        setInputDevice(config.device, false);
        phaseRef.current = 'off';
      }
    }
  });

  const handleClick = () => {
    if (phaseRef.current === 'off') {
      phaseRef.current = 'pressing';
    } else if (phaseRef.current === 'on') {
      //離す動作の開始と同時に消灯する(deviceOFFはストローク完了時)
      materialsRef.current?.forEach(mat => { mat.emissiveIntensity = 0; });
      phaseRef.current = 'releasing';
    }
  };

  const press = () => {
    if (heldRef.current) return;
    heldRef.current = true;
    materialsRef.current?.forEach(mat => { mat.emissiveIntensity = EMISSIVE_INTENSITY_ON; });
    setInputDevice(config.device, true);
  };

  const release = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    materialsRef.current?.forEach(mat => { mat.emissiveIntensity = 0; });
    setInputDevice(config.device, false);
  };

  return (
    <group
      ref={groupRef}
      onClick={e => { e.stopPropagation(); if (!momentary) handleClick(); }}
      onPointerDown={e => { if (!momentary) return; e.stopPropagation(); press(); }}
      onPointerUp={() => { if (momentary) release(); }}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => { setHovered(false); if (momentary) release(); }}
    >
      {hovered && <DeviceLabel label={`入力: ${config.device}`} />}
    </group>
  );
}

const AIRCYLINDER_DEFAULT_SPEED = 50 //mm/s
const AIRCYLINDER_DEFAULT_CONTACT_MARGIN = 20 //mm。CADの取り合い誤差を吸収できるよう余裕を持たせている
const COMBAIR_DEFAULT_CONTACT_MARGIN = 15 //mm
const LIGHT_GATE_DEFAULT_BEAM_WIDTH = 15 //mm
const GRAVITY_DEFAULT_SPEED = 200 //mm/s
const GRAVITY_FLOOR_EPSILON = 0.5 //mm。床に到達したとみなす許容誤差
const WORK_CONTACT_EPSILON = 0.1 //mm。ワーク同士の面が接しているだけ(めり込んではいない)とみなす許容誤差
const SENSOR_INDICATOR_COLOR = '#00ff40'

function axisVector(axis: Axis): Vector3 {
  return axis === 'x' ? new Vector3(1, 0, 0) : axis === 'y' ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
}

//対象ノード配下の全メッシュのマテリアルを複製し、発光色を仕込んだ状態で返す(他の部品に影響を与えず単独で発光強度を制御するため)
function cloneEmissiveMaterials(node: Object3D, color: string): MeshStandardMaterial[] {
  const materials: MeshStandardMaterial[] = [];
  node.traverse(child => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const cloned = (mesh.material as MeshStandardMaterial).clone();
    cloned.emissive = new Color(color);
    cloned.emissiveIntensity = 0;
    mesh.material = cloned;
    materials.push(cloned);
  });
  return materials;
}

//type:"aircylinder" アセンブリ。deviceがONの間ロッドを前進、OFFで後退させる。
//ストローク端に到達するとオートスイッチの各deviceをON/OFFする。
//ワークへの接触・押し出しはContactVelocityAssemblyが別途、ロッドの実速度を見て処理する
function AirCylinderAssembly({ scene, config }: { scene: Group; config: AirCylinderAssemblyConfig }) {
  const { setInputDevice } = useContext(RuntimeContext);
  const deviceValue = useContext(DeviceValueContext);
  const rodRef = useRef<Object3D | null>(null);
  const assemblyNodeRef = useRef<Object3D | null>(null);
  const baseRef = useRef(0);
  const sensorExtendedMaterialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const sensorRetractedMaterialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const carryNodesRef = useRef<{ node: Object3D, base: Vector3 }[]>([]);

  const axis = config.axis ?? 'x';
  const direction = config.direction ?? 1;
  const strokeM = config.stroke / 1000;
  const speedM = (config.speed ?? AIRCYLINDER_DEFAULT_SPEED) / 1000;

  useEffect(() => {
    const assemblyNode = scene.getObjectByName(config.node);
    const rod = assemblyNode?.getObjectByName(config.rod_target ?? 'rod');
    if (!assemblyNode || !rod) return;
    rodRef.current = rod;
    assemblyNodeRef.current = assemblyNode;
    baseRef.current = rod.position[axis];

    if (config.sensor_extended) {
      const node = assemblyNode.getObjectByName(config.sensor_extended.target ?? 'autosensor1');
      if (node) sensorExtendedMaterialsRef.current = cloneEmissiveMaterials(node, SENSOR_INDICATOR_COLOR);
    }
    if (config.sensor_retracted) {
      const node = assemblyNode.getObjectByName(config.sensor_retracted.target ?? 'autosensor2');
      if (node) sensorRetractedMaterialsRef.current = cloneEmissiveMaterials(node, SENSOR_INDICATOR_COLOR);
    }

    //carry_nodesはこのアセンブリノードと同じ親(sceneのトップレベル)を持つ兄弟ノードを想定しており、
    //その位置はロッドとは別の座標系(親のローカル座標系)で表現されているため、
    //ロッドの移動量をassemblyNodeの向き(親座標系に対する回転)で変換してから加算する
    carryNodesRef.current = (config.carry_nodes ?? [])
      .map(name => scene.getObjectByName(name))
      .filter((node): node is Object3D => !!node)
      .map(node => ({ node, base: node.position.clone() }));
  }, [scene, config, axis]);

  useFrame((_, delta) => {
    const rod = rodRef.current;
    const assemblyNode = assemblyNodeRef.current;
    if (!rod || !assemblyNode) return;
    const base = baseRef.current;
    const target = base + (deviceValue[config.device] ? direction * strokeM : 0);
    const current = rod.position[axis];
    const diff = target - current;
    const step = speedM * delta;
    rod.position[axis] = Math.abs(diff) <= step ? target : current + Math.sign(diff) * step;

    //ストローク端(前進端/後退端)に到達している間だけオートスイッチのdeviceをON
    //strokeが負の値(モデルの都合でaxisの正負を反転させたい場合)でも比率として正しく0~1になるよう、
    //0除算を避けるためのガードにはstrokeM > 0ではなくstrokeM !== 0を使う
    const progress = strokeM !== 0 ? ((rod.position[axis] - base) * direction) / strokeM : 0;
    const extendedOn = progress >= 0.98;
    const retractedOn = progress <= 0.02;
    //RUN開始/停止でデバイス値が全てOFFにリセットされるため、状態が変化したときだけでなく毎フレーム現在の状態を書き込む
    //(値が変わらなければsetInputDevice側で無視される)
    if (config.sensor_extended) setInputDevice(config.sensor_extended.device, extendedOn);
    if (config.sensor_retracted) setInputDevice(config.sensor_retracted.device, retractedOn);
    sensorExtendedMaterialsRef.current?.forEach(mat => { mat.emissiveIntensity = extendedOn ? EMISSIVE_INTENSITY_ON : 0; });
    sensorRetractedMaterialsRef.current?.forEach(mat => { mat.emissiveIntensity = retractedOn ? EMISSIVE_INTENSITY_ON : 0; });

    if (carryNodesRef.current.length > 0) {
      const deltaInAssemblyFrame = axisVector(axis).multiplyScalar(rod.position[axis] - base);
      const deltaInParentFrame = deltaInAssemblyFrame.applyQuaternion(assemblyNode.quaternion);
      carryNodesRef.current.forEach(({ node, base: carryBase }) => {
        node.position.copy(carryBase).add(deltaInParentFrame);
      });
    }
  });

  return null;
}

const AIR_CHUCK_DEFAULT_RIGHT_CARRY = ['chuck_plate_right', 'finger_right_screw_bottom', 'finger_right_screw_top']
const AIR_CHUCK_DEFAULT_LEFT_CARRY = ['chuck_plate_left', 'finger_left_screw_bottom', 'finger_left_screw_top']

//type:"air_chuck" アセンブリ。deviceがONの間、finger_right/finger_leftを中心へ向けて閉じ、OFFで開く。
//finger_right/finger_leftの開閉量(基準位置からの差分)だけ、それぞれに紐づくcarryノード(チャックプレート等、
//同じ親を持つ兄弟ノード)も一緒に動かす。ストローク端に到達するとオートスイッチの各deviceをON/OFFする。
//ワークとの接触・把持はContactVelocityAssemblyが別途、チャックプレート(grip_right/left_target)の実速度を見て処理する
function AirChuckAssembly({ scene, config }: { scene: Group; config: AirChuckAssemblyConfig }) {
  const { setInputDevice } = useContext(RuntimeContext);
  const deviceValue = useContext(DeviceValueContext);
  const fingerRightRef = useRef<Object3D | null>(null);
  const fingerLeftRef = useRef<Object3D | null>(null);
  const baseRightRef = useRef(0);
  const baseLeftRef = useRef(0);
  const rightCarryRef = useRef<{ node: Object3D, base: Vector3 }[]>([]);
  const leftCarryRef = useRef<{ node: Object3D, base: Vector3 }[]>([]);
  const sensorOpenMaterialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const sensorCloseMaterialsRef = useRef<MeshStandardMaterial[] | null>(null);

  const axis = config.axis ?? 'x';
  const direction = config.direction ?? 1;
  const strokeM = config.stroke / 1000;
  const speedM = (config.speed ?? AIRCYLINDER_DEFAULT_SPEED) / 1000;

  useEffect(() => {
    const assemblyNode = scene.getObjectByName(config.node);
    const fingerRight = assemblyNode?.getObjectByName(config.finger_right_target ?? 'finger_right');
    const fingerLeft = assemblyNode?.getObjectByName(config.finger_left_target ?? 'finger_left');
    if (!assemblyNode || !fingerRight || !fingerLeft) return;
    fingerRightRef.current = fingerRight;
    fingerLeftRef.current = fingerLeft;
    baseRightRef.current = fingerRight.position[axis];
    baseLeftRef.current = fingerLeft.position[axis];

    //finger_right/finger_leftと同じ親(assemblyNode)を持つ兄弟ノードなので、
    //ローカル差分をそのまま(回転変換なしで)加算すればよい
    rightCarryRef.current = (config.finger_right_carry ?? AIR_CHUCK_DEFAULT_RIGHT_CARRY)
      .map(name => assemblyNode.getObjectByName(name))
      .filter((node): node is Object3D => !!node)
      .map(node => ({ node, base: node.position.clone() }));
    leftCarryRef.current = (config.finger_left_carry ?? AIR_CHUCK_DEFAULT_LEFT_CARRY)
      .map(name => assemblyNode.getObjectByName(name))
      .filter((node): node is Object3D => !!node)
      .map(node => ({ node, base: node.position.clone() }));

    if (config.sensor_open) {
      const node = assemblyNode.getObjectByName(config.sensor_open.target ?? 'autosensor_open');
      if (node) sensorOpenMaterialsRef.current = cloneEmissiveMaterials(node, SENSOR_INDICATOR_COLOR);
    }
    if (config.sensor_close) {
      const node = assemblyNode.getObjectByName(config.sensor_close.target ?? 'autosensor_close');
      if (node) sensorCloseMaterialsRef.current = cloneEmissiveMaterials(node, SENSOR_INDICATOR_COLOR);
    }
  }, [scene, config, axis]);

  useFrame((_, delta) => {
    const fingerRight = fingerRightRef.current;
    const fingerLeft = fingerLeftRef.current;
    if (!fingerRight || !fingerLeft) return;
    const closing = !!deviceValue[config.device];
    const step = speedM * delta;

    //finger_right/finger_leftは常に逆符号で動かし、中心へ向けて閉じる/離れて開くを表現する
    const targetRight = baseRightRef.current + (closing ? -direction * strokeM : 0);
    const currentRight = fingerRight.position[axis];
    const diffRight = targetRight - currentRight;
    fingerRight.position[axis] = Math.abs(diffRight) <= step ? targetRight : currentRight + Math.sign(diffRight) * step;

    const targetLeft = baseLeftRef.current + (closing ? direction * strokeM : 0);
    const currentLeft = fingerLeft.position[axis];
    const diffLeft = targetLeft - currentLeft;
    fingerLeft.position[axis] = Math.abs(diffLeft) <= step ? targetLeft : currentLeft + Math.sign(diffLeft) * step;

    //チャックプレート等、各フィンガーに追従すべきノードを基準位置からの差分だけ動かす
    const rightDelta = fingerRight.position[axis] - baseRightRef.current;
    rightCarryRef.current.forEach(({ node, base }) => { node.position[axis] = base[axis] + rightDelta; });
    const leftDelta = fingerLeft.position[axis] - baseLeftRef.current;
    leftCarryRef.current.forEach(({ node, base }) => { node.position[axis] = base[axis] + leftDelta; });

    //ストローク端(全開/全閉)に到達している間だけオートスイッチのdeviceをON
    //(axisの正負をモデルの都合で反転させたい場合にstrokeを負の値にしても比率が正しく0~1になるようMath.absで揃える)
    const progress = strokeM !== 0 ? Math.abs(fingerRight.position[axis] - baseRightRef.current) / Math.abs(strokeM) : 0;
    const closedOn = progress >= 0.98;
    const openOn = progress <= 0.02;
    if (config.sensor_close) setInputDevice(config.sensor_close.device, closedOn);
    if (config.sensor_open) setInputDevice(config.sensor_open.device, openOn);
    sensorCloseMaterialsRef.current?.forEach(mat => { mat.emissiveIntensity = closedOn ? EMISSIVE_INTENSITY_ON : 0; });
    sensorOpenMaterialsRef.current?.forEach(mat => { mat.emissiveIntensity = openOn ? EMISSIVE_INTENSITY_ON : 0; });
  });

  return null;
}

//type:"proximity_sensor" アセンブリ。tipより法線方向(axis×direction)側にあり、かつtip中心からの距離がrange(mm)以内にワークがあればdeviceをON
function ProximitySensorAssembly({ scene, config }: { scene: Group; config: ProximitySensorAssemblyConfig }) {
  const { setInputDevice } = useContext(RuntimeContext);
  const tipRef = useRef<Object3D | null>(null);
  const worksRef = useRef<Object3D[]>([]);
  const materialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const axis = config.axis ?? 'x';
  const direction = config.direction ?? 1;
  const rangeM = config.range / 1000;

  useEffect(() => {
    const assemblyNode = scene.getObjectByName(config.node);
    const tip = assemblyNode?.getObjectByName(config.tip_target ?? 'tip');
    const works = workNodeNames(config.work_node)
      .map(name => scene.getObjectByName(name))
      .filter((node): node is Object3D => !!node);
    if (!tip || works.length === 0) return;
    tipRef.current = tip;
    worksRef.current = works;
    materialsRef.current = cloneEmissiveMaterials(tip, SENSOR_INDICATOR_COLOR);
  }, [scene, config]);

  useFrame(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const tipPos = new Vector3();
    tip.getWorldPosition(tipPos);
    const tipQuat = new Quaternion();
    tip.getWorldQuaternion(tipQuat);
    const normal = axisVector(axis).applyQuaternion(tipQuat).multiplyScalar(direction);
    const detected = worksRef.current.some(work => {
      const workPos = new Vector3();
      work.getWorldPosition(workPos);
      const toWork = workPos.sub(tipPos);
      return toWork.dot(normal) >= 0 && toWork.length() <= rangeM;
    });
    setInputDevice(config.device, detected); //RUN開始/停止でのリセットに追従するため毎フレーム書き込む
    materialsRef.current?.forEach(mat => { mat.emissiveIntensity = detected ? EMISSIVE_INTENSITY_ON : 0; });
  });

  return null;
}

//type:"light_gate" アセンブリ。投光器/受光器それぞれの基準ノードを結ぶ線分上(beam_widthの範囲内)にワークがあるか(遮光)を判定し、
//mode(dark_on:遮光時ON / light_on:入光時ON)に応じてdeviceをON/OFFする。受光器の表示灯はdeviceの出力状態に合わせて点灯する
function LightGateAssembly({ scene, config }: { scene: Group; config: LightGateAssemblyConfig }) {
  const { setInputDevice } = useContext(RuntimeContext);
  const emitterTargetRef = useRef<Object3D | null>(null);
  const receiverTargetRef = useRef<Object3D | null>(null);
  const worksRef = useRef<Object3D[]>([]);
  const materialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const beamWidthM = (config.beam_width ?? LIGHT_GATE_DEFAULT_BEAM_WIDTH) / 1000;

  useEffect(() => {
    const emitterAssembly = scene.getObjectByName(config.emitter_node);
    const receiverAssembly = scene.getObjectByName(config.receiver_node);
    const emitterTarget = emitterAssembly?.getObjectByName(config.emitter_target ?? 'center');
    const receiverTarget = receiverAssembly?.getObjectByName(config.receiver_target ?? 'center001');
    const works = workNodeNames(config.work_node)
      .map(name => scene.getObjectByName(name))
      .filter((node): node is Object3D => !!node);
    if (!emitterTarget || !receiverTarget || works.length === 0) return;
    emitterTargetRef.current = emitterTarget;
    receiverTargetRef.current = receiverTarget;
    worksRef.current = works;
    const indicator = receiverAssembly?.getObjectByName(config.receiver_indicator_target ?? 'light');
    if (indicator) materialsRef.current = cloneEmissiveMaterials(indicator, SENSOR_INDICATOR_COLOR);
  }, [scene, config]);

  useFrame(() => {
    const emitterTarget = emitterTargetRef.current;
    const receiverTarget = receiverTargetRef.current;
    if (!emitterTarget || !receiverTarget) return;
    const from = new Vector3();
    emitterTarget.getWorldPosition(from);
    const to = new Vector3();
    receiverTarget.getWorldPosition(to);
    const beam = to.clone().sub(from);
    const beamLength = beam.length();
    const beamDir = beam.clone().normalize();
    const detected = worksRef.current.some(work => {
      const workPos = new Box3().setFromObject(work).getCenter(new Vector3());
      const toWork = workPos.sub(from);
      const t = toWork.dot(beamDir);
      const lateral = toWork.clone().sub(beamDir.clone().multiplyScalar(t)).length();
      return t >= 0 && t <= beamLength && lateral <= beamWidthM;
    });
    const output = config.mode === 'light_on' ? !detected : detected;
    setInputDevice(config.device, output); //RUN開始/停止でのリセットに追従するため毎フレーム書き込む
    materialsRef.current?.forEach(mat => { mat.emissiveIntensity = output ? EMISSIVE_INTENSITY_ON : 0; });
  });

  return null;
}

//type:"axis" アセンブリ。位置決めユニット(RuntimeProviderの軸ユニット)が持つ軸の現在位置(mm)に合わせて、
//nodesに指定した部品を一緒に動かす。位置決めユニットの動作そのものはラダー(R/専用命令)側で決まる
function AxisAssembly({ scene, config }: { scene: Group; config: AxisAssemblyConfig }) {
  const { axisPositionsRef } = useContext(RuntimeContext);
  const nodesRef = useRef<{ node: Object3D, base: number }[]>([]);
  const direction = config.direction ?? 1;

  //clonedSceneはマウントごとに複製されるため、ここで取った初期位置を基準にしてよい
  useEffect(() => {
    nodesRef.current = config.nodes
      .map(name => scene.getObjectByName(name))
      .filter((node): node is Object3D => !!node)
      .map(node => ({ node, base: node.position[config.axis] }));
  }, [scene, config]);

  useFrame(() => {
    const positionM = (axisPositionsRef.current[(config.axis_number ?? 1) - 1] ?? 0) / 1000;
    nodesRef.current.forEach(({ node, base }) => {
      node.position[config.axis] = base + direction * positionM;
    });
  });

  return null;
}

//combairのflag_targets。ベルト(belt_target)の周回軌道(上下の直線部+両端プーリーの半円からなる長円)に沿って、
//deviceがONの間だけflagをvelocityの大きさ(mm/s)で周回させ、コンベアが稼働中であることを視認できるようにする。
//軌道はこのアセンブリノードのローカル座標系で求める:
//  ・進行方向 = velocityの向き、上方向 = flagの初期位置がベルト中心からずれている軸(ベルト表面に貼られている側)
//  ・プーリー半径 = ベルトの上方向の厚みの半分、直線部の長さ = 進行方向の長さ - 両端のプーリー半径
//プーリー部を回る間はflagの向きもベルト面に沿って回転させる。
//flagはこのアセンブリノードの直下の子ノードであることを前提とする(位置・回転をアセンブリノードのローカル座標系で直接書き換えるため)
type BeltFlag = {
  node: Object3D
  s0: number //初期位置の軌道上の弧長(上面直線部の後端を0とする)
  offsetW: number //幅方向(軌道面の法線方向)の位置。周回中も一定
  radius: number //軌道の半径(ベルト中心からflagまでの上方向の距離)
  baseQuat: Quaternion
}

function BeltFlagAssembly({ scene, config, resetToken }: { scene: Group; config: ComBairAssemblyConfig; resetToken: number }) {
  const deviceValue = useContext(DeviceValueContext);
  const flagsRef = useRef<BeltFlag[]>([]);
  const trackRef = useRef<{ center: Vector3, dirU: Vector3, dirV: Vector3, dirW: Vector3, halfLength: number } | null>(null);
  const distanceRef = useRef(0); //周回開始からの累積移動距離(m)
  const speedM = new Vector3(...config.velocity).length() / 1000;

  useEffect(() => {
    const assemblyNode = scene.getObjectByName(config.node);
    const belt = assemblyNode?.getObjectByName(config.belt_target ?? 'belt');
    if (!assemblyNode || !belt) return;
    const flagNodes = (config.flag_targets ?? [])
      .map(name => assemblyNode.getObjectByName(name))
      .filter((node): node is Object3D => !!node);
    if (flagNodes.length === 0) return;

    //ベルトのバウンディングボックスをアセンブリノードのローカル座標系に変換する(CAD由来の軸平行な配置を想定)
    scene.updateMatrixWorld(true);
    const beltBox = new Box3().setFromObject(belt).applyMatrix4(assemblyNode.matrixWorld.clone().invert());
    const center = beltBox.getCenter(new Vector3());
    const size = beltBox.getSize(new Vector3());

    const dirU = new Vector3(...config.velocity).normalize();
    //進行方向以外の2軸のうち、flagがベルト中心から最も大きくずれている軸を上方向(flagが貼られている表面側)とする
    const axes: Axis[] = ['x', 'y', 'z'];
    const uAxis = axes.reduce((a, b) => Math.abs(dirU[a]) >= Math.abs(dirU[b]) ? a : b);
    const offsetOn = (axis: Axis) => flagNodes.reduce((sum, node) => sum + (node.position[axis] - center[axis]), 0);
    const vAxis = axes.filter(a => a !== uAxis).reduce((a, b) => Math.abs(offsetOn(a)) >= Math.abs(offsetOn(b)) ? a : b);
    const dirV = axisVector(vAxis).multiplyScalar(Math.sign(offsetOn(vAxis)) || 1);
    const dirW = new Vector3().crossVectors(dirV, dirU); //プーリー部を回るときの回転軸(上方向→進行方向へ倒れる向き)
    const beltRadius = size[vAxis] / 2;
    const halfLength = Math.max(0, size[uAxis] / 2 - beltRadius);
    trackRef.current = { center, dirU, dirV, dirW, halfLength };

    //各flagの初期位置を軌道上の弧長に換算しておく(以降はこの弧長に累積移動距離を足して位置を求める)
    flagsRef.current = flagNodes.map(node => {
      const rel = node.position.clone().sub(center);
      const u = rel.dot(dirU), v = rel.dot(dirV);
      const L = halfLength;
      let s0: number, radius: number;
      if (Math.abs(u) <= L) {
        radius = Math.abs(v);
        s0 = v >= 0 ? u + L : 2 * L + Math.PI * radius + (L - u);
      } else if (u > L) {
        radius = Math.hypot(u - L, v);
        s0 = 2 * L + Math.atan2(u - L, v) * radius;
      } else {
        radius = Math.hypot(u + L, v);
        s0 = 4 * L + Math.PI * radius + Math.atan2(-(u + L), -v) * radius;
      }
      return { node, s0, offsetW: rel.dot(dirW), radius, baseQuat: node.quaternion.clone() };
    });
  }, [scene, config]);

  //モデルリセット時は位置だけでなく回転・周回距離も初期状態に戻す
  useEffect(() => {
    if (resetToken === 0) return;
    distanceRef.current = 0;
    flagsRef.current.forEach(flag => flag.node.quaternion.copy(flag.baseQuat));
  }, [resetToken]);

  useFrame((_, delta) => {
    const track = trackRef.current;
    if (!track) return;
    if (deviceValue[config.device]) distanceRef.current += speedM * delta;
    const { center, dirU, dirV, dirW, halfLength: L } = track;
    flagsRef.current.forEach(flag => {
      const r = flag.radius;
      const perimeter = 4 * L + 2 * Math.PI * r;
      if (perimeter <= 0) return;
      const s = (((flag.s0 + distanceRef.current) % perimeter) + perimeter) % perimeter;
      //上面直線部 → 前端プーリー → 下面直線部 → 後端プーリー の順に周回する
      let u: number, v: number, angle: number;
      if (s < 2 * L) {
        u = -L + s; v = r; angle = 0;
      } else if (s < 2 * L + Math.PI * r) {
        const phi = (s - 2 * L) / r;
        u = L + r * Math.sin(phi); v = r * Math.cos(phi); angle = phi;
      } else if (s < 4 * L + Math.PI * r) {
        u = L - (s - 2 * L - Math.PI * r); v = -r; angle = Math.PI;
      } else {
        const phi = (s - 4 * L - Math.PI * r) / r;
        u = -L - r * Math.sin(phi); v = -r * Math.cos(phi); angle = Math.PI + phi;
      }
      flag.node.position.copy(center)
        .addScaledVector(dirU, u)
        .addScaledVector(dirV, v)
        .addScaledVector(dirW, flag.offsetW);
      flag.node.quaternion.setFromAxisAngle(dirW, angle).multiply(flag.baseQuat);
    });
  });

  return null;
}

//ワークとの接触判定を持つ機器(combair/aircylinder/air_chuck/gravity)と、ワーク同士の接触を1箇所にまとめて扱う。
//毎フレーム、エアシリンダー・エアチャックはワールドバウンディングボックス同士の交差、コンベアはワーク中心がベルト範囲内にあることで「接触」とみなし、
//接触している機器の速度ベクトル(ワールド座標)をワークの速度ベクトルへ加算する(複数機器が同時に接触していれば合成される)。
//どの機器とも接触していなければワークの速度ベクトルは(0,0,0)になり、その場に静止する(gravity指定があれば落下する)。
//ワークが複数ある場合、ワーク同士は互いにめり込まない剛体として扱う:
//  ・進行方向に他のワークがあれば押し出す(連鎖的に押し出せる。押し出せない分は移動量を切り詰める)
//  ・落下中のワークは下にあるワーク(水平面で重なりがあるもの)の上面で止まり、積み重なる
//  ・積み重なったワークは、下のワークがそのフレームに実際に水平移動した量だけ一緒に動く
function ContactVelocityAssembly({ scene, configs, resetToken }: { scene: Group; configs: AssemblyConfig[]; resetToken: number }) {
  const deviceValue = useContext(DeviceValueContext);
  const combairConfigs = useMemo(() => configs.filter((c): c is ComBairAssemblyConfig => c.type === 'combair'), [configs]);
  const aircylinderConfigs = useMemo(() => configs.filter((c): c is AirCylinderAssemblyConfig => c.type === 'aircylinder'), [configs]);
  const airChuckConfigs = useMemo(() => configs.filter((c): c is AirChuckAssemblyConfig => c.type === 'air_chuck'), [configs]);
  const gravityConfigs = useMemo(() => configs.filter((c): c is GravityAssemblyConfig => c.type === 'gravity'), [configs]);
  const workNames = useMemo(() => {
    const names = new Set<string>();
    [...combairConfigs, ...aircylinderConfigs, ...airChuckConfigs, ...gravityConfigs]
      .forEach(c => workNodeNames(c.work_node).forEach(name => names.add(name)));
    return Array.from(names);
  }, [combairConfigs, aircylinderConfigs, airChuckConfigs, gravityConfigs]);

  //combairは静止した設備なので、接触判定用ワールドバウンディングボックスは初回に1度だけ計算してキャッシュする
  const combairBoxesRef = useRef<Map<ComBairAssemblyConfig, Box3>>(new Map());
  //floor_node(重力で落下する際の床)のワールドバウンディングボックスを機器ごとにキャッシュする
  const floorBoxesRef = useRef<Map<GravityAssemblyConfig, Box3[]>>(new Map());
  //rodは毎フレーム動くため、実速度を有限差分(前フレームとの位置差)から求めるための直前ワールド座標を機器ごとに保持する
  const rodPrevWorldPosRef = useRef<Map<AirCylinderAssemblyConfig, Vector3>>(new Map());
  //エアチャックのフィンガーも同様に、左右それぞれの直前ワールド座標を保持する
  const chuckPrevWorldPosRef = useRef<Map<AirChuckAssemblyConfig, { right: Vector3, left: Vector3 }>>(new Map());
  //sceneはAssemblyModelScene側の<group scale={scale}>に包まれているため、getWorldPosition/setFromObjectで得られる
  //座標・サイズはモデル本来の単位(mm起算のメートル値)をscale倍したワールド座標系になっている。
  //一方work.positionはscaleが掛からない(sceneの子である)ローカル座標系の値なので、
  //ワールド座標同士の差分(ロッドの実速度)やmm単位の設定値(接触マージン)をそのまま混在させると、
  //scale倍だけ実際の設定値からズレる(margin不足で接触がすぐ途切れたり、速度がscale倍速くなったりする)。
  //そのためscene自身のワールドスケールを求め、変換時に必ず割り戻す/掛け直す
  const worldScaleRef = useRef(1);
  const dbgKeyRef = useRef<Map<string, string>>(new Map()); //DEBUG

  useEffect(() => {
    scene.updateMatrixWorld(true);
    const worldScale = scene.getWorldScale(new Vector3()).x;
    worldScaleRef.current = worldScale;

    const boxes = new Map<ComBairAssemblyConfig, Box3>();
    combairConfigs.forEach(config => {
      const node = scene.getObjectByName(config.node);
      if (!node) return;
      const margin = ((config.contact_margin ?? COMBAIR_DEFAULT_CONTACT_MARGIN) / 1000) * worldScale;
      boxes.set(config, new Box3().setFromObject(node).expandByScalar(margin));
    });
    combairBoxesRef.current = boxes;

    //floor_nodeは静止した設備(テーブル等)なので、床のワールドバウンディングボックスも初回に1度だけ計算してキャッシュする。
    //floor_node省略時(または該当する床がワーク中心の真下にない場合)はワールドY=0(グリッド面。AssemblyModelSceneがモデル最下部をここに合わせている)を床とみなす
    const floors = new Map<GravityAssemblyConfig, Box3[]>();
    gravityConfigs.forEach(config => {
      const names = config.floor_node === undefined ? [] : Array.isArray(config.floor_node) ? config.floor_node : [config.floor_node];
      floors.set(config, names
        .map(name => scene.getObjectByName(name))
        .filter((node): node is Object3D => !!node)
        .map(node => new Box3().setFromObject(node)));
    });
    floorBoxesRef.current = floors;
  }, [scene, combairConfigs, gravityConfigs]);

  //rodの直前ワールド座標をリセットする(モデルリセット直後に古い座標との差分を実速度と誤認しないようにするため)
  useEffect(() => {
    scene.updateMatrixWorld(true);
    const prevPos = new Map<AirCylinderAssemblyConfig, Vector3>();
    aircylinderConfigs.forEach(config => {
      const assemblyNode = scene.getObjectByName(config.node);
      const rod = assemblyNode?.getObjectByName(config.rod_target ?? 'rod');
      if (!rod) return;
      const p = new Vector3();
      rod.getWorldPosition(p);
      prevPos.set(config, p);
    });
    rodPrevWorldPosRef.current = prevPos;
  }, [scene, aircylinderConfigs, resetToken]);

  //チャックプレート(把持側ノード)の直前ワールド座標も同様にリセットする
  useEffect(() => {
    scene.updateMatrixWorld(true);
    const prevPos = new Map<AirChuckAssemblyConfig, { right: Vector3, left: Vector3 }>();
    airChuckConfigs.forEach(config => {
      const assemblyNode = scene.getObjectByName(config.node);
      const gripRight = assemblyNode?.getObjectByName(config.grip_right_target ?? 'chuck_plate_right');
      const gripLeft = assemblyNode?.getObjectByName(config.grip_left_target ?? 'chuck_plate_left');
      if (!gripRight || !gripLeft) return;
      const right = new Vector3();
      gripRight.getWorldPosition(right);
      const left = new Vector3();
      gripLeft.getWorldPosition(left);
      prevPos.set(config, { right, left });
    });
    chuckPrevWorldPosRef.current = prevPos;
  }, [scene, airChuckConfigs, resetToken]);

  useFrame((_, delta) => {
    if (delta <= 0) return;
    const worldScale = worldScaleRef.current;
    const targets = (c: { work_node?: WorkNodes }, workName: string) => workNodeNames(c.work_node).includes(workName);

    //rod: 実際の移動量(ワールド座標の有限差分)から実速度を求める。ワールド座標はscale倍されているため、
    //work.positionと同じローカル単位に戻すためworldScaleで割る。
    //ロッドの実速度・接触判定用ボックスはワークに依らないため、ワークごとではなくフレームにつき1回だけ求める
    //(ワークごとに求めると、2つ目以降のワークでは直前座標が更新済みになっており速度0と誤判定してしまう)
    const rods = aircylinderConfigs.flatMap(config => {
      const assemblyNode = scene.getObjectByName(config.node);
      const rod = assemblyNode?.getObjectByName(config.rod_target ?? 'rod');
      if (!rod) return [];
      const currentPos = new Vector3();
      rod.getWorldPosition(currentPos);
      const prevPos = rodPrevWorldPosRef.current.get(config) ?? currentPos.clone();
      const velocity = currentPos.clone().sub(prevPos).divideScalar(delta).divideScalar(worldScale);
      rodPrevWorldPosRef.current.set(config, currentPos.clone());
      const margin = ((config.contact_margin ?? AIRCYLINDER_DEFAULT_CONTACT_MARGIN) / 1000) * worldScale;
      return [{ config, velocity, box: new Box3().setFromObject(rod).expandByScalar(margin) }];
    });

    //air_chuck: 実際にワークを挟み込むのはフィンガーではなくチャックプレート側(フィンガーの開閉に追従して動く)。
    //ロッドと同様に、左右それぞれの実速度・接触判定用ボックスをフレームにつき1回だけ求める
    const chucks = airChuckConfigs.flatMap(config => {
      const assemblyNode = scene.getObjectByName(config.node);
      const gripRight = assemblyNode?.getObjectByName(config.grip_right_target ?? 'chuck_plate_right');
      const gripLeft = assemblyNode?.getObjectByName(config.grip_left_target ?? 'chuck_plate_left');
      if (!gripRight || !gripLeft) return [];
      const prev = chuckPrevWorldPosRef.current.get(config);
      const currentRight = new Vector3();
      gripRight.getWorldPosition(currentRight);
      const currentLeft = new Vector3();
      gripLeft.getWorldPosition(currentLeft);
      const prevRight = prev?.right ?? currentRight.clone();
      const prevLeft = prev?.left ?? currentLeft.clone();
      chuckPrevWorldPosRef.current.set(config, { right: currentRight.clone(), left: currentLeft.clone() });
      const margin = ((config.contact_margin ?? AIRCYLINDER_DEFAULT_CONTACT_MARGIN) / 1000) * worldScale;
      return [{
        config,
        rightVelocity: currentRight.clone().sub(prevRight).divideScalar(delta).divideScalar(worldScale),
        leftVelocity: currentLeft.clone().sub(prevLeft).divideScalar(delta).divideScalar(worldScale),
        rightBox: new Box3().setFromObject(gripRight).expandByScalar(margin),
        leftBox: new Box3().setFromObject(gripLeft).expandByScalar(margin),
      }];
    });

    //下にあるワークから順に処理する(積み重なったワークが、同じフレームで下のワークが実際に動いた量に追従できるようにするため)。
    //moved: このフレームにワールド座標で実際に動いた量(他のワークに押し出された分も含む)
    const works = workNames
      .map(name => ({ name, node: scene.getObjectByName(name) }))
      .filter((w): w is { name: string, node: Object3D } => !!w.node)
      .map(w => ({ ...w, box: new Box3().setFromObject(w.node), moved: new Vector3() }))
      .sort((a, b) => a.box.min.y - b.box.min.y);

    const contactEpsilon = (WORK_CONTACT_EPSILON / 1000) * worldScale;
    const floorEpsilon = (GRAVITY_FLOOR_EPSILON / 1000) * worldScale;
    //面同士がちょうど接している(積まれている・隣り合っている)状態は重なりとみなさないよう、許容誤差分だけ内側で判定する
    const overlapsOn = (a: Box3, b: Box3, axis: Axis) => a.min[axis] < b.max[axis] - contactEpsilon && a.max[axis] > b.min[axis] + contactEpsilon;

    //gravity指定のあるワークについて、ワーク中心の真下にある床(floor_node)のうち、ワーク下面以下で最も高い上面のY座標を返す。
    //該当する床がなければワールドY=0。gravity指定がなければ床は無い(-Infinity)
    const floorTopOf = (i: number) => {
      const { name, box } = works[i];
      const gravity = gravityConfigs.filter(c => targets(c, name));
      if (gravity.length === 0) return -Infinity;
      const center = box.getCenter(new Vector3());
      let top = -Infinity;
      gravity.forEach(config => (floorBoxesRef.current.get(config) ?? []).forEach(floor => {
        const under = center.x >= floor.min.x && center.x <= floor.max.x && center.z >= floor.min.z && center.z <= floor.max.z;
        if (under && floor.max.y <= box.min.y + floorEpsilon) top = Math.max(top, floor.max.y);
      }));
      return top === -Infinity ? 0 : top;
    };

    //床と、下にある他のワーク(水平面で重なりがあるもの)のうち最も高い上面を「支え」として返す。indexは支えがワークの場合のみ有効
    const supportOf = (i: number) => {
      const box = works[i].box;
      let top = floorTopOf(i);
      let index = -1;
      works.forEach((other, j) => {
        if (j === i) return;
        if (!overlapsOn(box, other.box, 'x') || !overlapsOn(box, other.box, 'z')) return;
        if (other.box.max.y <= box.min.y + floorEpsilon && other.box.max.y > top) {
          top = other.box.max.y;
          index = j;
        }
      });
      return { top, index };
    };

    //ワークiをaxis方向にamount(ワールド座標)だけ動かし、実際に動いた量を返す。
    //進行方向にある他のワークは押し出し(連鎖可)、押し出しきれない分だけ移動量を切り詰める。
    //下向きに押し出される場合は床より下には沈ませない。visitedは押し出しの連鎖が循環しないようにするためのもの
    const moveWork = (i: number, axis: Axis, amount: number, visited: Set<number>): number => {
      const box = works[i].box;
      if (axis === 'y' && amount < 0) {
        const floorTop = floorTopOf(i);
        if (floorTop !== -Infinity) amount = Math.max(amount, Math.min(0, floorTop - box.min.y));
      }
      if (amount === 0) return 0;
      const crossAxes = (['x', 'y', 'z'] as Axis[]).filter(a => a !== axis);
      const nextVisited = new Set(visited).add(i);
      works.forEach((other, j) => {
        if (nextVisited.has(j) || amount === 0) return;
        const otherBox = other.box;
        if (!crossAxes.every(a => overlapsOn(box, otherBox, a))) return;
        if (amount > 0) {
          //既にめり込んでいる(CAD上の初期配置が重なっている等)ワークや、移動量が届かないワークは対象外
          if (otherBox.min[axis] < box.max[axis] - contactEpsilon || otherBox.min[axis] >= box.max[axis] + amount) return;
          moveWork(j, axis, box.max[axis] + amount - otherBox.min[axis], nextVisited);
          amount = Math.max(0, Math.min(amount, otherBox.min[axis] - box.max[axis]));
        } else {
          if (otherBox.max[axis] > box.min[axis] + contactEpsilon || otherBox.max[axis] <= box.min[axis] + amount) return;
          moveWork(j, axis, box.min[axis] + amount - otherBox.max[axis], nextVisited);
          amount = Math.min(0, Math.max(amount, otherBox.max[axis] - box.min[axis]));
        }
      });
      box.min[axis] += amount;
      box.max[axis] += amount;
      works[i].moved[axis] += amount;
      return amount;
    };

    works.forEach((work, i) => {
      const { name: workName, box: workBox } = work;
      const velocity = new Vector3();
      //speed(実速度)が0になる瞬間(装置が目標位置に到達して静止した等)でも「掴まれている」ことを
      //区別できるよう、接触の有無そのものは速度と別にフラグで保持する(gravityの判定にも用いる)
      let beltContact = false, rodContact = false, chuckContact = false;

      //belt: ワークと接触していれば、deviceがONの間だけローカル速度ベクトルをワールド座標に変換して加算。
      //ベルト停止中(deviceがOFF)でもワークはベルトに載って支えられているため、接触フラグ自体はdeviceに関係なく立てる
      //(立てないとgravity指定のあるワークが停止中のベルトをすり抜けて落下してしまう)
      combairConfigs.filter(c => targets(c, workName)).forEach(config => {
        const box = combairBoxesRef.current.get(config);
        if (!box) return;
        //一部でも重なれば接触とみなすと、ベルトから押し出されて大半がはみ出したワークも搬送し続けてしまう。
        //そのため既定(release:"center")では水平面(X/Z)ではワーク中心がベルト範囲内にあることを条件にし、高さ(Y)は重なりのみを見る。
        //release:"clear"の場合は水平面でも一部でも重なっていれば接触とみなす
        const workCenter = workBox.getCenter(new Vector3());
        const onBeltHorizontally = config.release === 'clear'
          ? workBox.min.x <= box.max.x && workBox.max.x >= box.min.x && workBox.min.z <= box.max.z && workBox.max.z >= box.min.z
          : workCenter.x >= box.min.x && workCenter.x <= box.max.x && workCenter.z >= box.min.z && workCenter.z <= box.max.z;
        const onBelt = onBeltHorizontally && workBox.min.y <= box.max.y && workBox.max.y >= box.min.y;
        if (!onBelt) return;
        beltContact = true;
        if (!deviceValue[config.device]) return;
        const node = scene.getObjectByName(config.node);
        if (!node) return;
        const quat = new Quaternion();
        node.getWorldQuaternion(quat);
        const localVelocity = new Vector3(...config.velocity).divideScalar(1000);
        velocity.add(localVelocity.applyQuaternion(quat));
      });

      //rod: 接触している間だけロッドの実速度を加算
      rods.filter(r => targets(r.config, workName)).forEach(rod => {
        if (rod.box.intersectsBox(workBox)) { velocity.add(rod.velocity); rodContact = true; }
      });

      //air_chuck: finger_right/finger_leftそれぞれの実速度・接触を個別に判定する。
      //片方だけ接触していればそのフィンガーの速度をそのまま加算するが、
      //両方が同時に接触している場合は「一体となって動く」ことを表現するため単純な合算はせず平均を1件として加算する。
      //(左右フィンガーは開閉時に互いに逆向きの速度成分を持つため、両方接触時は開閉方向の成分が平均で相殺され、
      //  ロッド側から運ばれてくる並進速度成分だけが残る。単純合算だと並進成分が二重に加算されてしまう)
      chucks.filter(c => targets(c.config, workName)).forEach(chuck => {
        const rightTouch = chuck.rightBox.intersectsBox(workBox);
        const leftTouch = chuck.leftBox.intersectsBox(workBox);
        if (rightTouch && leftTouch) {
          velocity.add(chuck.rightVelocity.clone().add(chuck.leftVelocity).multiplyScalar(0.5));
          chuckContact = true;
        } else if (rightTouch) {
          velocity.add(chuck.rightVelocity);
          chuckContact = true;
        } else if (leftTouch) {
          velocity.add(chuck.leftVelocity);
          chuckContact = true;
        }
      });

      //DEBUG: 接触の内訳が変化したときだけログ出力する
      const dbgKey = `${beltContact}/${rodContact}/${chuckContact}`;
      if (dbgKeyRef.current.get(workName) !== dbgKey) {
        dbgKeyRef.current.set(workName, dbgKey);
        const c = workBox.getCenter(new Vector3());
        console.log(`[contact] ${workName} belt=${beltContact} rod=${rodContact} chuck=${chuckContact} vel=(${velocity.x.toFixed(4)},${velocity.y.toFixed(4)},${velocity.z.toFixed(4)}) delta=${delta.toFixed(4)} workCenter=(${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)})`);
      }

      //gravity: 他の機器に接触・把持されておらず、かつ支え(床または下のワーク)に達していなければ一定速度で落下させる。
      //支えを突き抜けないよう、このフレームで支えにちょうど到達する速度に制限する。
      //判定にはvelocityの大きさではなく接触フラグを使う(装置が目標位置に到達して静止すると実速度が0になり、
      //把持されたままでも「何にも触れていない」と誤判定して落下してしまうため)。
      //既に他のワークの上に載っている場合は、そのワークがこのフレームに実際に動いた水平移動量だけ一緒に動かす
      const ride = new Vector3();
      const isContacted = beltContact || rodContact || chuckContact;
      const gravity = gravityConfigs.find(c => targets(c, workName));
      if (gravity && !isContacted) {
        const support = supportOf(i);
        if (workBox.min.y > support.top + floorEpsilon) {
          const speedM = (gravity.speed ?? GRAVITY_DEFAULT_SPEED) / 1000;
          const fallWorldDist = Math.min(speedM * worldScale * delta, workBox.min.y - support.top);
          velocity.y = -fallWorldDist / delta / worldScale;
        } else if (support.index >= 0) {
          const below = works[support.index].moved;
          ride.set(below.x, 0, below.z);
        }
      }

      //ワールド座標での移動量を、鉛直→水平の順に軸ごとに適用する(軸ごとに他のワークとの押し出し・衝突を解決する)
      const displacement = velocity.multiplyScalar(delta * worldScale).add(ride);
      (['y', 'x', 'z'] as Axis[]).forEach(axis => moveWork(i, axis, displacement[axis], new Set()));
    });

    //ワールド座標で確定した移動量を、各ワークの親のローカル座標系に変換して位置へ反映する
    works.forEach(({ node, moved }) => {
      if (moved.lengthSq() === 0) return;
      const localMoved = moved.clone().divideScalar(worldScale);
      if (node.parent) {
        const parentQuat = new Quaternion();
        node.parent.getWorldQuaternion(parentQuat);
        localMoved.applyQuaternion(parentQuat.invert());
      }
      node.position.add(localMoved);
    });
  });

  return null;
}

function AssemblyModelScene({ modelUrl, modelFolder, modelRotationDeg, resetToken }: { modelUrl: string; modelFolder: string; modelRotationDeg?: Vector3Tuple; resetToken: number }) {
  const { scene } = useGLTF(modelUrl) as unknown as { scene: Group };
  const materialsNormalizedRef = useRef(false);

  //modelRotationDegの配列そのものをuseMemoの依存にすると、呼び出し側がインライン配列リテラルを渡した場合に
  //値が同じでも参照が毎レンダー変わり、その都度sceneが複製し直されてワーク等の位置がgltfの初期値に戻ってしまう
  //(ランモード中は一定周期で再レンダーされるため、その位置リセットが繰り返し起きて「振動しているように見える」不具合になる)。
  //そのため、配列ではなく中身のプリミティブ値を依存に使う
  const [rotXDeg, rotYDeg, rotZDeg] = modelRotationDeg ?? [0, 0, 0];
  const hasModelRotation = modelRotationDeg !== undefined;

  //useGLTFのscene/nodesはURL単位でキャッシュされ複数マウント間で共有されるため、
  //そのまま使うとattach()で行うノード付け替えが他インスタンスに影響してしまう。マウントごとに複製して独立させる。
  //CAD側の座標系(Z-up等)のままエクスポートされたモデルは、そのままだとglTF/three.jsのY-up前提と噛み合わず傾いて見えるため、
  //hasModelRotationが指定されていれば、他の計算(スケール・オフセット・接触判定など)より先に一括で補正回転を焼き込む
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    if (hasModelRotation) {
      cloned.rotation.set(rotXDeg * Math.PI / 180, rotYDeg * Math.PI / 180, rotZDeg * Math.PI / 180);
    }
    return cloned;
  }, [scene, hasModelRotation, rotXDeg, rotYDeg, rotZDeg]);
  const configs = useMemo(() => getConfigsForModel(modelFolder), [modelFolder]);

  useEffect(() => {
    if (materialsNormalizedRef.current) return;
    const seen = new Set<MeshStandardMaterial>();
    clonedScene.traverse(child => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as MeshStandardMaterial;
      if (seen.has(mat)) return;
      seen.add(mat);
      mat.metalness = MATERIAL_METALNESS;
      mat.roughness = MATERIAL_ROUGHNESS;
    });
    materialsNormalizedRef.current = true;
  }, [clonedScene]);

  //各ノードの初期ローカル位置を記録しておき、リセット時に全ノードをこの位置へ戻せるようにする
  //(ワークがbeltなどと接触しなくなるとその場で停止し続けてしまうため、視点を変えずにモデルの状態だけ初期化できる手段が必要)
  const initialPositionsRef = useRef<Map<Object3D, Vector3>>(new Map());
  useEffect(() => {
    const positions = new Map<Object3D, Vector3>();
    clonedScene.traverse(node => positions.set(node, node.position.clone()));
    initialPositionsRef.current = positions;
  }, [clonedScene]);

  useEffect(() => {
    if (resetToken === 0) return; //初回マウント時(まだリセット操作が行われていない)は何もしない
    initialPositionsRef.current.forEach((position, node) => node.position.copy(position));
  }, [resetToken]);

  //単位系(mm等)・原点位置に関わらず、シーン内で見やすいサイズ・位置になるスケールとオフセットを求める
  //(X/Zは中心を原点に、Yはグリッド(Y=0)にモデルの最下部が乗るように最小値を原点に合わせる)
  const { scale, offset } = useMemo(() => {
    const box = new Box3().setFromObject(clonedScene);
    const size = new Vector3();
    box.getSize(size);
    const center = new Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return { scale: MODEL_TARGET_SIZE / maxDim, offset: new Vector3(-center.x, -box.min.y, -center.z) };
  }, [clonedScene]);

  return (
    <group scale={scale}>
      <group position={[offset.x, offset.y, offset.z]}>
        <primitive object={clonedScene} />
        {configs.map(config => {
          if (config.type === 'light') return <LightAssembly key={config.node} scene={clonedScene} config={config} />;
          if (config.type === 'button') return <ButtonAssembly key={config.node} scene={clonedScene} config={config} resetToken={resetToken} />;
          if (config.type === 'aircylinder') return <AirCylinderAssembly key={config.node} scene={clonedScene} config={config} />;
          if (config.type === 'air_chuck') return <AirChuckAssembly key={config.node} scene={clonedScene} config={config} />;
          if (config.type === 'proximity_sensor') return <ProximitySensorAssembly key={config.node} scene={clonedScene} config={config} />;
          if (config.type === 'light_gate') return <LightGateAssembly key={`${config.emitter_node}_${config.receiver_node}`} scene={clonedScene} config={config} />;
          if (config.type === 'axis') return <AxisAssembly key={`axis_${config.axis_number ?? 1}`} scene={clonedScene} config={config} />;
          //combairのワーク搬送はContactVelocityAssemblyがワークとの接触判定込みでまとめて処理する。ここではflagの周回表示のみ扱う
          if (config.type === 'combair' && config.flag_targets?.length) return <BeltFlagAssembly key={`flag_${config.node}`} scene={clonedScene} config={config} resetToken={resetToken} />;
          return null;
        })}
        {configs.some(c => c.type === 'combair' || c.type === 'aircylinder' || c.type === 'air_chuck' || c.type === 'gravity') && (
          <ContactVelocityAssembly scene={clonedScene} configs={configs} resetToken={resetToken} />
        )}
      </group>
    </group>
  );
}

const DEFAULT_CAMERA_POSITION: Vector3Tuple = [5, 4, 8]

//設備モデル(GLTF)本体 + model/<modelFolder>/配下の*.json(アセンブリごとの動作定義)から挙動が一意に決まる汎用ビューア。
//新しい設備を追加する場合は、モデルファイルと動作定義JSONをmodel/配下に置き、
//このコンポーネントにmodelUrl/modelFolderを渡す薄いラッパーを1つ用意するだけでよい。
//modelRotationDegは、CADエクスポート時の座標系がY-up前提と合わずモデル全体が傾いて見える場合の補正用(度数、[x,y,z]の順)。
//cameraPositionは初期視点の位置(モデル正規化後のワールド座標、OrbitControlsの注視点は原点(0,0,0)固定)。省略時はDEFAULT_CAMERA_POSITION
function AssemblyEquipment({ modelUrl, modelFolder, modelRotationDeg, cameraPosition }: { modelUrl: string; modelFolder: string; modelRotationDeg?: Vector3Tuple; cameraPosition?: Vector3Tuple }) {
  //「リセット」ボタンはCanvas外のDOM要素なので、押してもOrbitControlsが保持しているカメラの位置・向きには影響しない。
  //resetTokenをインクリメントし、AssemblyModelScene側でその変化を検知してモデル内の各ノードを初期位置に戻す
  const [resetToken, setResetToken] = useState(0);
  const ioSignals = useMemo(() => collectIoSignals(getConfigsForModel(modelFolder)), [modelFolder]);
  useIoSignals('equipment', ioSignals);

  //RUNモードからEDITモードに戻った際、デバイス値(deviceValue)はRuntimeProvider側でリセットされるが、
  //モデル内の各ノードの位置(ワークの搬送位置・シリンダーのストローク位置等)はそれだけでは戻らないため、
  //RUN→EDITの遷移を検知して自動的にリセットを発火させる
  const { mode } = useContext(RuntimeContext);
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === 'RUN' && mode === 'EDIT') {
      setResetToken(token => token + 1);
    }
    prevModeRef.current = mode;
  }, [mode]);

  return (
    <div className="relative h-full w-full">
      <Canvas className="h-full w-full" camera={{ position: cameraPosition ?? DEFAULT_CAMERA_POSITION, fov: 50 }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 8, 5]} intensity={2} />
        <directionalLight position={[-5, 4, -5]} intensity={1} />
        <FactoryEnvironment />

        <Suspense fallback={null}>
          <AssemblyModelScene modelUrl={modelUrl} modelFolder={modelFolder} modelRotationDeg={modelRotationDeg} resetToken={resetToken} />
        </Suspense>

        {/* 建屋の壁の外側や床下にカメラが回り込まないよう制限する */}
        <OrbitControls enableDamping={false} maxDistance={FACTORY_HALF_SIZE - 2} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>

      <button
        onClick={() => setResetToken(token => token + 1)}
        className="absolute right-2 top-2 rounded bg-gray-900/80 px-3 py-1 text-xs text-white hover:bg-gray-900"
      >
        リセット
      </button>
    </div>
  );
}

export default AssemblyEquipment
