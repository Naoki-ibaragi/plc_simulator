import { Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Color, Vector3, type Group, type Mesh, type MeshStandardMaterial } from 'three'
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

export type AssemblyConfig = LightAssemblyConfig | ButtonAssemblyConfig

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

function AssemblyModelScene({ modelUrl, modelFolder }: { modelUrl: string; modelFolder: string }) {
  const { scene } = useGLTF(modelUrl) as unknown as { scene: Group };
  const materialsNormalizedRef = useRef(false);

  //useGLTFのscene/nodesはURL単位でキャッシュされ複数マウント間で共有されるため、
  //そのまま使うとattach()で行うノード付け替えが他インスタンスに影響してしまう。マウントごとに複製して独立させる。
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
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
          return null;
        })}
      </group>
    </group>
  );
}

//設備モデル(GLTF)本体 + model/<modelFolder>/配下の*.json(アセンブリごとの動作定義)から挙動が一意に決まる汎用ビューア。
//新しい設備を追加する場合は、モデルファイルと動作定義JSONをmodel/配下に置き、
//このコンポーネントにmodelUrl/modelFolderを渡す薄いラッパーを1つ用意するだけでよい
function AssemblyEquipment({ modelUrl, modelFolder }: { modelUrl: string; modelFolder: string }) {
  return (
    <Canvas className="h-full w-full" camera={{ position: [5, 4, 8], fov: 50 }}>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 8, 5]} intensity={2} />
      <directionalLight position={[-5, 4, -5]} intensity={1} />
      <gridHelper args={[20, 20]} />

      <Suspense fallback={null}>
        <AssemblyModelScene modelUrl={modelUrl} modelFolder={modelFolder} />
      </Suspense>

      <OrbitControls enableDamping={false} />
    </Canvas>
  );
}

export default AssemblyEquipment
