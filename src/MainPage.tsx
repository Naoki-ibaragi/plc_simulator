import { Link } from 'react-router-dom'
import { equipmentList } from './Equipment/registry'

const aboutLinks = [
  { to: '/aboutPLC', label: 'PLCとは' },
  { to: '/aboutLadder', label: 'ラダー言語とは' },
  { to: '/aboutDevice', label: 'デバイスとは' },
  { to: '/aboutTouchpanel', label: 'タッチパネルとは' },
]

const upcomingTopics = ['パルス', '自己保持回路', '数値演算', 'タイマー', '応用編']

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className='mb-4 text-lg font-bold text-gray-900'>{children}</h2>
  )
}

//設備モデルの選択画面。ここで選んだ設備モデルに対応するラダーページ(/ladder/:equipmentId)へ遷移する
function MainPage() {
  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='mx-auto max-w-4xl px-6 py-12 sm:px-8'>
        <header className='mb-12 text-center'>
          <h1 className='text-3xl font-bold tracking-tight text-gray-900'>PLC学習シミュレータ</h1>
          <p className='mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-600'>
            このサイトはPLCビギナーに向けた学習サイトです。
            メニュー一覧をこなすことでPLCの概要を理解できるような構成になっています。
            ブラウザ上で設備シミュレータを作成していますので直感的にPLCを理解できます。
          </p>
        </header>

        <section className='mb-12'>
          <SectionHeading>学習を始める前にPLCについてもう一度おさらいしましょう</SectionHeading>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            {aboutLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className='flex h-20 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-center text-sm font-medium text-gray-700 shadow-sm transition hover:border-blue-500 hover:text-blue-600 hover:shadow-md'
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>

        <section className='mb-12'>
          <SectionHeading>ラダーシミュレーション</SectionHeading>
          <Link to={'/aboutSimulation'} className='mb-4 inline-block text-sm text-blue-600 hover:underline'>
            ・当サイトのシミュレータについて
          </Link>
          <p className='mb-4 text-sm font-medium text-gray-500'>A接点・B接点・コイル</p>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
            {equipmentList.map(equipment => (
              <Link
                key={equipment.id}
                to={`/ladder/${equipment.id}`}
                className='flex h-32 w-full flex-col items-center justify-center rounded-lg border border-gray-300 bg-white text-center text-lg font-medium text-gray-700 shadow-sm transition hover:border-blue-500 hover:text-blue-600 hover:shadow-md'
              >
                {equipment.label}
              </Link>
            ))}
          </div>
        </section>

        <section className='mb-12'>
          <SectionHeading>これから学べるようになる内容</SectionHeading>
          <div className='flex flex-wrap gap-2'>
            {upcomingTopics.map(topic => (
              <span
                key={topic}
                className='rounded-full border border-dashed border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-400'
              >
                {topic}(準備中)
              </span>
            ))}
          </div>
        </section>

        <footer className='text-center'>
          <Link
            to={'/afterClass'}
            className='inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md'
          >
            最後に
            <span aria-hidden>→</span>
          </Link>
        </footer>
      </div>
    </div>
  )
}

export default MainPage
