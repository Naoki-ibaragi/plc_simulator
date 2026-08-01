import { useContext, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { type Mesh } from 'three'
import { RuntimeContext } from '../Runtime/RuntimeContext'

const WORK_DEVICE = 'Y0' //ワークの位置を制御するデバイス
const LEFT_X = -1.5
const RIGHT_X = 1.5
const MOVE_SPEED = 4 //1秒あたりの追従速度(m/s相当)

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

      <OrbitControls />
    </Canvas>
  )
}

export default Equipment
