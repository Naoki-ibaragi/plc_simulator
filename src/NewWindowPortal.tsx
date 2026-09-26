import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PopupWindowContext } from './PopupWindowContext'

type Props = {
  title: string,
  width?: number,
  height?: number,
  resizable?: boolean,
  onClose: () => void,
  children: ReactNode,
}

//window.openで開いた別ウィンドウのDOMに、同じReactツリー(同じContext)のままchildrenをポータル描画する
function NewWindowPortal({ title, width = 800, height = 600, resizable = false, onClose, children }: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [popupWindow, setPopupWindow] = useState<Window | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const win = window.open('', '', `width=${width},height=${height},resizable=${resizable ? 'yes' : 'no'}`);
    if (!win) {
      window.alert('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
      onCloseRef.current();
      return;
    }
    win.document.title = title;

    //メイン画面のスタイル(Tailwindのビルド済みCSS等)をポップアップ側にも適用する。
    //<link>を複製するとポップアップ側でCSSを取得し直すことになるが、Tauriのビルド版ではポップアップの
    //WebViewからアプリ内アセット(http://tauri.localhost/assets/...)を取得できずCSSが当たらない。
    //そのため読込済みのルールを文字列として<style>に埋め込む(クロスオリジン等でルールを読めない場合のみ複製)
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      const sheet = (node as HTMLStyleElement | HTMLLinkElement).sheet;
      let cssText: string | null;
      try {
        cssText = sheet ? Array.from(sheet.cssRules, rule => rule.cssText).join('\n') : null;
      } catch {
        cssText = null;
      }
      if (cssText === null) {
        win.document.head.appendChild(node.cloneNode(true));
        return;
      }
      const style = win.document.createElement('style');
      style.textContent = cssText;
      win.document.head.appendChild(style);
    });
    const resetStyle = win.document.createElement('style');
    resetStyle.textContent = 'html,body{height:100%;margin:0;}';
    win.document.head.appendChild(resetStyle);

    const root = win.document.createElement('div');
    root.style.height = '100%';
    win.document.body.appendChild(root);
    //別ウィンドウを開いた直後にポータル先DOMを確定させる必要があるため、effect内でのsetStateが必須
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContainer(root);
    setPopupWindow(win);

    //ポーリングでウィンドウが閉じられたことを検知する
    const timer = setInterval(() => {
      if (win.closed) {
        clearInterval(timer);
        onCloseRef.current();
      }
    }, 500);

    //メイン画面がリロード・遷移・終了した際、ポップアップを閉じ忘れて残留させない
    const handleBeforeUnload = () => {
      if (!win.closed) win.close();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setContainer(null);
      setPopupWindow(null);
      if (!win.closed) win.close();
    };
  }, [title, width, height, resizable]);

  return container
    ? createPortal(<PopupWindowContext.Provider value={popupWindow}>{children}</PopupWindowContext.Provider>, container)
    : null;
}

export default NewWindowPortal
