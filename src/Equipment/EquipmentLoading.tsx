//設備モデル(GLTF)の読み込み中に表示するインジケータ。モデルサイズによっては読み込みに数秒かかるため、
//何も表示されない空白時間ができてユーザーが固まったと誤解しないようにする
function EquipmentLoading() {
  return (
    <div className='flex h-full w-full flex-col items-center justify-center gap-3 bg-gray-50 text-gray-500'>
      <div className='h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600' />
      <p className='text-sm font-medium'>設備モデルを読み込み中...</p>
    </div>
  )
}

export default EquipmentLoading
