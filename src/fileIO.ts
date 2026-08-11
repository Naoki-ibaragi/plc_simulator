//JSONファイルとしてダウンロードする
//docはポップアップウィンドウ内のボタンから呼ぶ場合に、そのウィンドウのdocumentを渡すためのもの
//(常にメイン画面のdocumentを使うと、ダウンロードのユーザー操作起点がボタンのあるウィンドウとずれる)
export function downloadJson(filename: string, data: unknown, doc: Document = document) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  URL.revokeObjectURL(url);
}

//ファイル選択ダイアログを開き、選択されたファイルを返す
export function pickJsonFile(doc: Document = document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

//選択されたファイルをJSONとして読み込む
export function readJsonFile<T>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result as string) as T);
      } catch {
        reject(new Error('JSONファイルの解析に失敗しました'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('ファイルの読み込みに失敗しました'));
    reader.readAsText(file);
  });
}
