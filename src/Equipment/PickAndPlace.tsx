import { Suspense, useContext, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Vector3, type Group, type Object3D } from 'three'
import { RuntimeContext } from '../Runtime/RuntimeContext'

const pickAndPlaceUrl = '/pickandplace.glb' //publicフォルダ配置(サイズが大きくバンドラーのアセット処理を通すと失敗するため)

const MODEL_TARGET_SIZE = 3 //CADモデルの単位系(mm等)に関わらず、シーン内で見やすい最大辺長に正規化する
const Z_DEVICE = 'Y0' //Zスライドを駆動するデバイス
const Z_STROKE = -0.075 //Zスライドのストローク量(m)。Air_Slide_Cylinder_16x75の型番(ストローク75mm)に合わせる
const MOVE_SPEED = 0.3 //1秒あたりの追従速度(m/s相当、正規化前の実寸ベース)

//Z軸方向にまとめて動かす対象ノード名: スライドシリンダーの可動テーブル部分 + 2つのハンド(グリッパー)一式
const MOVING_NODE_NAMES = [
  '0576_Z_Air_Slide_Cylinder_16x75_5',
  '_0576_SA03',
  '_0576_SA04',
]

function PickAndPlaceScene() {
  const { deviceValue } = useContext(RuntimeContext);
  const { scene, nodes } = useGLTF(pickAndPlaceUrl) as unknown as { scene: Group, nodes: Record<string, Object3D> };
  const rootScene = useThree(state => state.scene);
  const movingGroupRef = useRef<Group>(null);
  const attachedRef = useRef(false);

  //初回のみ、対象ノードを現在の世界座標を保ったまま可動グループへ付け替える(three.jsのattach()は再親付け時に見た目の位置がずれないよう local変換を自動調整してくれる)
  useEffect(() => {
    if (attachedRef.current || !movingGroupRef.current) return;
    rootScene.updateMatrixWorld(true);
    MOVING_NODE_NAMES.forEach(name => {
      const node = nodes[name];
      if (node) movingGroupRef.current!.attach(node);
    });
    attachedRef.current = true;
  }, [nodes, rootScene]);

  //単位系(mm等)・原点位置に関わらず、シーン内で見やすいサイズ・位置になるスケールとオフセットを求める
  //(X/Zは中心を原点に、Yはグリッド(Y=0)にモデルの最下部が乗るように最小値を原点に合わせる)
  const { scale, offset } = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const size = new Vector3();
    box.getSize(size);
    const center = new Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return { scale: MODEL_TARGET_SIZE / maxDim, offset: new Vector3(-center.x, -box.min.y, -center.z) };
  }, [scene]);

  //CAD側のZ軸(上下方向)はエクスポート時にthree.jsのY軸に割り当てられているため、position.yを動かす
  useFrame((_, delta) => {
    if (!movingGroupRef.current) return;
    const targetZ = deviceValue[Z_DEVICE] ? Z_STROKE : 0;
    const current = movingGroupRef.current.position.y;
    const diff = targetZ - current;
    const step = MOVE_SPEED * delta;
    movingGroupRef.current.position.y = Math.abs(diff) <= step ? targetZ : current + Math.sign(diff) * step;
  });

  return (
    <group scale={scale}>
      <group position={[offset.x, offset.y, offset.z]}>
        <primitive object={scene} />
        <group ref={movingGroupRef} />
      </group>
    </group>
  )
}

useGLTF.preload(pickAndPlaceUrl);

function PickAndPlace() {
  return (
    <Canvas className="h-full w-full" camera={{ position: [5, 5, 8], fov: 50 }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 8, 5]} intensity={2} />
      <directionalLight position={[-5, 4, -5]} intensity={0.8} />
      <gridHelper args={[20, 20]} />

      <Suspense fallback={null}>
        <PickAndPlaceScene />
        {/* マテリアルがメタリック(既定値)のため、環境マップが無いと反射光が無く暗く見える */}
        <Environment preset="city" />
      </Suspense>

      <OrbitControls enableDamping={false} />
    </Canvas>
  )
}

export default PickAndPlace
