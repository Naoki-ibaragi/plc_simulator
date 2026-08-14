import { Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { advance, Canvas, useFrame, useStore, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Vector3, type Group } from 'three'
import { RuntimeContext } from '../Runtime/RuntimeContext'
import { usePopupWindow } from '../PopupWindowContext'
import sensorCountUrl from './sensor_count.glb'

const MODEL_TARGET_SIZE = 3 //CADモデルの単位系(mm等)に関わらず、シーン内で見やすいサイズに正規化する
const CROSS_DURATION_SEC = 2.5 //ワークが開始位置からテーブル端まで移動するのにかかる時間

//sensor_count.glbのノード名
const TABLE_NODE = 'Table'
const WORK_NODE = 'Work' //+X方向に動かす対象
const EMIT_NODE = 'emit' //投光部
const RECEIVE_NODE = 'receive' //受光部

const SENSOR_DEVICE = 'X0' //光が遮られている間ONになる入力デバイス(カウント用センサーの検出信号)

function SensorCountScene() {
  const { setInputDevice } = useContext(RuntimeContext);
  const { scene } = useGLTF(sensorCountUrl) as unknown as { scene: Group };
  const rootScene = useThree(state => state.scene);
  const workGroupRef = useRef<Group>(null);
  const attachedRef = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const blockedRef = useRef(false);

  //useGLTFのscene/nodesはURL単位でキャッシュされ複数マウント間で共有されるため、
  //そのまま使うとattach()で行うノード付け替えが他インスタンス(NewWindowPortalの開閉で作られる別マウント)に
  //影響し、再オープン時にWorkが見つからなくなる。マウントごとに複製して独立したシーンとして扱う。
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  const { tableNode, workNode, emitNode, receiveNode } = useMemo(() => ({
    tableNode: clonedScene.getObjectByName(TABLE_NODE)!,
    workNode: clonedScene.getObjectByName(WORK_NODE)!,
    emitNode: clonedScene.getObjectByName(EMIT_NODE)!,
    receiveNode: clonedScene.getObjectByName(RECEIVE_NODE)!,
  }), [clonedScene]);

  //モデル付属のTable/Work/emit/receiveの配置から、ワークの移動範囲(開始位置〜テーブル端)と
  //光軸が遮られたとみなすXレンジを求める(Assembly直下は無回転のため、ワールド座標=ローカル座標として扱える)
  const { startX, endX, sensorMinX, sensorMaxX, emitPos, receivePos } = useMemo(() => {
    clonedScene.updateMatrixWorld(true);
    const tableBox = new Box3().setFromObject(tableNode);
    const workBox = new Box3().setFromObject(workNode);
    const workHalfX = (workBox.max.x - workBox.min.x) / 2;
    const emit = new Vector3();
    const receive = new Vector3();
    emitNode.getWorldPosition(emit);
    receiveNode.getWorldPosition(receive);
    emit.x += 0.007;
    receive.x += -0.005
    return {
      startX: workNode.position.x,
      endX: tableBox.max.x - workHalfX,
      sensorMinX: Math.min(emit.x, receive.x) - workHalfX,
      sensorMaxX: Math.max(emit.x, receive.x) + workHalfX,
      emitPos: emit,
      receivePos: receive,
    };
  }, [clonedScene, tableNode, workNode, emitNode, receiveNode]);

  //WorkノードをworkGroupRef(自コンポーネントが所有するグループ)へ付け替える。
  //複製後のシーン(このマウント専用)に対してのみ行うため、他マウントへは影響しない。
  useEffect(() => {
    if (attachedRef.current || !workGroupRef.current) return;
    rootScene.updateMatrixWorld(true);
    workGroupRef.current.attach(workNode);
    attachedRef.current = true;
  }, [workNode, rootScene]);

  //Workを一定速度で+X方向に動かし、テーブル端に到達したら開始位置へ戻して繰り返す。
  //workGroupRef.position.xは開始位置(startX)からの移動量(0〜endX-startX)として扱う
  //(attach()時点でworkGroupRefが原点にあるため、Work自身のローカル位置にstartXがそのまま保持される)。
  //光軸のXレンジにワークが重なっている間は遮光状態としてSENSOR_DEVICEをONにする。
  useFrame((_, delta) => {
    if (!workGroupRef.current) return;
    const travelDistance = endX - startX;
    const step = (travelDistance / CROSS_DURATION_SEC) * delta;
    const nextTravel = workGroupRef.current.position.x + step;
    workGroupRef.current.position.x = nextTravel >= travelDistance ? 0 : nextTravel;

    const worldX = workGroupRef.current.position.x + startX;
    const isBlocked = worldX >= sensorMinX && worldX <= sensorMaxX;
    if (isBlocked !== blockedRef.current) {
      blockedRef.current = isBlocked;
      setBlocked(isBlocked);
      setInputDevice(SENSOR_DEVICE, isBlocked);
    }
  });

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
        <group ref={workGroupRef} />
        <group
          onPointerOver={() => setIsHovered(true)}
          onPointerOut={() => setIsHovered(false)}
        >
          <Line
            points={[[emitPos.x, emitPos.y, emitPos.z], [receivePos.x, receivePos.y, receivePos.z]]}
            color={blocked ? '#ef4444' : '#fbbf24'}
            lineWidth={blocked ? 1 : 3}
            dashed={blocked}
            dashSize={0.01}
            gapSize={0.01}
          />
          <mesh position={[receivePos.x, receivePos.y, receivePos.z]}>
            <sphereGeometry args={[0.006, 16, 16]} />
            <meshStandardMaterial
              color={blocked ? '#7f1d1d' : '#fde047'}
              emissive={blocked ? '#000000' : '#fde047'}
              emissiveIntensity={blocked ? 0 : 1.5}
            />
            {isHovered && (
              <Html position={[0, 0.02, 0]} center style={{ pointerEvents: 'none' }}>
                <div className="whitespace-nowrap rounded bg-gray-900/80 px-2 py-1 text-xs text-white">
                  {`入力: ${SENSOR_DEVICE} (${blocked ? '遮光中' : '受光中'})`}
                </div>
              </Html>
            )}
          </mesh>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload(sensorCountUrl);

//react-three-fiberの既定の描画ループ(loop)はメインウィンドウのrequestAnimationFrameで駆動されており、
//ポップアップウィンドウ(NewWindowPortal)を最大化してメインウィンドウが完全に隠れると、ブラウザのウィンドウ占有検知
//によりそちらがスロットリングされ、Canvas自体は表示されたままアニメーションだけ止まって見える。
//ポップアップ表示時はCanvasの既定ループを止め(frameloop="never")、ポップアップ自身のrequestAnimationFrameで
//毎フレームadvance()を呼んで描画を進める。
function PopupFrameDriver({ win }: { win: Window }) {
  const store = useStore();

  useEffect(() => {
    let frameId = win.requestAnimationFrame(tick);
    function tick(timestamp: number) {
      //requestAnimationFrameのtimestampはミリ秒だが、frameloop="never"時のclock.elapsedTimeは秒基準のため変換する
      advance(timestamp / 1000, true, store.getState());
      frameId = win.requestAnimationFrame(tick);
    }
    return () => win.cancelAnimationFrame(frameId);
  }, [win, store]);

  return null;
}

function SensorCount() {
  const popupWindow = usePopupWindow();

  return (
    <Canvas
      className="h-full w-full"
      camera={{ position: [5, 4, 7], fov: 50 }}
      frameloop={popupWindow ? 'never' : 'always'}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1} />
      <gridHelper args={[20, 20]} />

      {popupWindow && <PopupFrameDriver win={popupWindow} />}

      <Suspense fallback={null}>
        <SensorCountScene />
      </Suspense>

      <OrbitControls enableDamping={false} />
    </Canvas>
  )
}

export default SensorCount
