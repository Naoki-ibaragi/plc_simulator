import { Suspense, useContext, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Vector3, type Group, type Mesh, type Object3D } from 'three'
import { RuntimeContext } from '../Runtime/RuntimeContext'
import cylinder3Url from './cylinder3.glb'

const WORK_DEVICE = 'Y0' //ワークの位置を制御するデバイス
const LEFT_X = -1.5
const RIGHT_X = 1.5
const MOVE_SPEED = 4 //1秒あたりの追従速度(m/s相当)
const MOVE_SPEED_ROD = 1 //1秒あたりの追従速度(m/s相当)
const CYLINDER_TARGET_SIZE = 2 //CADモデルの単位系(mm等)に関わらず、シーン内で見やすい最大辺長に正規化する

//cylinder3.glbのノード名(BODY/ROD/ナットは個別ノードなので、ロッドだけを独立して動かせる)
const BODY_NODE = 'CG1BA20-35Z-A93(0)_BODY'
const ROD_NODE = 'CG120-35Z-(0)_ROD'
const ROD_NUT_NODE = 'NT-02-25A-CG1' //ロッド先端のナット。ロッドと一緒に動かす
const BRACKET_NODES = ['CG1-Z_A93_BMA2-020_BJ3-1(20-35)', 'CG1-Z_A93_BMA2-020_BJ3-1(20-35)001'] //取付ブラケット。本体側に固定
const ROD_STROKE = 0.035 //ロッドのストローク量(m)。CG1BA20-35のカタログ値(35mm)に合わせる
const ROD_DEVICE = 'Y0'

//Y0のON/OFFに応じて台座の左右へ滑らかに移動するワーク
function Workpiece() {
  const { deviceValue } = useContext(RuntimeContext);
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const targetX = deviceValue[WORK_DEVICE] ? RIGHT_X : LEFT_X;
    const current = meshRef.current.position.x;
    const diff = targetX - current;
    const step = MOVE_SPEED * delta;
    meshRef.current.position.x = Math.abs(diff) <= step ? targetX : current + Math.sign(diff) * step;
  });

  return (
    <mesh ref={meshRef} position={[LEFT_X, 0.75, 0]}>
      <sphereGeometry args={[0.25, 32, 32]} />
      <meshStandardMaterial color="#f97316" />
    </mesh>
  )
}

//cylinder3.glbを読み込み、ロッド(+ナット)だけをY0のON/OFFに応じてストロークさせる。
//本体・取付ブラケットは静止させたまま、ロッドを含むノードのみ別グループに分離して動かす。
function CylinderRodModel() {
  const { deviceValue } = useContext(RuntimeContext);
  const { scene, nodes } = useGLTF(cylinder3Url) as unknown as { scene: Group, nodes: Record<string, Object3D> };
  const rodGroupRef = useRef<Group>(null);

  //元モデルの単位系(mm等)・原点位置に関わらず、シーン内で見やすいサイズ・中心になるスケールとオフセットを求める
  const { scale, offset } = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const size = new Vector3();
    box.getSize(size);
    const center = new Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return { scale: CYLINDER_TARGET_SIZE / maxDim, offset: center.multiplyScalar(-1) };
  }, [scene]);

  useFrame((_, delta) => {
    if (!rodGroupRef.current) return;
    const targetX = deviceValue[ROD_DEVICE] ? -ROD_STROKE : 0;
    const current = rodGroupRef.current.position.x;
    const diff = targetX - current;
    const step = MOVE_SPEED_ROD * delta;
    rodGroupRef.current.position.x = Math.abs(diff) <= step ? targetX : current + Math.sign(diff) * step;
  });

  const bodyNode = nodes[BODY_NODE];
  const rodNode = nodes[ROD_NODE];
  const nutNode = nodes[ROD_NUT_NODE];

  return (
    <group position={[0, 1.2, -1.2]} scale={scale}>
      <group position={[offset.x, offset.y, offset.z]}>
        {bodyNode && <primitive object={bodyNode} />}
        {BRACKET_NODES.map(name => {
          const bracket = nodes[name];
          return bracket ? <primitive key={name} object={bracket} /> : null;
        })}
        <group ref={rodGroupRef}>
          {rodNode && <primitive object={rodNode} />}
          {nutNode && <primitive object={nutNode} />}
        </group>
      </group>
    </group>
  )
}

useGLTF.preload(cylinder3Url);

function Equipment() {
  return (
    <Canvas className="h-full w-full" camera={{ position: [4, 4, 6], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1} />
      <gridHelper args={[20, 20]} />

      {/* 台座 */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[4, 0.5, 1]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>

      <Workpiece />
      <Suspense fallback={null}>
        <CylinderRodModel />
      </Suspense>

      <OrbitControls enableDamping={false} />
    </Canvas>
  )
}

export default Equipment
