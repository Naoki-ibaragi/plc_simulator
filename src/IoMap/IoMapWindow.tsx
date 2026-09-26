import { useContext, useMemo, useState } from 'react'
import { RuntimeContext } from '../Runtime/RuntimeContext'
import { usePopupWindow } from '../PopupWindowContext'
import { offsetRelayDevice, resolveKvDevice, type IoSignal, type KvIoMap } from '../Runtime/ioMap'
import { toKvDeviceName } from '../Runtime/kvLink'
import { downloadJson, pickJsonFile, readJsonFile } from '../fileIO'

type IoMapSaveData = {
  type: 'kv-io-map',
  map: KvIoMap,
}

const toolButtonClass = `
  px-2 py-1
  text-xs
  font-medium
  rounded-md
  border border-gray-300
  text-gray-600
  transition
  hover:bg-gray-100
  disabled:opacity-40
  disabled:hover:bg-transparent
`;

const startInputClass = 'w-24 rounded-md border border-gray-300 px-2 py-1 font-mono text-xs uppercase disabled:bg-gray-100';

//KV連携時のI/O割付表。設備モデル/タッチパネルが使う信号(内蔵ラダー用のデバイス名)ごとに、KVのデバイスを設定する
function IoMapWindow() {
  const { ioSignals, kvIoMap, setKvIoMap, kvLink } = useContext(RuntimeContext);
  const popup = usePopupWindow();
  const doc = popup?.document ?? document;
  const [inputStart, setInputStart] = useState('');
  const [outputStart, setOutputStart] = useState('');
  //連携中に割付を変えると、書込み済みの入力がKV側にONのまま残る等の不整合が起きるため編集させない
  const locked = kvLink.active;

  const equipmentSignals = ioSignals.filter(signal => signal.source === 'equipment');
  const touchpanelSignals = ioSignals.filter(signal => signal.source === 'touchpanel');

  //同じKVデバイスに割り付けられている信号(重複の警告用)
  const signalsByKvDevice = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const signal of ioSignals) {
      const kvDevice = resolveKvDevice(kvIoMap, signal.device);
      if (kvDevice) map.set(kvDevice, [...(map.get(kvDevice) ?? []), signal.device]);
    }
    return map;
  }, [ioSignals, kvIoMap]);

  const alert = (message: string) => doc.defaultView?.alert(message);
  const confirm = (message: string) => doc.defaultView?.confirm(message) ?? false;

  const updateAssignment = (device: string, value: string) => {
    const next = { ...kvIoMap };
    const kvDevice = value.trim().toUpperCase();
    if (kvDevice) next[device] = kvDevice;
    else delete next[device];
    setKvIoMap(next);
  };

  //入力・出力それぞれ、先頭のリレーから信号の並び順に連番で割り付ける(R58015の次はR58100)
  const handleAutoAssign = () => {
    const groups = [
      { name: '入力', start: inputStart, signals: equipmentSignals.filter(signal => signal.direction === 'input') },
      { name: '出力', start: outputStart, signals: equipmentSignals.filter(signal => signal.direction === 'output') },
    ].filter(group => group.start.trim() !== '' && group.signals.length > 0);
    if (groups.length === 0) {
      alert('入力または出力の先頭デバイスを入力してください(例: R58000)');
      return;
    }
    const next = { ...kvIoMap };
    for (const group of groups) {
      if (!offsetRelayDevice(group.start, 0)) {
        alert(`${group.name}の先頭デバイス「${group.start}」はR/MR/LR/CRのリレー(例: R58000)で指定してください`);
        return;
      }
      group.signals.forEach((signal, i) => { next[signal.device] = offsetRelayDevice(group.start, i)!; });
    }
    const overwritten = groups.flatMap(group => group.signals).filter(signal => kvIoMap[signal.device] && kvIoMap[signal.device] !== next[signal.device]);
    if (overwritten.length > 0 && !confirm(`${overwritten.length}件の割付を上書きします。よろしいですか？`)) return;
    setKvIoMap(next);
  };

  const handleClear = () => {
    if (Object.keys(kvIoMap).length === 0) return;
    if (!confirm('すべての割付を解除します。よろしいですか？')) return;
    setKvIoMap({});
  };

  const handleSave = () => {
    const data: IoMapSaveData = { type: 'kv-io-map', map: kvIoMap };
    downloadJson('io_map.json', data, doc);
  };

  const handleLoad = async () => {
    const file = await pickJsonFile(doc);
    if (!file) return;
    try {
      const data = await readJsonFile<IoMapSaveData>(file);
      if (data.type !== 'kv-io-map' || !data.map || typeof data.map !== 'object') {
        alert('I/O割付用のファイルではありません');
        return;
      }
      if (!confirm('現在の割付を上書きして読み込みます。よろしいですか？')) return;
      setKvIoMap(data.map);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました');
    }
  };

  const renderStatus = (signal: IoSignal) => {
    const assigned = kvIoMap[signal.device];
    if (assigned && !toKvDeviceName(assigned)) {
      return <span className='text-red-600'>デバイス名が不正です</span>;
    }
    const kvDevice = resolveKvDevice(kvIoMap, signal.device);
    const shared = kvDevice ? (signalsByKvDevice.get(kvDevice) ?? []).filter(device => device !== signal.device) : [];
    if (shared.length > 0) {
      return <span className='text-amber-600'>{`${shared.join(', ')} と重複`}</span>;
    }
    if (!assigned) {
      return <span className='text-gray-400'>{`未割付(${signal.device} のまま)`}</span>;
    }
    return <span className='text-green-600'>OK</span>;
  };

  const renderRows = (signals: IoSignal[]) => signals.map(signal => (
    <tr key={signal.device} className='border-b border-gray-100'>
      <td className='px-3 py-1.5 font-mono'>{signal.device}</td>
      <td className='px-3 py-1.5'>
        {signal.direction === 'input'
          ? <span className='rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-700' title='設備→PLC(アプリがKVへ書き込む)'>入力</span>
          : <span className='rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700' title='PLC→設備(アプリがKVから読み出す)'>出力</span>}
      </td>
      <td className='px-3 py-1.5 text-gray-600'>{signal.label}</td>
      <td className='px-3 py-1.5'>
        <input
          type='text'
          value={kvIoMap[signal.device] ?? ''}
          placeholder={signal.device}
          disabled={locked}
          onChange={e => updateAssignment(signal.device, e.target.value)}
          className='w-32 rounded-md border border-gray-300 px-2 py-1 font-mono text-sm uppercase placeholder:normal-case placeholder:text-gray-300 disabled:bg-gray-100'
        />
      </td>
      <td className='px-3 py-1.5 text-xs'>{renderStatus(signal)}</td>
    </tr>
  ));

  const renderSection = (title: string, signals: IoSignal[], emptyMessage: string) => (
    <section className='mb-4'>
      <h2 className='mb-1 text-sm font-medium text-gray-700'>{title}</h2>
      {signals.length === 0 ? (
        <p className='px-3 py-2 text-xs text-gray-400'>{emptyMessage}</p>
      ) : (
        <table className='w-full border-collapse bg-white text-sm'>
          <thead>
            <tr className='border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500'>
              <th className='px-3 py-1.5 font-medium'>モデルのデバイス</th>
              <th className='px-3 py-1.5 font-medium'>入出力</th>
              <th className='px-3 py-1.5 font-medium'>対象</th>
              <th className='px-3 py-1.5 font-medium'>KVデバイス</th>
              <th className='px-3 py-1.5 font-medium'>状態</th>
            </tr>
          </thead>
          <tbody>{renderRows(signals)}</tbody>
        </table>
      )}
    </section>
  );

  return (
    <div className='flex h-full flex-col bg-gray-50'>
      <div className='flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2'>
        <span className='text-xs text-gray-500'>自動割付</span>
        <label className='flex items-center gap-1 text-xs text-gray-600'>
          入力の先頭
          <input className={startInputClass} value={inputStart} placeholder='R58000' disabled={locked} onChange={e => setInputStart(e.target.value)} />
        </label>
        <label className='flex items-center gap-1 text-xs text-gray-600'>
          出力の先頭
          <input className={startInputClass} value={outputStart} placeholder='R59000' disabled={locked} onChange={e => setOutputStart(e.target.value)} />
        </label>
        <button type='button' className={toolButtonClass} disabled={locked} onClick={handleAutoAssign}>
          設備の信号に割り付け
        </button>
        <span className='mx-1 h-6 w-px bg-gray-200' />
        <button type='button' className={toolButtonClass} disabled={locked} onClick={handleClear}>
          すべて解除
        </button>
        <span className='mx-1 h-6 w-px bg-gray-200' />
        <button type='button' className={toolButtonClass} onClick={handleSave}>
          割付保存
        </button>
        <button type='button' className={toolButtonClass} disabled={locked} onClick={() => { void handleLoad(); }}>
          割付読込
        </button>
      </div>
      <div className='flex-1 min-h-0 overflow-auto px-4 py-3'>
        <p className='mb-3 text-xs text-gray-500'>
          KV連携時に、モデルのデバイスをKVのどのデバイスで読み書きするかを設定します(内蔵ラダーでは使われません)。
          入力は設備→PLC(ボタン・センサー)、出力はPLC→設備(ランプ・シリンダー等)です。空欄の場合は同じ名前のKVデバイスを使います。
          {locked && <span className='ml-1 font-medium text-indigo-600'>KV連携中は編集できません。</span>}
        </p>
        {renderSection('設備モデル', equipmentSignals, '設備モデルの読み込み中、またはこの設備には信号がありません')}
        {renderSection('タッチパネル', touchpanelSignals, 'タッチパネルにランプ/ボタンが配置されていません')}
      </div>
    </div>
  )
}

export default IoMapWindow
