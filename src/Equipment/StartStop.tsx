import { Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Vector3, type Group, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { RuntimeContext } from '../Runtime/RuntimeContext'
import startStopUrl from './start_stop.glb'

const MODEL_TARGET_SIZE = 3 //CADモデルの単位系(mm等)に関わらず、シーン内で見やすい最大辺長に正規化する

//ボタンキャップは実測でモデルのワールドZ軸方向にのみヘッドユニット本体から突出している(X/Yは断面径のみで突出なし)
//ため、押し込みアニメーションはこの軸で実装する
const PRESS_STROKE = 0.0035 //ボタンの押し込み量(m)。A3KA_51W_05Eヘッドユニットの実測突出量(約3.5mm)=ベゼルと面一になる量
const PRESS_SPEED = 0.02 //1秒あたりの追従速度(m/s相当)
const EMISSIVE_INTENSITY_ON = 1.5

//元モデルのマテリアルはmetallic/roughnessが既定値(共に1.0)のままエクスポートされており、
//環境マップなしのシンプルな平行光+環境光だけでは金属反射しか起きずCAD上の見た目より暗く沈む。
//塗装された樹脂/金属パネルに近い見た目になるよう明示的に上書きする
const MATERIAL_METALNESS = 0.3
const MATERIAL_ROUGHNESS = 0.5

//押しボタン(ノード名, 対応する入力デバイス)。クリックのたびに押し込み状態がトグルする自己保持型スイッチ
const BUTTONS = [
  { nodeName: 'A3SA_5600', device: 'X0' },
  { nodeName: 'A3SA_5601', device: 'X1' },
] as const

//MOVE_BLOCKのY0連動での往復運動(ローカルX方向。LX1502リニアスライドのレール可動範囲内)
const MOVE_DEVICE = 'Y0'
const MOVE_BLOCK_NODE = 'MOVE_BLOCK'
const MOVE_MIN_X = 0.005 //ブラケット側の可動端(実測レール範囲より内側の安全マージン込み)
const MOVE_MAX_X = 0.050 //エンドプレート側の可動端
const MOVE_SPEED = 0.02 //1秒あたりの追従速度(m/s相当)

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

function StartStopScene() {
  const { setInputDevice, deviceValue } = useContext(RuntimeContext);
  const { scene } = useGLTF(startStopUrl) as unknown as { scene: Group };
  const rootScene = useThree(state => state.scene);
  const attachedRef = useRef(false);
  const materialsNormalizedRef = useRef(false);
  const toggledRef = useRef<Record<string, boolean>>({});
  const buttonBaseZRef = useRef<Record<string, number>>({});
  const buttonGroupRefs = useRef<Record<string, Group | null>>({});
  const buttonMaterialsRef = useRef<Record<string, MeshStandardMaterial[]>>({});
  const moveBlockRef = useRef<Object3D | null>(null);
  const moveDirRef = useRef(1);
  const [hovered, setHovered] = useState<string | null>(null);

  //useGLTFのscene/nodesはURL単位でキャッシュされ複数マウント間で共有されるため、
  //そのまま使うとattach()で行うノード付け替えが他インスタンスに影響してしまう。マウントごとに複製して独立させる。
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  const nodesByName = useMemo(() => {
    const map: Record<string, Object3D> = {};
    [...BUTTONS.map(b => b.nodeName), MOVE_BLOCK_NODE].forEach(name => {
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

  //ボタンキャップのマテリアルは他パーツと共有されていないため複製不要。押し込み時に自発光するよう初期化するのみ
  useEffect(() => {
    BUTTONS.forEach(({ nodeName }) => {
      if (buttonMaterialsRef.current[nodeName]) return;
      const node = nodesByName[nodeName];
      if (!node) return;
      const materials: MeshStandardMaterial[] = [];
      node.traverse(child => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as MeshStandardMaterial;
        mat.emissive.copy(mat.color);
        mat.emissiveIntensity = 0;
        materials.push(mat);
      });
      buttonMaterialsRef.current[nodeName] = materials;
    });
    moveBlockRef.current = nodesByName[MOVE_BLOCK_NODE] ?? null;
  }, [nodesByName]);

  useFrame((_, delta) => {
    BUTTONS.forEach(({ nodeName }) => {
      const group = buttonGroupRefs.current[nodeName];
      const base = buttonBaseZRef.current[nodeName];
      const isToggled = !!toggledRef.current[nodeName];
      if (group && base !== undefined) {
        const targetZ = base + (isToggled ? PRESS_STROKE : 0);
        const current = group.position.z;
        const diff = targetZ - current;
        const step = PRESS_SPEED * delta;
        group.position.z = Math.abs(diff) <= step ? targetZ : current + Math.sign(diff) * step;
      }
      const materials = buttonMaterialsRef.current[nodeName];
      if (materials) {
        const intensity = isToggled ? EMISSIVE_INTENSITY_ON : 0;
        materials.forEach(mat => { mat.emissiveIntensity = intensity; });
      }
    });

    //Y0がONの間、MOVE_BLOCKをレール可動範囲内で往復させる。OFFになった時点の位置で停止する
    const moveNode = moveBlockRef.current;
    if (moveNode && deviceValue[MOVE_DEVICE]) {
      const nextX = moveNode.position.x + moveDirRef.current * MOVE_SPEED * delta;
      if (nextX >= MOVE_MAX_X) {
        moveNode.position.x = MOVE_MAX_X;
        moveDirRef.current = -1;
      } else if (nextX <= MOVE_MIN_X) {
        moveNode.position.x = MOVE_MIN_X;
        moveDirRef.current = 1;
      } else {
        moveNode.position.x = nextX;
      }
    }
  });

  //クリックのたびに押し込み状態をトグルし、対応する入力デバイスをON/OFFする(自己保持型スイッチ)
  const toggle = (nodeName: string, device: string) => {
    const next = !toggledRef.current[nodeName];
    toggledRef.current[nodeName] = next;
    setInputDevice(device, next);
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
        {BUTTONS.map(({ nodeName, device }) => (
          <group
            key={nodeName}
            ref={el => { buttonGroupRefs.current[nodeName] = el }}
            onClick={e => { e.stopPropagation(); toggle(nodeName, device); }}
            onPointerOver={e => { e.stopPropagation(); setHovered(nodeName); }}
            onPointerOut={() => setHovered(null)}
          >
            {hovered === nodeName && <DeviceLabel label={`入力: ${device} (${nodeName})`} />}
          </group>
        ))}
      </group>
    </group>
  )
}

useGLTF.preload(startStopUrl);

//自己保持型の押しボタン(X0/X1)とリニアスライド(Y0)の入出力連携を確認するための操作盤
function StartStop() {
  return (
    <Canvas className="h-full w-full" camera={{ position: [4, 4, 7], fov: 50 }}>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 8, 5]} intensity={2} />
      <directionalLight position={[-5, 4, -5]} intensity={1} />
      <gridHelper args={[20, 20]} />

      <Suspense fallback={null}>
        <StartStopScene />
        {/* マテリアルがメタリック寄りのため、環境マップが無いと反射光が無く暗く見える */}
        <Environment preset="city" />
      </Suspense>

      <OrbitControls enableDamping={false} />
    </Canvas>
  )
}

export default StartStop
