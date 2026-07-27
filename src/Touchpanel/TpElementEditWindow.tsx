import { useContext, useEffect, useState } from 'react'
import { TpContext } from './TpContext'
import type { colorName, buttonType } from './TpVariants'

const COLOR_OPTIONS: colorName[] = ["red", "green", "blue", "yellow"];
const BUTTON_TYPE_OPTIONS: buttonType[] = ["MOMENTARY", "NOT"];

function TpElementEditWindow() {
  const tpStatus = useContext(TpContext);
  const element = tpStatus.tpElements.find(el => el.id === tpStatus.selectedElementId) ?? null;

  const [color, setColor] = useState<colorName>("red");
  const [bitDevice, setBitDevice] = useState("");
  const [btnType, setBtnType] = useState<buttonType>("MOMENTARY");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!element) return;
    setColor(element.color);
    if (element.elementType === "BUTTON") setBtnType(element.buttonType);
    if (element.elementType === "TEXT") {
      setContent(element.content);
    } else {
      setBitDevice(element.bitDevice);
    }
  }, [element]);

  if (!tpStatus.isEditOpen || !element) return null;

  const handleSave = () => {
    tpStatus.setTpElements(prev => prev.map(el => {
      if (el.id !== element.id) return el;
      if (el.elementType === "BUTTON") return { ...el, color, bitDevice, buttonType: btnType };
      if (el.elementType === "TEXT") return { ...el, color, content };
      return { ...el, color, bitDevice };
    }));
    tpStatus.setIsEditOpen(false);
  };

  const handleDelete = () => {
    tpStatus.setTpElements(prev => prev.filter(el => el.id !== element.id));
    tpStatus.setIsEditOpen(false);
  };

  return (
    <div
      data-tp-edit-window
      className='fixed z-100 w-64 rounded-xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden'
      style={{ left: tpStatus.editX, top: tpStatus.editY }}
    >
      <div className='flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200'>
        <span className='text-sm font-medium text-gray-700'>
          {element.elementType === "LAMP" ? "ランプ" : element.elementType === "BUTTON" ? "ボタン" : "テキスト"}の設定
        </span>
        <button
          type='button'
          aria-label='close'
          className='flex h-5 w-5 items-center justify-center rounded-full text-gray-400 leading-none hover:bg-gray-200 hover:text-gray-600 transition'
          onClick={() => tpStatus.setIsEditOpen(false)}
        >
          ×
        </button>
      </div>
      <div className='flex flex-col gap-3 p-4'>
        {element.elementType === "TEXT" ? (
          <label className='flex flex-col gap-1 text-sm text-gray-700'>
            テキスト
            <input
              type='text'
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className='rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-500/20'
            />
          </label>
        ) : (
          <label className='flex flex-col gap-1 text-sm text-gray-700'>
            デバイス
            <input
              type='text'
              value={bitDevice}
              onChange={(e) => setBitDevice(e.target.value)}
              className='rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-500/20'
            />
          </label>
        )}
        <label className='flex flex-col gap-1 text-sm text-gray-700'>
          カラー
          <select
            value={color}
            onChange={(e) => setColor(e.target.value as colorName)}
            className='rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-500/20'
          >
            {COLOR_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {element.elementType === "BUTTON" && (
          <label className='flex flex-col gap-1 text-sm text-gray-700'>
            ボタン挙動
            <select
              value={btnType}
              onChange={(e) => setBtnType(e.target.value as buttonType)}
              className='rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-500/20'
            >
              {BUTTON_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
        <div className='flex justify-between pt-1'>
          <button
            type='button'
            onClick={handleDelete}
            className='rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition'
          >
            削除
          </button>
          <button
            type='button'
            onClick={handleSave}
            className='rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40'
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

export default TpElementEditWindow
