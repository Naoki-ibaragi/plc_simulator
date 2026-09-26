//! KVシミュレータとの接続管理。1つのタスクがソケットを専有し、
//! 定周期のデバイス読出し(→フロントへイベント送信)と、フロントからの書込み要求を直列に処理する。

use std::collections::BTreeMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::Instant;

use crate::hostlink::{normalize_device, parse_channel_relay, HostLinkClient, HostLinkError, MONITOR_MAX};

//監視デバイスの値が変化したときに送るイベント(payload: DeviceSnapshot)
pub const VALUES_EVENT: &str = "kv-link:values";
//接続/切断時に送るイベント(payload: LinkStatus)
pub const STATUS_EVENT: &str = "kv-link:status";

const RESPONSE_TIMEOUT: Duration = Duration::from_secs(2);
const MIN_INTERVAL_MS: u64 = 1;
//書込み直後はPLCのスキャンで出力に反映された瞬間を拾うため、一定時間だけ短い周期で読み出す
const FAST_POLL_INTERVAL: Duration = Duration::from_millis(2);
const FAST_POLL_WINDOW: Duration = Duration::from_millis(100);

/// 周期読出しするデバイス。名前はKVのデバイス表記(例: "MR0", "X0", "DM0")
#[derive(Debug, Clone, Default, Deserialize)]
pub struct WatchList {
    #[serde(default)]
    pub bits: Vec<String>,
    #[serde(default)]
    pub words: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct DeviceSnapshot {
    pub bits: BTreeMap<String, bool>,
    pub words: BTreeMap<String, i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkStatus {
    pub connected: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectInfo {
    pub model_code: String,
    pub running: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum ReadMode {
    //モニタ登録(MBS/MWS)して1コマンドで一括読出し
    Monitor,
    //1点ずつRDで読出し(モニタ登録に対応していない/点数が多すぎる場合)
    Individual,
}

//リレー系デバイスはチャンネル(16点)単位のRDSでまとめて読む。離れたチャンネルもこの間隔以内なら1コマンドにまとめる
//(不要なチャンネルを数ワード余分に読む方が、往復回数を増やすより速い)
const CHANNEL_MERGE_GAP: u32 = 16;
const RDS_MAX_COUNT: usize = 1000;

//RDS {prefix}{start}00.H {count} で読むチャンネル範囲と、そこから取り出すビット
struct ChannelGroup {
    prefix: String,
    start: u32,
    count: usize,
    //(bitsの添字, 読出し結果のワード位置, ビット位置)
    members: Vec<(usize, usize, u8)>,
}

#[derive(Default)]
struct BitPlan {
    groups: Vec<ChannelGroup>,
    //チャンネル読出しできないデバイス(X/Y等)。bitsの添字でRDにより1点ずつ読む
    singles: Vec<usize>,
}

enum BitReader {
    //モニタ登録(MBS)して1コマンドで一括読出し
    Monitor,
    Plan(BitPlan),
}

struct PreparedWatch {
    bits: Vec<String>,
    words: Vec<String>,
    bit_reader: BitReader,
    word_mode: ReadMode,
}

impl PreparedWatch {
    fn to_watch_list(&self) -> WatchList {
        WatchList { bits: self.bits.clone(), words: self.words.clone() }
    }
}

fn plan_bit_reads(bits: &[String]) -> BitPlan {
    let mut plan = BitPlan::default();
    let mut by_prefix: BTreeMap<String, Vec<(u32, u8, usize)>> = BTreeMap::new();
    for (index, device) in bits.iter().enumerate() {
        match parse_channel_relay(device) {
            Some((prefix, channel, bit)) => by_prefix.entry(prefix).or_default().push((channel, bit, index)),
            None => plan.singles.push(index),
        }
    }
    for (prefix, mut entries) in by_prefix {
        entries.sort();
        let mut current: Option<ChannelGroup> = None;
        for (channel, bit, index) in entries {
            if let Some(group) = current.as_mut() {
                let end = group.start + group.count as u32;
                let span = (channel - group.start) as usize + 1;
                if channel < end || (channel - end <= CHANNEL_MERGE_GAP && span <= RDS_MAX_COUNT) {
                    group.count = group.count.max(span);
                    group.members.push((index, (channel - group.start) as usize, bit));
                    continue;
                }
                plan.groups.extend(current.take());
            }
            current = Some(ChannelGroup { prefix: prefix.clone(), start: channel, count: 1, members: vec![(index, 0, bit)] });
        }
        plan.groups.extend(current);
    }
    plan
}

//存在しないデバイスがあると毎周期エラーになるため、ここで一度読んで確認する。
//チャンネル読出しに失敗した範囲は1点ずつ読む方式に切り替える
async fn verify_bit_plan(client: &mut HostLinkClient, bits: &[String], plan: BitPlan) -> Result<BitPlan, HostLinkError> {
    let mut verified = BitPlan { groups: Vec::new(), singles: plan.singles };
    for group in plan.groups {
        match client.read_relay_channels(&group.prefix, group.start, group.count).await {
            Ok(_) => verified.groups.push(group),
            Err(e) if e.is_fatal() => return Err(e),
            Err(e) => {
                log::warn!("{}{}00から{}ch分のチャンネル読出しに失敗したため1点ずつ読み出します: {e}", group.prefix, group.start, group.count);
                verified.singles.extend(group.members.iter().map(|&(index, _, _)| index));
            }
        }
    }
    verified.singles.sort();
    for &index in &verified.singles {
        client.read_bit(&bits[index]).await.map_err(|e| with_device(e, &bits[index]))?;
    }
    Ok(verified)
}

async fn prepare_watch(client: &mut HostLinkClient, watch: WatchList) -> Result<PreparedWatch, HostLinkError> {
    let normalize = |list: Vec<String>| -> Result<Vec<String>, HostLinkError> {
        let mut out: Vec<String> = Vec::with_capacity(list.len());
        for device in list {
            let device = normalize_device(&device)?;
            if !out.contains(&device) {
                out.push(device);
            }
        }
        Ok(out)
    };
    let bits = normalize(watch.bits)?;
    let words = normalize(watch.words)?;

    let bit_reader = match choose_mode(bits.len(), client.register_bit_monitor(&bits)).await? {
        ReadMode::Monitor => BitReader::Monitor,
        ReadMode::Individual => BitReader::Plan(verify_bit_plan(client, &bits, plan_bit_reads(&bits)).await?),
    };
    let word_mode = choose_mode(words.len(), client.register_word_monitor(&words)).await?;

    //1点ずつ読む場合は存在しないデバイスがあると毎周期エラーになるため、ここで一度読んで確認する
    if word_mode == ReadMode::Individual {
        for device in &words {
            client.read_word(device).await.map_err(|e| with_device(e, device))?;
        }
    }
    Ok(PreparedWatch { bits, words, bit_reader, word_mode })
}

async fn choose_mode(
    count: usize,
    register: impl std::future::Future<Output = Result<(), HostLinkError>>,
) -> Result<ReadMode, HostLinkError> {
    if count == 0 || count > MONITOR_MAX {
        return Ok(ReadMode::Individual);
    }
    match register.await {
        Ok(()) => Ok(ReadMode::Monitor),
        Err(e) if e.is_fatal() => Err(e),
        Err(e) => {
            log::warn!("モニタ登録に失敗したため1点ずつ読み出します: {e}");
            Ok(ReadMode::Individual)
        }
    }
}

fn with_device(err: HostLinkError, device: &str) -> HostLinkError {
    match err {
        HostLinkError::Plc { code } => HostLinkError::InvalidDevice(format!(
            "{device} ({code}: {})",
            crate::hostlink::describe_error_code(&code)
        )),
        other => other,
    }
}

async fn read_snapshot(client: &mut HostLinkClient, watch: &PreparedWatch) -> Result<DeviceSnapshot, HostLinkError> {
    let mut snapshot = DeviceSnapshot::default();
    if !watch.bits.is_empty() {
        let values = match &watch.bit_reader {
            BitReader::Monitor => client.read_bit_monitor(watch.bits.len()).await?,
            BitReader::Plan(plan) => {
                let mut values = vec![false; watch.bits.len()];
                for group in &plan.groups {
                    let words = client.read_relay_channels(&group.prefix, group.start, group.count).await?;
                    for &(index, word, bit) in &group.members {
                        values[index] = (words[word] >> bit) & 1 == 1;
                    }
                }
                for &index in &plan.singles {
                    values[index] = client.read_bit(&watch.bits[index]).await?;
                }
                values
            }
        };
        snapshot.bits = watch.bits.iter().cloned().zip(values).collect();
    }
    if !watch.words.is_empty() {
        let values = match watch.word_mode {
            ReadMode::Monitor => client.read_word_monitor(watch.words.len()).await?,
            ReadMode::Individual => {
                let mut values = Vec::with_capacity(watch.words.len());
                for device in &watch.words {
                    values.push(client.read_word(device).await?);
                }
                values
            }
        };
        snapshot.words = watch.words.iter().cloned().zip(values).collect();
    }
    Ok(snapshot)
}

type Reply<T> = oneshot::Sender<Result<T, String>>;

enum WriteValue {
    Bit(bool),
    Word(i64),
}

enum Request {
    Write { device: String, value: WriteValue, reply: Reply<()> },
    SetWatch { watch: WatchList, reply: Reply<()> },
    Raw { command: String, reply: Reply<String> },
    Stop,
}

async fn run_link(
    mut client: HostLinkClient,
    mut watch: PreparedWatch,
    interval: Duration,
    mut rx: mpsc::Receiver<Request>,
    app: AppHandle,
) {
    let mut last: Option<DeviceSnapshot> = None;
    let mut next_read = Instant::now();
    let mut fast_until: Option<Instant> = None;

    let error: Option<HostLinkError> = loop {
        tokio::select! {
            _ = tokio::time::sleep_until(next_read) => {
                match read_snapshot(&mut client, &watch).await {
                    Ok(snapshot) => {
                        //変化したときだけ送り、フロントの不要な再レンダーを防ぐ
                        if last.as_ref() != Some(&snapshot) {
                            let _ = app.emit(VALUES_EVENT, &snapshot);
                            last = Some(snapshot);
                        }
                    }
                    Err(e) => break Some(e),
                }
                let now = Instant::now();
                let period = match fast_until {
                    Some(until) if now < until => FAST_POLL_INTERVAL,
                    _ => interval,
                };
                next_read = now + period;
            }
            request = rx.recv() => {
                let fatal = match request {
                    None | Some(Request::Stop) => break None,
                    Some(Request::Write { device, value, reply }) => {
                        let result = match value {
                            WriteValue::Bit(v) => client.write_bit(&device, v).await,
                            WriteValue::Word(v) => client.write_word(&device, v).await,
                        };
                        //書込みの結果(ラダーの出力変化)をすぐ拾えるよう、次の読出しを前倒しして高速周期に切り替える
                        let now = Instant::now();
                        next_read = now;
                        fast_until = Some(now + FAST_POLL_WINDOW);
                        respond(reply, result)
                    }
                    Some(Request::SetWatch { watch: next, reply }) => {
                        let result = match prepare_watch(&mut client, next).await {
                            Ok(prepared) => {
                                watch = prepared;
                                //監視対象が変わったので次の読出し結果は必ず送る
                                last = None;
                                Ok(())
                            }
                            //失敗時もPLC側のモニタ登録は途中まで書き換わっているため、元の監視対象で登録し直す
                            Err(e) if !e.is_fatal() => match prepare_watch(&mut client, watch.to_watch_list()).await {
                                Ok(prepared) => {
                                    watch = prepared;
                                    Err(e)
                                }
                                Err(restore_error) => break Some(restore_error),
                            },
                            Err(e) => Err(e),
                        };
                        respond(reply, result)
                    }
                    Some(Request::Raw { command, reply }) => respond(reply, client.query(&command).await),
                };
                if let Some(e) = fatal {
                    break Some(e);
                }
            }
        }
    };

    if let Some(e) = &error {
        log::error!("KV接続を終了しました: {e}");
    }
    let _ = app.emit(
        STATUS_EVENT,
        LinkStatus { connected: false, error: error.map(|e| e.to_string()) },
    );
}

//要求元に結果を返し、接続を破棄すべきエラーならそれを返す
fn respond<T>(reply: Reply<T>, result: Result<T, HostLinkError>) -> Option<HostLinkError> {
    match result {
        Ok(value) => {
            let _ = reply.send(Ok(value));
            None
        }
        Err(e) => {
            let _ = reply.send(Err(e.to_string()));
            e.is_fatal().then_some(e)
        }
    }
}

struct Session {
    tx: mpsc::Sender<Request>,
    task: JoinHandle<()>,
}

#[derive(Default)]
pub struct KvLinkState {
    session: Mutex<Option<Session>>,
}

impl KvLinkState {
    async fn stop(&self) {
        if let Some(session) = self.session.lock().await.take() {
            let _ = session.tx.send(Request::Stop).await;
            //シミュレータは同時接続数が限られるため、ソケットが閉じるまで待つ
            let _ = session.task.await;
        }
    }

    async fn request<T>(&self, make: impl FnOnce(Reply<T>) -> Request) -> Result<T, String> {
        let tx = match self.session.lock().await.as_ref() {
            Some(session) => session.tx.clone(),
            None => return Err("KVに接続していません".into()),
        };
        let (reply, rx) = oneshot::channel();
        tx.send(make(reply)).await.map_err(|_| "KVとの接続が切れています".to_string())?;
        rx.await.map_err(|_| "KVとの接続が切れています".to_string())?
    }
}

/// KVに接続し、watchのデバイスをinterval_ms周期で読み出してVALUES_EVENTで送り続ける。
/// 既に接続中の場合は切断してから接続し直す
#[tauri::command]
pub async fn kv_connect(
    app: AppHandle,
    state: State<'_, KvLinkState>,
    host: String,
    port: u16,
    interval_ms: u64,
    watch: WatchList,
) -> Result<ConnectInfo, String> {
    state.stop().await;

    let setup = async {
        let mut client = HostLinkClient::connect(&host, port, RESPONSE_TIMEOUT).await?;
        let info = ConnectInfo {
            model_code: client.model_code().await?,
            running: client.is_running().await?,
        };
        let prepared = prepare_watch(&mut client, watch).await?;
        Ok::<_, HostLinkError>((client, info, prepared))
    };
    let (client, info, prepared) = setup
        .await
        .map_err(|e| format!("{host}:{port} への接続に失敗しました: {e}"))?;

    let (tx, rx) = mpsc::channel(64);
    let interval = Duration::from_millis(interval_ms.max(MIN_INTERVAL_MS));
    let task = tauri::async_runtime::spawn(run_link(client, prepared, interval, rx, app.clone()));
    *state.session.lock().await = Some(Session { tx, task });

    let _ = app.emit(STATUS_EVENT, LinkStatus { connected: true, error: None });
    Ok(info)
}

#[tauri::command]
pub async fn kv_disconnect(state: State<'_, KvLinkState>) -> Result<(), String> {
    state.stop().await;
    Ok(())
}

/// 周期読出しするデバイスを差し替える
#[tauri::command]
pub async fn kv_set_watch(state: State<'_, KvLinkState>, watch: WatchList) -> Result<(), String> {
    state.request(|reply| Request::SetWatch { watch, reply }).await
}

#[tauri::command]
pub async fn kv_write_bit(state: State<'_, KvLinkState>, device: String, value: bool) -> Result<(), String> {
    state
        .request(|reply| Request::Write { device, value: WriteValue::Bit(value), reply })
        .await
}

#[tauri::command]
pub async fn kv_write_word(state: State<'_, KvLinkState>, device: String, value: i64) -> Result<(), String> {
    state
        .request(|reply| Request::Write { device, value: WriteValue::Word(value), reply })
        .await
}

/// 任意の上位リンクコマンドを送り、応答をそのまま返す(デバッグ用)
#[tauri::command]
pub async fn kv_raw_command(state: State<'_, KvLinkState>, command: String) -> Result<String, String> {
    state.request(|reply| Request::Raw { command, reply }).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hostlink::mock;

    async fn connect(port: u16) -> HostLinkClient {
        HostLinkClient::connect("127.0.0.1", port, Duration::from_secs(1))
            .await
            .unwrap()
    }

    fn watch(bits: &[&str], words: &[&str]) -> WatchList {
        WatchList {
            bits: bits.iter().map(|s| s.to_string()).collect(),
            words: words.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[tokio::test]
    async fn uses_monitor_commands_when_supported() {
        let plc = mock::spawn(|cmd| match cmd {
            "MBS MR0 Y0" | "MWS DM0.U" => "OK".into(),
            "MBR" => "1 0".into(),
            "MWR" => "00007".into(),
            _ => "E1".into(),
        })
        .await;
        let mut client = connect(plc.port).await;
        //重複と小文字は正規化される
        let prepared = prepare_watch(&mut client, watch(&["mr0", "Y0", "MR0"], &["DM0"])).await.unwrap();
        assert!(matches!(prepared.bit_reader, BitReader::Monitor));
        assert_eq!(prepared.word_mode, ReadMode::Monitor);

        let snapshot = read_snapshot(&mut client, &prepared).await.unwrap();
        assert_eq!(snapshot.bits, BTreeMap::from([("MR0".into(), true), ("Y0".into(), false)]));
        assert_eq!(snapshot.words, BTreeMap::from([("DM0".into(), 7)]));
    }

    #[tokio::test]
    async fn falls_back_to_individual_reads() {
        let plc = mock::spawn(|cmd| match cmd {
            "RD MR0" => "1".into(),
            "RD DM0.U" => "00007".into(),
            _ => "E1".into(),
        })
        .await;
        let mut client = connect(plc.port).await;
        let prepared = prepare_watch(&mut client, watch(&["MR0"], &["DM0"])).await.unwrap();
        assert!(matches!(&prepared.bit_reader, BitReader::Plan(plan) if plan.groups.is_empty() && plan.singles == [0]));
        assert_eq!(prepared.word_mode, ReadMode::Individual);

        let snapshot = read_snapshot(&mut client, &prepared).await.unwrap();
        assert!(snapshot.bits["MR0"]);
        assert_eq!(snapshot.words["DM0"], 7);
    }

    #[test]
    fn plans_channel_reads() {
        let bits: Vec<String> = ["R58000", "R58015", "R58100", "R59003", "R70000", "MR0", "X0"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let plan = plan_bit_reads(&bits);
        let groups: Vec<_> = plan.groups.iter().map(|g| (g.prefix.as_str(), g.start, g.count)).collect();
        //580~590chは間隔が小さいので1回にまとめ、700chは離れているので別に読む
        assert_eq!(groups, vec![("MR", 0, 1), ("R", 580, 11), ("R", 700, 1)]);
        assert_eq!(plan.groups[1].members, vec![(0, 0, 0), (1, 0, 15), (2, 1, 0), (3, 10, 3)]);
        assert_eq!(plan.singles, vec![6]);
    }

    #[tokio::test]
    async fn reads_relays_by_channel() {
        let plc = mock::spawn(|cmd| match cmd {
            "RDS R58000.H 2" => "8001 0000".into(),
            "RDS MR000.H 1" => "0004".into(),
            "RD X0" => "1".into(),
            _ => "E1".into(),
        })
        .await;
        let mut client = connect(plc.port).await;
        let prepared = prepare_watch(&mut client, watch(&["R58000", "R58015", "R58100", "MR2", "X0"], &[])).await.unwrap();
        let snapshot = read_snapshot(&mut client, &prepared).await.unwrap();
        assert_eq!(
            snapshot.bits,
            BTreeMap::from([
                ("R58000".into(), true),
                ("R58015".into(), true),
                ("R58100".into(), false),
                ("MR2".into(), true),
                ("X0".into(), true),
            ])
        );
    }

    #[tokio::test]
    async fn falls_back_to_single_reads_when_channel_read_fails() {
        let plc = mock::spawn(|cmd| match cmd {
            "RD R58000" => "1".into(),
            _ => "E1".into(),
        })
        .await;
        let mut client = connect(plc.port).await;
        let prepared = prepare_watch(&mut client, watch(&["R58000"], &[])).await.unwrap();
        assert!(matches!(&prepared.bit_reader, BitReader::Plan(plan) if plan.groups.is_empty() && plan.singles == [0]));
        assert!(read_snapshot(&mut client, &prepared).await.unwrap().bits["R58000"]);
    }

    #[tokio::test]
    async fn reports_nonexistent_device_on_prepare() {
        let plc = mock::spawn(|cmd| match cmd {
            "RD MR0" => "1".into(),
            "RD ZZ999" => "E0".into(),
            _ => "E1".into(),
        })
        .await;
        let mut client = connect(plc.port).await;
        let err = prepare_watch(&mut client, watch(&["MR0", "ZZ999"], &[])).await.err().unwrap();
        assert!(err.to_string().contains("ZZ999"), "{err}");
    }
}
