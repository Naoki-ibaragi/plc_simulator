import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string,
  width?: number,
  height?: number,
  onClose: () => void,
  children: ReactNode,
}

//window.openで開いた別ウィンドウのDOMに、同じReactツリー(同じContext)のままchildrenをポータル描画する
function NewWindowPortal({ title, width = 800, height = 600, onClose, children }: Props) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const win = window.open('', '', `width=${width},height=${height}`);
    if (!win) {
      window.alert('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
      onCloseRef.current();
      return;
    }
    win.document.title = title;

    //メイン画面のスタイル(Tailwindのビルド済みCSS等)を複製してポップアップ側にも適用する
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      win.document.head.appendChild(node.cloneNode(true));
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
      if (!win.closed) win.close();
    };
  }, [title, width, height]);

  return container ? createPortal(children, container) : null;
}

export default NewWindowPortal
