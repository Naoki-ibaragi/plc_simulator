import { DoubleSide } from 'three'

//工場建屋風の背景(床・壁・柱・天井梁・照明)。外部テクスチャを使わずプリミティブのみで構成する。
//設備モデルはAssemblyModelScene側で底面がy=0、水平方向が原点中心になるよう正規化されている前提
export const FACTORY_HALF_SIZE = 20 //建屋の内寸(半幅)。OrbitControlsのmaxDistanceもこれを基準に壁の外に出ないよう制限する
const WALL_HEIGHT = 12
const PILLAR_INTERVAL = 8
const SAFETY_AREA_HALF = 6 //設備周囲の安全通路ライン(黄色)の半幅
const SAFETY_LINE_WIDTH = 0.12

const BACKGROUND_COLOR = '#3a3f44'
const FLOOR_COLOR = '#7a7f84'
const WALL_COLOR = '#9aa0a6'
const WAINSCOT_COLOR = '#5d666e' //壁下部の腰壁(汚れが目立たないよう濃色に塗られることが多い)
const STEEL_COLOR = '#4a5058'
const SAFETY_COLOR = '#e8b923'

const pillarPositions = (() => {
  const positions: number[] = []
  for (let p = -FACTORY_HALF_SIZE; p <= FACTORY_HALF_SIZE; p += PILLAR_INTERVAL) positions.push(p)
  return positions
})()

//壁1面分(腰壁・パネル目地・柱を含む)。rotationYで4面に回して配置する
function Wall({ rotationY }: { rotationY: number }) {
  const size = FACTORY_HALF_SIZE * 2
  return (
    <group rotation={[0, rotationY, 0]}>
      <group position={[0, 0, -FACTORY_HALF_SIZE]}>
        <mesh position={[0, WALL_HEIGHT / 2, 0]}>
          <planeGeometry args={[size, WALL_HEIGHT]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.85} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.75, 0.01]}>
          <planeGeometry args={[size, 1.5]} />
          <meshStandardMaterial color={WAINSCOT_COLOR} roughness={0.9} />
        </mesh>
        {/* 折板(金属サイディング)の横目地 */}
        {[3, 5, 7, 9, 11].map(y => (
          <mesh key={y} position={[0, y, 0.02]}>
            <boxGeometry args={[size, 0.04, 0.02]} />
            <meshStandardMaterial color={STEEL_COLOR} />
          </mesh>
        ))}
        {pillarPositions.map(x => (
          <mesh key={x} position={[x, WALL_HEIGHT / 2, 0.2]}>
            <boxGeometry args={[0.4, WALL_HEIGHT, 0.4]} />
            <meshStandardMaterial color={STEEL_COLOR} roughness={0.6} metalness={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

//床に貼る黄色の安全通路ライン(設備エリアを囲む矩形)
function SafetyLines() {
  const len = SAFETY_AREA_HALF * 2 + SAFETY_LINE_WIDTH
  const lines: { position: [number, number, number]; size: [number, number] }[] = [
    { position: [0, 0.002, -SAFETY_AREA_HALF], size: [len, SAFETY_LINE_WIDTH] },
    { position: [0, 0.002, SAFETY_AREA_HALF], size: [len, SAFETY_LINE_WIDTH] },
    { position: [-SAFETY_AREA_HALF, 0.002, 0], size: [SAFETY_LINE_WIDTH, len] },
    { position: [SAFETY_AREA_HALF, 0.002, 0], size: [SAFETY_LINE_WIDTH, len] },
  ]
  return (
    <>
      {lines.map((line, i) => (
        <mesh key={i} position={line.position} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={line.size} />
          <meshStandardMaterial color={SAFETY_COLOR} roughness={0.7} />
        </mesh>
      ))}
    </>
  )
}

export function FactoryEnvironment() {
  const size = FACTORY_HALF_SIZE * 2
  return (
    <>
      <color attach="background" args={[BACKGROUND_COLOR]} />
      <fog attach="fog" args={[BACKGROUND_COLOR, 25, 60]} />

      {/* 床(コンクリート/塗床) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} metalness={0} />
      </mesh>
      {/* 床の目地。スケール感の目安として従来のグリッドも兼ねる */}
      <gridHelper args={[size, size / 2, '#62676c', '#6a6f74']} position={[0, 0.001, 0]} />
      <SafetyLines />

      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map(r => <Wall key={r} rotationY={r} />)}

      {/* 天井と梁 */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={STEEL_COLOR} side={DoubleSide} roughness={0.9} />
      </mesh>
      {pillarPositions.map(z => (
        <mesh key={z} position={[0, WALL_HEIGHT - 0.3, z]}>
          <boxGeometry args={[size, 0.6, 0.3]} />
          <meshStandardMaterial color={STEEL_COLOR} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      {/* 天井照明(発光体の見た目のみ。実際の照明はCanvas側のライトで行う) */}
      {pillarPositions.slice(0, -1).map(z => [-8, 0, 8].map(x => (
        <mesh key={`${x}_${z}`} position={[x, WALL_HEIGHT - 0.65, z + PILLAR_INTERVAL / 2]}>
          <boxGeometry args={[3, 0.08, 0.4]} />
          <meshStandardMaterial color="#ffffff" emissive="#f4f8ff" emissiveIntensity={1.2} />
        </mesh>
      )))}
    </>
  )
}
