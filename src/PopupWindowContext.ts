import { createContext, useContext } from 'react'

//NewWindowPortalが開いたポップアップウィンドウのwindowオブジェクトを子孫コンポーネントへ渡すためのContext。
//react-three-fiberの既定の描画ループはメインウィンドウのrequestAnimationFrameで駆動されるため、
//ポップアップを最大化してメインウィンドウが完全に隠れると(OSのウィンドウ占有検知により)スロットリングされ、
//アニメーションが停止して見える。ポップアップ自身のrequestAnimationFrameでループを駆動したいコンポーネントは
//このContextから popup window を取得して使う(ポップアップ外では常にnull)。
export const PopupWindowContext = createContext<Window | null>(null);
export const usePopupWindow = () => useContext(PopupWindowContext);
