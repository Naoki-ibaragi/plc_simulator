import React from 'react'

function MainMenu(
    { displayPage, setDisplayPage }:
    {
        displayPage: number,
        setDisplayPage: React.Dispatch<React.SetStateAction<number>>
    }
) {
  const tabClass = (page: number) => `
    px-4 py-2
    text-sm
    font-medium
    rounded-md
    transition
    ${displayPage === page
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-gray-600 hover:bg-gray-100'}
  `;

  return (
    <div className='fixed top-0 left-0 right-72 z-40 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2'>
      <button type='button' className={tabClass(1)} onClick={() => setDisplayPage(1)}>
        ラダー図
      </button>
      <button type='button' className={tabClass(2)} onClick={() => setDisplayPage(2)}>
        タッチパネル
      </button>
    </div>
  )
}

export default MainMenu
