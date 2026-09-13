import { Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Color, Quaternion, Vector3, type Group, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { RuntimeContext } from '../Runtime/RuntimeContext'

const MODEL_TARGET_SIZE = 3 //CADモデルの単位系(mm等)に関わらず、シーン内で見やすい最大辺長に正規化する
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

type ButtonAssemblyConfig = {
  type: 'button'
  node: string
  device: string //クリック時にONにする入力デバイス
  click_stroke: number //押し込みストローク(mm)
  target?: string //アセンブリ内で可動させる子ノード名。省略時は"button"
  axis?: Axis //ストロークの移動軸(ノードのローカル座標系)。省略時は"y"
}

type Vector3Tuple = [number, number, number]

type ComBairAssemblyConfig = {
  type: 'combair'
  node: string //コンベア本体のノード名(このノードのワールドバウンディングボックスとワークの接触を判定する)
  device: string //ONの間だけ速度ベクトルが有効になる出力デバイス
  work_node?: string //搬送されるワークのノード名。省略時は"work"
  velocity: Vector3Tuple //ワークに与える速度ベクトル(mm/s、このノードのローカル座標系)。ワークと接触している間だけ適用される
  contact_margin?: number //接触判定のバウンディングボックスに持たせる余裕(mm)。省略時はCOMBAIR_DEFAULT_CONTACT_MARGIN
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
  work_node?: string //接触判定の対象になるワークのノード名。省略時は"work"
  contact_margin?: number //ロッドの接触判定用バウンディングボックスに持たせる余裕(mm)。省略時はAIRCYLINDER_DEFAULT_CONTACT_MARGIN
  sensor_extended?: AirCylinderSensorConfig //前進端(ストローク上限)検出。target省略時は"autosensor1"
  sensor_retracted?: AirCylinderSensorConfig //後退端(ストローク下限)検出。target省略時は"autosensor2"
}

type ProximitySensorAssemblyConfig = {
  type: 'proximity_sensor'
  node: string //センサー本体のノード名
  device: string //検出時にONにする入力デバイス
  tip_target?: string //検出面の子ノード名。省略時は"tip"
  axis?: Axis //検出方向(法線)の軸(tipのローカル座標系)。省略時は"x"
  direction?: 1 | -1 //法線の正負どちら向きが検出方向か。省略時は1
  range: number //tipから法線方向の検出距離(mm)
  work_node?: string //検出対象のワークのノード名。省略時は"work"
}

type LightGateAssemblyConfig = {
  type: 'light_gate'
  emitter_node: string //投光器のノード名
  emitter_target?: string //投光器側の基準子ノード名。省略時は"center"
  receiver_node: string //受光器のノード名
  receiver_target?: string //受光器側の基準子ノード名。省略時は"center001"
  receiver_indicator_target?: string //検出時に発光させる受光器側の子ノード名(任意)。省略時は"light"
  device: string //center間にワークが存在するときONにする入力デバイス
  beam_width?: number //center同士を結ぶ直線からこの距離(mm)以内なら検出とみなす。省略時はLIGHT_GATE_DEFAULT_BEAM_WIDTH
  work_node?: string //検出対象のワークのノード名。省略時は"work"
}

export type AssemblyConfig =
  | LightAssemblyConfig
  | ButtonAssemblyConfig
  | ComBairAssemblyConfig
  | AirCylinderAssemblyConfig
  | ProximitySensorAssemblyConfig
  | LightGateAssemblyConfig

//model/<フォルダ名>/配下に置かれた*.json(アセンブリ単位の動作定義ファイル)を一括で収集する。
//Vite の import.meta.glob は静的なパターンしか解析できないため、モデルフォルダを追加してもこの1箇所の変更は不要
const assemblyConfigModules = import.meta.glob<AssemblyConfig>('./model/*/*.json', { eager: true, import: 'default' })

function getConfigsForModel(modelFolder: string): AssemblyConfig[] {
  const prefix = `./model/${modelFolder}/`
  return Object.entries(assemblyConfigModules)
    .filter(([path]) => path.startsWith(prefix))
    .map(([, config]) => config)
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
  const { deviceValue } = useContext(RuntimeContext);
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

//type:"button" アセンブリ。OFF状態でクリックすると押し込みストローク→ボタン部発光→deviceONの順に遷移し、
//ON状態でクリックすると消灯→復帰ストローク→deviceOFFの順に遷移する(1クリックで状態がトグルする押しボタン)。
//アニメーション中(pressing/releasing)のクリックは無視する
function ButtonAssembly({ scene, config }: { scene: Group; config: ButtonAssemblyConfig }) {
  const { setInputDevice } = useContext(RuntimeContext);
  const groupRef = useRef<Group>(null);
  const attachedRef = useRef(false);
  const baseRef = useRef(0);
  const phaseRef = useRef<'off' | 'pressing' | 'on' | 'releasing'>('off');
  const materialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const [hovered, setHovered] = useState(false);
  const axis = config.axis ?? 'y';
  const strokeM = config.click_stroke / 1000;

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
    baseRef.current = groupRef.current.position[axis];
    attachedRef.current = true;
  }, [scene, config, axis]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const phase = phaseRef.current;
    if (!group || (phase !== 'pressing' && phase !== 'releasing')) return;
    const base = baseRef.current;
    const target = phase === 'pressing' ? base + strokeM : base;
    const current = group.position[axis];
    const diff = target - current;
    const step = STROKE_SPEED * delta;
    const next = Math.abs(diff) <= step ? target : current + Math.sign(diff) * step;
    group.position[axis] = next;
    if (next === target) {
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

  return (
    <group
      ref={groupRef}
      onClick={e => { e.stopPropagation(); handleClick(); }}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {hovered && <DeviceLabel label={`入力: ${config.device}`} />}
    </group>
  );
}

const AIRCYLINDER_DEFAULT_SPEED = 50 //mm/s
const AIRCYLINDER_DEFAULT_CONTACT_MARGIN = 20 //mm。CADの取り合い誤差を吸収できるよう余裕を持たせている
const COMBAIR_DEFAULT_CONTACT_MARGIN = 15 //mm
const LIGHT_GATE_DEFAULT_BEAM_WIDTH = 15 //mm
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
  const { deviceValue, setInputDevice } = useContext(RuntimeContext);
  const rodRef = useRef<Object3D | null>(null);
  const baseRef = useRef(0);
  const sensorExtendedOnRef = useRef(false);
  const sensorRetractedOnRef = useRef(false);
  const sensorExtendedMaterialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const sensorRetractedMaterialsRef = useRef<MeshStandardMaterial[] | null>(null);

  const axis = config.axis ?? 'x';
  const direction = config.direction ?? 1;
  const strokeM = config.stroke / 1000;
  const speedM = (config.speed ?? AIRCYLINDER_DEFAULT_SPEED) / 1000;

  useEffect(() => {
    const assemblyNode = scene.getObjectByName(config.node);
    const rod = assemblyNode?.getObjectByName(config.rod_target ?? 'rod');
    if (!assemblyNode || !rod) return;
    rodRef.current = rod;
    baseRef.current = rod.position[axis];

    if (config.sensor_extended) {
      const node = assemblyNode.getObjectByName(config.sensor_extended.target ?? 'autosensor1');
      if (node) sensorExtendedMaterialsRef.current = cloneEmissiveMaterials(node, SENSOR_INDICATOR_COLOR);
    }
    if (config.sensor_retracted) {
      const node = assemblyNode.getObjectByName(config.sensor_retracted.target ?? 'autosensor2');
      if (node) sensorRetractedMaterialsRef.current = cloneEmissiveMaterials(node, SENSOR_INDICATOR_COLOR);
    }
  }, [scene, config, axis]);

  useFrame((_, delta) => {
    const rod = rodRef.current;
    if (!rod) return;
    const base = baseRef.current;
    const target = base + (deviceValue[config.device] ? direction * strokeM : 0);
    const current = rod.position[axis];
    const diff = target - current;
    const step = speedM * delta;
    rod.position[axis] = Math.abs(diff) <= step ? target : current + Math.sign(diff) * step;

    //ストローク端(前進端/後退端)に到達している間だけオートスイッチのdeviceをON
    const progress = strokeM > 0 ? ((rod.position[axis] - base) * direction) / strokeM : 0;
    const extendedOn = progress >= 0.98;
    const retractedOn = progress <= 0.02;
    if (config.sensor_extended && extendedOn !== sensorExtendedOnRef.current) {
      sensorExtendedOnRef.current = extendedOn;
      setInputDevice(config.sensor_extended.device, extendedOn);
    }
    if (config.sensor_retracted && retractedOn !== sensorRetractedOnRef.current) {
      sensorRetractedOnRef.current = retractedOn;
      setInputDevice(config.sensor_retracted.device, retractedOn);
    }
    sensorExtendedMaterialsRef.current?.forEach(mat => { mat.emissiveIntensity = extendedOn ? EMISSIVE_INTENSITY_ON : 0; });
    sensorRetractedMaterialsRef.current?.forEach(mat => { mat.emissiveIntensity = retractedOn ? EMISSIVE_INTENSITY_ON : 0; });
  });

  return null;
}

//type:"proximity_sensor" アセンブリ。tipから法線方向(axis×direction)に見て0〜range(mm)の範囲にワークがあればdeviceをON
function ProximitySensorAssembly({ scene, config }: { scene: Group; config: ProximitySensorAssemblyConfig }) {
  const { setInputDevice } = useContext(RuntimeContext);
  const tipRef = useRef<Object3D | null>(null);
  const workRef = useRef<Object3D | null>(null);
  const materialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const onRef = useRef(false);
  const axis = config.axis ?? 'x';
  const direction = config.direction ?? 1;
  const rangeM = config.range / 1000;

  useEffect(() => {
    const assemblyNode = scene.getObjectByName(config.node);
    const tip = assemblyNode?.getObjectByName(config.tip_target ?? 'tip');
    const work = scene.getObjectByName(config.work_node ?? 'work');
    if (!tip || !work) return;
    tipRef.current = tip;
    workRef.current = work;
    materialsRef.current = cloneEmissiveMaterials(tip, SENSOR_INDICATOR_COLOR);
  }, [scene, config]);

  useFrame(() => {
    const tip = tipRef.current;
    const work = workRef.current;
    if (!tip || !work) return;
    const tipPos = new Vector3();
    tip.getWorldPosition(tipPos);
    const tipQuat = new Quaternion();
    tip.getWorldQuaternion(tipQuat);
    const normal = axisVector(axis).applyQuaternion(tipQuat).multiplyScalar(direction);
    const workPos = new Vector3();
    work.getWorldPosition(workPos);
    const proj = workPos.clone().sub(tipPos).dot(normal);
    const detected = proj >= 0 && proj <= rangeM;
    if (detected !== onRef.current) {
      onRef.current = detected;
      setInputDevice(config.device, detected);
    }
    materialsRef.current?.forEach(mat => { mat.emissiveIntensity = detected ? EMISSIVE_INTENSITY_ON : 0; });
  });

  return null;
}

//type:"light_gate" アセンブリ。投光器/受光器それぞれの基準ノードを結ぶ線分上(beam_widthの範囲内)にワークがあればdeviceをON
function LightGateAssembly({ scene, config }: { scene: Group; config: LightGateAssemblyConfig }) {
  const { setInputDevice } = useContext(RuntimeContext);
  const emitterTargetRef = useRef<Object3D | null>(null);
  const receiverTargetRef = useRef<Object3D | null>(null);
  const workRef = useRef<Object3D | null>(null);
  const materialsRef = useRef<MeshStandardMaterial[] | null>(null);
  const onRef = useRef(false);
  const beamWidthM = (config.beam_width ?? LIGHT_GATE_DEFAULT_BEAM_WIDTH) / 1000;

  useEffect(() => {
    const emitterAssembly = scene.getObjectByName(config.emitter_node);
    const receiverAssembly = scene.getObjectByName(config.receiver_node);
    const emitterTarget = emitterAssembly?.getObjectByName(config.emitter_target ?? 'center');
    const receiverTarget = receiverAssembly?.getObjectByName(config.receiver_target ?? 'center001');
    const work = scene.getObjectByName(config.work_node ?? 'work');
    if (!emitterTarget || !receiverTarget || !work) return;
    emitterTargetRef.current = emitterTarget;
    receiverTargetRef.current = receiverTarget;
    workRef.current = work;
    const indicator = receiverAssembly?.getObjectByName(config.receiver_indicator_target ?? 'light');
    if (indicator) materialsRef.current = cloneEmissiveMaterials(indicator, SENSOR_INDICATOR_COLOR);
  }, [scene, config]);

  useFrame(() => {
    const emitterTarget = emitterTargetRef.current;
    const receiverTarget = receiverTargetRef.current;
    const work = workRef.current;
    if (!emitterTarget || !receiverTarget || !work) return;
    const from = new Vector3();
    emitterTarget.getWorldPosition(from);
    const to = new Vector3();
    receiverTarget.getWorldPosition(to);
    const beam = to.clone().sub(from);
    const beamLength = beam.length();
    const beamDir = beam.clone().normalize();
    const workPos = new Vector3();
    work.getWorldPosition(workPos);
    const toWork = workPos.clone().sub(from);
    const t = toWork.dot(beamDir);
    const lateral = toWork.clone().sub(beamDir.clone().multiplyScalar(t)).length();
    const detected = t >= 0 && t <= beamLength && lateral <= beamWidthM;
    if (detected !== onRef.current) {
      onRef.current = detected;
      setInputDevice(config.device, detected);
    }
    materialsRef.current?.forEach(mat => { mat.emissiveIntensity = detected ? EMISSIVE_INTENSITY_ON : 0; });
  });

  return null;
}

//ワークとの接触判定を持つ機器(combair/aircylinder)を1箇所にまとめて扱う。
//毎フレーム、各機器のワールドバウンディングボックスとワークのバウンディングボックスが交差していれば「接触」とみなし、
//接触している機器の速度ベクトル(ワールド座標)をワークの速度ベクトルへ加算する(複数機器が同時に接触していれば合成される)。
//どの機器とも接触していなければワークの速度ベクトルは(0,0,0)になり、その場に静止する
function ContactVelocityAssembly({ scene, configs }: { scene: Group; configs: AssemblyConfig[] }) {
  const { deviceValue } = useContext(RuntimeContext);
  const combairConfigs = useMemo(() => configs.filter((c): c is ComBairAssemblyConfig => c.type === 'combair'), [configs]);
  const aircylinderConfigs = useMemo(() => configs.filter((c): c is AirCylinderAssemblyConfig => c.type === 'aircylinder'), [configs]);
  const workNames = useMemo(() => {
    const names = new Set<string>();
    combairConfigs.forEach(c => names.add(c.work_node ?? 'work'));
    aircylinderConfigs.forEach(c => names.add(c.work_node ?? 'work'));
    return Array.from(names);
  }, [combairConfigs, aircylinderConfigs]);

  //combairは静止した設備なので、接触判定用ワールドバウンディングボックスは初回に1度だけ計算してキャッシュする
  const combairBoxesRef = useRef<Map<ComBairAssemblyConfig, Box3>>(new Map());
  //rodは毎フレーム動くため、実速度を有限差分(前フレームとの位置差)から求めるための直前ワールド座標を機器ごとに保持する
  const rodPrevWorldPosRef = useRef<Map<AirCylinderAssemblyConfig, Vector3>>(new Map());

  useEffect(() => {
    scene.updateMatrixWorld(true);

    const boxes = new Map<ComBairAssemblyConfig, Box3>();
    combairConfigs.forEach(config => {
      const node = scene.getObjectByName(config.node);
      if (!node) return;
      const margin = (config.contact_margin ?? COMBAIR_DEFAULT_CONTACT_MARGIN) / 1000;
      boxes.set(config, new Box3().setFromObject(node).expandByScalar(margin));
    });
    combairBoxesRef.current = boxes;

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
  }, [scene, combairConfigs, aircylinderConfigs]);

  useFrame((_, delta) => {
    if (delta <= 0) return;

    workNames.forEach(workName => {
      const work = scene.getObjectByName(workName);
      if (!work) return;
      const workBox = new Box3().setFromObject(work);
      const velocity = new Vector3();

      //belt: deviceがONかつワークと接触していれば、ローカル速度ベクトルをワールド座標に変換して加算
      combairConfigs.filter(c => (c.work_node ?? 'work') === workName).forEach(config => {
        if (!deviceValue[config.device]) return;
        const box = combairBoxesRef.current.get(config);
        if (!box || !box.intersectsBox(workBox)) return;
        const node = scene.getObjectByName(config.node);
        if (!node) return;
        const quat = new Quaternion();
        node.getWorldQuaternion(quat);
        const localVelocity = new Vector3(...config.velocity).divideScalar(1000);
        velocity.add(localVelocity.applyQuaternion(quat));
      });

      //rod: 実際の移動量(ワールド座標の有限差分)から求めた速度ベクトルを、接触している間だけ加算
      aircylinderConfigs.filter(c => (c.work_node ?? 'work') === workName).forEach(config => {
        const assemblyNode = scene.getObjectByName(config.node);
        const rod = assemblyNode?.getObjectByName(config.rod_target ?? 'rod');
        if (!rod) return;
        const currentPos = new Vector3();
        rod.getWorldPosition(currentPos);
        const prevPos = rodPrevWorldPosRef.current.get(config) ?? currentPos.clone();
        const rodVelocity = currentPos.clone().sub(prevPos).divideScalar(delta);
        rodPrevWorldPosRef.current.set(config, currentPos.clone());

        const margin = (config.contact_margin ?? AIRCYLINDER_DEFAULT_CONTACT_MARGIN) / 1000;
        const rodBox = new Box3().setFromObject(rod).expandByScalar(margin);
        if (rodBox.intersectsBox(workBox)) velocity.add(rodVelocity);
      });

      //ワールド座標の速度ベクトルをワークの親のローカル座標系に変換してから位置を積分する
      if (work.parent) {
        const parentQuat = new Quaternion();
        work.parent.getWorldQuaternion(parentQuat);
        velocity.applyQuaternion(parentQuat.invert());
      }
      work.position.addScaledVector(velocity, delta);
    });
  });

  return null;
}

function AssemblyModelScene({ modelUrl, modelFolder, modelRotationDeg }: { modelUrl: string; modelFolder: string; modelRotationDeg?: Vector3Tuple }) {
  const { scene } = useGLTF(modelUrl) as unknown as { scene: Group };
  const materialsNormalizedRef = useRef(false);

  //useGLTFのscene/nodesはURL単位でキャッシュされ複数マウント間で共有されるため、
  //そのまま使うとattach()で行うノード付け替えが他インスタンスに影響してしまう。マウントごとに複製して独立させる。
  //CAD側の座標系(Z-up等)のままエクスポートされたモデルは、そのままだとglTF/three.jsのY-up前提と噛み合わず傾いて見えるため、
  //modelRotationDegが指定されていれば、他の計算(スケール・オフセット・接触判定など)より先に一括で補正回転を焼き込む
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    if (modelRotationDeg) {
      const [x, y, z] = modelRotationDeg;
      cloned.rotation.set(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180);
    }
    return cloned;
  }, [scene, modelRotationDeg]);
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
          if (config.type === 'button') return <ButtonAssembly key={config.node} scene={clonedScene} config={config} />;
          if (config.type === 'aircylinder') return <AirCylinderAssembly key={config.node} scene={clonedScene} config={config} />;
          if (config.type === 'proximity_sensor') return <ProximitySensorAssembly key={config.node} scene={clonedScene} config={config} />;
          if (config.type === 'light_gate') return <LightGateAssembly key={`${config.emitter_node}_${config.receiver_node}`} scene={clonedScene} config={config} />;
          return null; //combairはContactVelocityAssemblyがワークとの接触判定込みでまとめて処理する
        })}
        {configs.some(c => c.type === 'combair' || c.type === 'aircylinder') && (
          <ContactVelocityAssembly scene={clonedScene} configs={configs} />
        )}
      </group>
    </group>
  );
}

//設備モデル(GLTF)本体 + model/<modelFolder>/配下の*.json(アセンブリごとの動作定義)から挙動が一意に決まる汎用ビューア。
//新しい設備を追加する場合は、モデルファイルと動作定義JSONをmodel/配下に置き、
//このコンポーネントにmodelUrl/modelFolderを渡す薄いラッパーを1つ用意するだけでよい。
//modelRotationDegは、CADエクスポート時の座標系がY-up前提と合わずモデル全体が傾いて見える場合の補正用(度数、[x,y,z]の順)
function AssemblyEquipment({ modelUrl, modelFolder, modelRotationDeg }: { modelUrl: string; modelFolder: string; modelRotationDeg?: Vector3Tuple }) {
  return (
    <Canvas className="h-full w-full" camera={{ position: [5, 4, 8], fov: 50 }}>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 8, 5]} intensity={2} />
      <directionalLight position={[-5, 4, -5]} intensity={1} />
      <gridHelper args={[20, 20]} />

      <Suspense fallback={null}>
        <AssemblyModelScene modelUrl={modelUrl} modelFolder={modelFolder} modelRotationDeg={modelRotationDeg} />
      </Suspense>

      <OrbitControls enableDamping={false} />
    </Canvas>
  );
}

export default AssemblyEquipment
