import { useContext, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { type Mesh } from 'three'
import { RuntimeContext } from '../Runtime/RuntimeContext'

//マウスオーバー時に表示するデバイス名ラベル
function DeviceLabel({ label }: { label: string }) {
  return (
    <Html position={[0, 0.4, 0]} center style={{ pointerEvents: 'none' }}>
      <div className="whitespace-nowrap rounded bg-gray-900/80 px-2 py-1 text-xs text-white">
        {label}
      </div>
    </Html>
  )
}

const SWITCH_DEVICE = 'X0' //押している間だけONになる入力デバイス
const LAMP_DEVICE = 'Y0' //点灯状態を表示する出力デバイス
const SWITCH_BASE_Y = 0.2
const SWITCH_PRESSED_Y = 0 //押し込まれた時のY位置
const PRESS_SPEED = 12 //1秒あたりの追従速度

//押している間だけX0をONにするMOMENTARY相当のスイッチ。押すとY方向に押し込まれる。
function Switch() {
  const { setInputDevice } = useContext(RuntimeContext);
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const meshRef = useRef<Mesh>(null);

  const press = () => { setIsPressed(true); setInputDevice(SWITCH_DEVICE, true); };
  const release = () => { setIsPressed(false); setInputDevice(SWITCH_DEVICE, false); };

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const targetY = isPressed ? SWITCH_PRESSED_Y : SWITCH_BASE_Y;
    const current = meshRef.current.position.y;
    const diff = targetY - current;
    const step = PRESS_SPEED * delta;
    meshRef.current.position.y = Math.abs(diff) <= step ? targetY : current + Math.sign(diff) * step;
  });

  return (
    <mesh
      ref={meshRef}
      position={[-1, SWITCH_BASE_Y,0]}
      onPointerDown={press}
      onPointerUp={release}
      onPointerOver={() => setIsHovered(true)}
      onPointerOut={() => { isPressed && release(); setIsHovered(false); }}
    >
      <boxGeometry args={[0.5, 0.3, 0.5]} />
      <meshStandardMaterial color={isPressed ? '#22c55e':'#15803d' } />
      {isHovered && <DeviceLabel label={`入力: ${SWITCH_DEVICE}`} />}
    </mesh>
  )
}

//Y0がONの間だけ発光するランプ
function Lamp() {
  const { deviceValue } = useContext(RuntimeContext);
  const [isHovered, setIsHovered] = useState(false);
  const isOn = !!deviceValue[LAMP_DEVICE];

  return (
    <mesh
      position={[1, 0.4, 0]}
      onPointerOver={() => setIsHovered(true)}
      onPointerOut={() => setIsHovered(false)}
    >
      <sphereGeometry args={[0.3, 32, 32]} />
      <meshStandardMaterial
        color={isOn ? '#fde047' : '#57534e'}
        emissive={isOn ? '#fde047' : '#000000'}
        emissiveIntensity={isOn ? 1.5 : 0}
      />
      {isHovered && <DeviceLabel label={`出力: ${LAMP_DEVICE}`} />}
    </mesh>
  )
}

//スイッチとランプでの入出力連携を確認するための操作パネル
function ControlPanel() {
  return (
    <Canvas className="h-full w-full" camera={{ position: [3, 3, 5], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1} />
      <gridHelper args={[10, 10]} />

      {/* 台座 */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[3, 0.1, 1.5]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>

      <Switch />
      <Lamp />

      <OrbitControls />
    </Canvas>
  )
}

export default ControlPanel
