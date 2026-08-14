import { Link } from 'react-router-dom'
import { equipmentList } from './Equipment/registry'

//設備モデルの選択画面。ここで選んだ設備モデルに対応するラダーページ(/ladder/:equipmentId)へ遷移する
function MainPage() {
  return (
    <div className='flex h-screen flex-col items-center justify-center gap-8 bg-gray-50'>
      <h1 className='text-2xl font-bold text-gray-800'>設備モデルを選択してください</h1>
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
    </div>
  )
}

export default MainPage
