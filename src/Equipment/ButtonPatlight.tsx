import { Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Color, Vector3, type Group, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { RuntimeContext } from '../Runtime/RuntimeContext'
import buttonPatlightUrl from './button_patlight.glb'

const MODEL_TARGET_SIZE = 3 //CADモデルの単位系(mm等)に関わらず、シーン内で見やすい最大辺長に正規化する

//ボタンキャップはローカルZ軸方向(パネル前面から奥へ向かう向き)に押し込まれる
const PRESS_STROKE = 0.0030 //ボタンの押し込み量(m)。A3KA_51W_05Eヘッドユニットの実測突出量(約3.5mm)=ベゼルと面一になる量
const PRESS_SPEED = 0.02 //1秒あたりの追従速度(m/s相当)
const EMISSIVE_INTENSITY_ON = 1.5

//元モデルのマテリアルはmetallic/roughnessが既定値(共に1.0)のままエクスポートされており、
//環境マップなしのシンプルな平行光+環境光だけでは金属反射しか起きずCAD上の見た目より暗く沈む。
//塗装された樹脂/金属パネルに近い見た目になるよう明示的に上書きする
const MATERIAL_METALNESS = 0.3
const MATERIAL_ROUGHNESS = 0.5

//押しボタン(ノード名, 対応する入力デバイス)
const BUTTONS = [
  { nodeName: 'A3SA_5600', device: 'X0', label: '赤ボタン' },
  { nodeName: 'A3SA_5601', device: 'X1', label: '黄ボタン' },
  { nodeName: 'A3SA_5603', device: 'X2', label: '緑ボタン' },
] as const

//積層信号灯のLEDユニット(ノード名, 対応する出力デバイス, 点灯色)。
//3ユニットはモデル上同一マテリアル(黄色)を共有しているため、個別に発光させるには
//マテリアルをユニットごとに複製する必要がある。また元モデルの色割り当てが黄色一色になって
//しまっているため、CAD上の色指定(上から赤/黄/緑)に合わせて色も個別に上書きする
//(GLTFLoaderがノード名中の空白を"_"に置換するため、元モデルの"LED Unit"等ではなく置換後の名前で参照する)
const LEDS = [
  { nodeName: 'LED_Unit002', device: 'Y0', label: 'LED Unit002', color: '#ff0000' },
  { nodeName: 'LED_Unit', device: 'Y1', label: 'LED Unit', color: '#ffff00' },
  { nodeName: 'LED_Unit001', device: 'Y2', label: 'LED Unit001', color: '#00cc00' },
] as const

//マウスオーバー時に表示するデバイス名ラベル
function DeviceLabel({ label }: { label: string }) {
  return (
    <Html position={[0, 0.15, 0]} center style={{ pointerEvents: 'none' }}>
      <div className="whitespace-nowrap rounded bg-gray-900/80 px-2 py-1 text-xs text-white">
        {label}
      </div>
    </Html>
  )
}

function ButtonPatlightScene() {
  const { setInputDevice, deviceValue } = useContext(RuntimeContext);
  const { scene } = useGLTF(buttonPatlightUrl) as unknown as { scene: Group };
  const rootScene = useThree(state => state.scene);
  const attachedRef = useRef(false);
  const materialsNormalizedRef = useRef(false);
  const pressedRef = useRef<Record<string, boolean>>({});
  const buttonBaseZRef = useRef<Record<string, number>>({});
  const buttonGroupRefs = useRef<Record<string, Group | null>>({});
  const ledMaterialsRef = useRef<Record<string, MeshStandardMaterial[]>>({});
  const deviceValueRef = useRef(deviceValue);
  deviceValueRef.current = deviceValue;
  const [hovered, setHovered] = useState<string | null>(null);

  //useGLTFのscene/nodesはURL単位でキャッシュされ複数マウント間で共有されるため、
  //そのまま使うとattach()で行うノード付け替えが他インスタンスに影響してしまう。マウントごとに複製して独立させる。
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  const nodesByName = useMemo(() => {
    const map: Record<string, Object3D> = {};
    [...BUTTONS.map(b => b.nodeName), ...LEDS.map(l => l.nodeName)].forEach(name => {
      const obj = clonedScene.getObjectByName(name);
      if (obj) map[name] = obj;
    });
    return map;
  }, [clonedScene]);

  //元モデルのマテリアルはmetallic/roughnessが既定値(共に1.0)のままのため、環境マップ(Environment)を
  //追加しても素の状態では金属反射しか起きず暗く沈む。全マテリアルに対して一度だけ塗装面寄りの値に上書きする
  //(同じマテリアルを複数メッシュが共有しているため、インスタンスごとではなくマテリアル単位で1回だけ処理する)。
  //ボタンノードをattach()で付け替える前に、clonedScene全体からまだ辿れるうちに行う必要がある
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

  //ボタンノードを個別のグループへ付け替え、他のボタンに影響を与えず単独で押し込みアニメーションできるようにする
  //(attach()は再親付け時に見た目の位置がずれないようlocal変換を自動調整する)
  useEffect(() => {
    if (attachedRef.current) return;
    rootScene.updateMatrixWorld(true);
    BUTTONS.forEach(({ nodeName }) => {
      const node = nodesByName[nodeName];
      const group = buttonGroupRefs.current[nodeName];
      if (!node || !group) return;
      group.attach(node);
      buttonBaseZRef.current[nodeName] = group.position.z;
    });
    attachedRef.current = true;
  }, [nodesByName, rootScene]);

  //LEDユニットのマテリアルをユニットごとに複製し、他ユニット(および同じマテリアルを使う黄ボタン)に影響を与えず
  //個別に発光強度を制御できるようにする。あわせて、元モデルでは3ユニットとも黄色一色になっている色を
  //CAD上の指定(上から赤/黄/緑)に上書きする
  useEffect(() => {
    LEDS.forEach(({ nodeName, color }) => {
      if (ledMaterialsRef.current[nodeName]) return;
      const node = nodesByName[nodeName];
      if (!node) return;
      const materials: MeshStandardMaterial[] = [];
      node.traverse(child => {
        const mesh = child as Mesh;
        if (!(mesh as Mesh).isMesh) return;
        const cloned = (mesh.material as MeshStandardMaterial).clone();
        cloned.color = new Color(color);
        cloned.emissive.copy(cloned.color);
        cloned.emissiveIntensity = 0;
        mesh.material = cloned;
        materials.push(cloned);
      });
      ledMaterialsRef.current[nodeName] = materials;
    });
  }, [nodesByName]);

  useFrame((_, delta) => {
    BUTTONS.forEach(({ nodeName }) => {
      const group = buttonGroupRefs.current[nodeName];
      const base = buttonBaseZRef.current[nodeName];
      if (!group || base === undefined) return;
      const targetZ = base + (pressedRef.current[nodeName] ? -PRESS_STROKE : 0);
      const current = group.position.z;
      const diff = targetZ - current;
      const step = PRESS_SPEED * delta;
      group.position.z = Math.abs(diff) <= step ? targetZ : current + Math.sign(diff) * step;
    });

    LEDS.forEach(({ nodeName, device }) => {
      const materials = ledMaterialsRef.current[nodeName];
      if (!materials) return;
      const intensity = deviceValueRef.current[device] ? EMISSIVE_INTENSITY_ON : 0;
      materials.forEach(mat => { mat.emissiveIntensity = intensity; });
    });
  });

  const press = (nodeName: string, device: string) => {
    pressedRef.current[nodeName] = true;
    setInputDevice(device, true);
  };
  const release = (nodeName: string, device: string) => {
    pressedRef.current[nodeName] = false;
    setInputDevice(device, false);
  };

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
        {BUTTONS.map(({ nodeName, device, label }) => (
          <group
            key={nodeName}
            ref={el => { buttonGroupRefs.current[nodeName] = el }}
            onPointerDown={e => { e.stopPropagation(); press(nodeName, device); }}
            onPointerUp={e => { e.stopPropagation(); release(nodeName, device); }}
            onPointerOver={e => { e.stopPropagation(); setHovered(nodeName); }}
            onPointerOut={() => { if (pressedRef.current[nodeName]) release(nodeName, device); setHovered(null); }}
          >
            {hovered === nodeName && <DeviceLabel label={`入力: ${device} (${label})`} />}
          </group>
        ))}
      </group>
    </group>
  )
}

useGLTF.preload(buttonPatlightUrl);

//押しボタン(X0/X1/X2)と積層信号灯(Y0/Y1/Y2)の入出力連携を確認するための操作盤
function ButtonPatlight() {
  return (
    <Canvas className="h-full w-full" camera={{ position: [5, 4, 8], fov: 50 }}>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 8, 5]} intensity={2} />
      <directionalLight position={[-5, 4, -5]} intensity={1} />
      <gridHelper args={[20, 20]} />

      <Suspense fallback={null}>
        <ButtonPatlightScene />
      </Suspense>

      <OrbitControls enableDamping={false} />
    </Canvas>
  )
}

export default ButtonPatlight
