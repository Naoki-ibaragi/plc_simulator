import React from 'react'
import { Link } from 'react-router-dom'
import { type kvLinkStatus, type runMode } from './Runtime/RuntimeContext'

function MainMenu(
    {
        equipmentLabel,
        showTouchPanel, setShowTouchPanel,
        showLadder, setShowLadder,
        mode, tryEnterRun, exitToEdit,
        kvLink,
        showIoMap, setShowIoMap,
    }:
    {
        equipmentLabel: string,
        showTouchPanel: boolean,
        setShowTouchPanel: React.Dispatch<React.SetStateAction<boolean>>,
        showLadder: boolean,
        setShowLadder: React.Dispatch<React.SetStateAction<boolean>>,
        mode: runMode,
        tryEnterRun: () => void,
        exitToEdit: () => void,
        kvLink: kvLinkStatus,
        showIoMap: boolean,
        setShowIoMap: React.Dispatch<React.SetStateAction<boolean>>,
    }
) {
  const fileButtonClass = `
    px-2 py-1
    text-xs
    font-medium
    rounded-md
    border border-gray-300
    text-gray-600
    transition
    hover:bg-gray-100
  `;

  const tabClass = (active: boolean) => `
    px-4 py-2
    text-sm
    font-medium
    rounded-md
    transition
    disabled:opacity-60
    disabled:cursor-not-allowed
    ${active
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-gray-600 hover:bg-gray-100'}
  `;

  return (
    <div className='flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2'>
      <Link to='/' className={fileButtonClass} title='設備一覧に戻る'>
        ← 設備一覧
      </Link>
      <span className='text-sm font-medium text-gray-500'>{equipmentLabel}</span>
      <span className='mx-1 h-6 w-px bg-gray-200' />
      <button type='button' className={tabClass(showTouchPanel)} disabled={showTouchPanel} onClick={() => setShowTouchPanel(true)}>
        タッチパネル{showTouchPanel ? '(表示中)' : ''}
      </button>
      <button type='button' className={tabClass(showLadder)} disabled={showLadder} onClick={() => setShowLadder(true)}>
        ラダー{showLadder ? '(表示中)' : ''}
      </button>
      {/* I/O割付はKV連携でのみ使うため、Tauri版でのみ表示する */}
      {kvLink.available && (
        <button type='button' className={tabClass(showIoMap)} disabled={showIoMap} onClick={() => setShowIoMap(true)}>
          I/O割付{showIoMap ? '(表示中)' : ''}
        </button>
      )}
      <span className='mx-2 h-6 w-px bg-gray-200' />
      {mode === 'EDIT' ? (
        <button
          type='button'
          onClick={tryEnterRun}
          className='px-4 py-2 text-sm font-medium rounded-md transition bg-green-600 text-white shadow-sm hover:bg-green-700'
        >
          ▶ 実行
        </button>
      ) : (
        <button
          type='button'
          onClick={exitToEdit}
          className='px-4 py-2 text-sm font-medium rounded-md transition bg-red-600 text-white shadow-sm hover:bg-red-700'
        >
          {kvLink.active ? '■ KV連携を終了' : '■ 編集に戻る'}
        </button>
      )}
      {/* KV STUDIOシミュレータとの連携はTauri版でのみ使える */}
      {kvLink.available && mode === 'EDIT' && (
        <button
          type='button'
          onClick={kvLink.connect}
          disabled={kvLink.connecting}
          title='KV STUDIOのシミュレータ(127.0.0.1:8501)に上位リンクで接続し、設備をKVのラダーで動かします'
          className='px-4 py-2 text-sm font-medium rounded-md transition bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-wait'
        >
          {kvLink.connecting ? 'KVに接続中…' : '⇄ KV連携'}
        </button>
      )}
      {kvLink.active && (
        <span className='rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700'>KV連携中</span>
      )}
      {kvLink.error && (
        <span className='min-w-0 truncate text-xs text-red-600' title={kvLink.error}>{kvLink.error}</span>
      )}
    </div>
  )
}

export default MainMenu
