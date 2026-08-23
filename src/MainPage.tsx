import { Link } from 'react-router-dom'
import { equipmentList } from './Equipment/registry'

//設備モデルの選択画面。ここで選んだ設備モデルに対応するラダーページ(/ladder/:equipmentId)へ遷移する
function MainPage() {
  return (
    <div className='flex flex-col items-center justify-center gap-8 bg-gray-50'>
      <div className='w-[60%] mt-5'>
        このサイトはPLCビギナーに向けた学習サイトです<br/>
        メニュー一覧をこなすことでPLCの概要を理解できるような構成になっています<br/>
        ブラウザ上で設備シミュレータを作成していますので直感的にPLCを理解できます
      </div>
      <div className=''>
        <div className='mb-2'>学習を始める前にPLCについてもう一度おさらいしましょう</div>
        <div className='flex flex-col gap-2'>
          <Link to={"/aboutPLC"} className='text-l text-gray-800'>・PLCとは</Link>
          <Link to={"/aboutLadder"} className='text-l text-gray-800'>・ラダー言語とは</Link>
          <Link to={"/aboutDevice"} className='text-l text-gray-800'>・デバイスとは</Link>
          <Link to={"/aboutTouchpanel"} className='text-l text-gray-800'>・タッチパネルとは</Link>
        </div>
      </div>
      <div>
      </div>
      <h1 className='text-xl text-gray-800'>ラダーシミュレーション</h1>
      <Link to={"/aboutSimulation"} className='text-l text-gray-800'>・当サイトのシミュレータについて</Link>
      <div>A接点・B接点・コイル</div>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
        {equipmentList.map(equipment => (
          <Link
            key={equipment.id}
            to={`/ladder/${equipment.id}`}
            className='flex h-32 w-44 flex-col items-center justify-center rounded-lg border border-gray-300 bg-white text-center text-lg font-medium text-gray-700 shadow-sm transition hover:border-blue-500 hover:text-blue-600 hover:shadow-md'
          >
            {equipment.label}
          </Link>
        ))}
      </div>
      <div>パルス</div>
      <div>自己保持回路</div>
      <div>数値演算</div>
      <div>タイマー</div>
      <div>応用編</div>

      <Link to={"/afterClass"} className='text-l text-gray-800'>最後に</Link>
    </div>
  )
}

export default MainPage
