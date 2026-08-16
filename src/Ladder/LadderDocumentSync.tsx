import { useContext, useEffect } from 'react'
import { usePopupWindow } from '../PopupWindowContext'
import { EditCellStatusContext } from './LadderContext'

//ラダーがポップアップウィンドウ側にポータル描画されている間、キー操作やセル検索(document.querySelector等)を
//行うLadderProviderの各effectが正しいdocumentを参照できるよう、ポップアップのdocumentをcontext経由で伝える。
//(LadderProviderはNewWindowPortalより上位のツリーにいるため、usePopupWindow()を直接呼べない)
function LadderDocumentSync() {
  const popupWindow = usePopupWindow();
  const { setLadderDoc } = useContext(EditCellStatusContext);

  useEffect(() => {
    if (!popupWindow) return;
    setLadderDoc(popupWindow.document);
    return () => setLadderDoc(document);
  }, [popupWindow, setLadderDoc]);

  return null;
}

export default LadderDocumentSync
