//! キーエンスKVシリーズの上位リンク通信(TCP)クライアント
//!
//! コマンドはASCII文字列+CR、応答は1行+CR LF。エラー時は"E0"等の2文字コードが返る。
//! 1本のソケットで要求→応答を直列に行うため、呼び出し側は同時に1つのタスクからのみ使うこと。

use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::TcpStream;
use tokio::time::timeout;

//モニタ登録(MBS/MWS)で一度に登録できるデバイス数の上限
pub const MONITOR_MAX: usize = 120;

#[derive(Debug, thiserror::Error)]
pub enum HostLinkError {
    #[error("通信エラー: {0}")]
    Io(#[from] std::io::Error),
    #[error("応答タイムアウト")]
    Timeout,
    #[error("PLCから切断されました")]
    Disconnected,
    #[error("PLCエラー応答 {code}: {}", describe_error_code(.code))]
    Plc { code: String },
    #[error("不正なデバイス名: {0}")]
    InvalidDevice(String),
    #[error("不正なコマンド: {0}")]
    InvalidCommand(String),
    #[error("応答を解釈できません: {0}")]
    InvalidResponse(String),
}

impl HostLinkError {
    //ソケットの状態が不定になるエラー。発生したら接続を破棄する必要がある
    //(タイムアウト後に遅れて届いた応答を次のコマンドの応答と取り違えないため)
    pub fn is_fatal(&self) -> bool {
        matches!(self, Self::Io(_) | Self::Timeout | Self::Disconnected)
    }
}

pub type Result<T> = std::result::Result<T, HostLinkError>;

pub fn describe_error_code(code: &str) -> &'static str {
    match code {
        "E0" => "デバイス番号異常(存在しないデバイス/範囲外)",
        "E1" => "コマンド異常(未対応コマンド/書式誤り)",
        "E2" => "プログラム未登録",
        "E4" => "書込み禁止",
        "E5" => "本体エラー",
        "E6" => "コメントなし",
        _ => "不明なエラー",
    }
}

fn is_error_code(response: &str) -> bool {
    let b = response.as_bytes();
    b.len() == 2 && b[0] == b'E' && b[1].is_ascii_digit()
}

/// デバイス名を大文字に正規化し、コマンドに埋め込んで安全な形式か検証する。
/// 例: "dm0" → "DM0", "DM10.s" → "DM10.S"
pub fn normalize_device(device: &str) -> Result<String> {
    let upper = device.trim().to_ascii_uppercase();
    let (name, suffix) = match upper.split_once('.') {
        Some((name, suffix)) => (name, Some(suffix)),
        None => (upper.as_str(), None),
    };
    let valid_name = (2..=16).contains(&name.len())
        && name.starts_with(|c: char| c.is_ascii_uppercase())
        && name.chars().all(|c| c.is_ascii_alphanumeric())
        && name.chars().any(|c| c.is_ascii_digit());
    let valid_suffix = suffix.is_none_or(|s| matches!(s, "U" | "S" | "D" | "L" | "H"));
    if valid_name && valid_suffix {
        Ok(upper)
    } else {
        Err(HostLinkError::InvalidDevice(device.to_string()))
    }
}

//ワードデバイスは書式省略時に.U(16bit符号なし)として扱う
fn word_device(device: &str) -> String {
    if device.contains('.') {
        device.to_string()
    } else {
        format!("{device}.U")
    }
}

fn parse_bit(token: &str) -> Result<bool> {
    match token {
        "0" => Ok(false),
        "1" => Ok(true),
        _ => Err(HostLinkError::InvalidResponse(token.to_string())),
    }
}

fn parse_word(token: &str) -> Result<i64> {
    token
        .parse::<i64>()
        .map_err(|_| HostLinkError::InvalidResponse(token.to_string()))
}

fn parse_hex_word(token: &str) -> Result<u16> {
    u16::from_str_radix(token, 16).map_err(|_| HostLinkError::InvalidResponse(token.to_string()))
}

//チャンネル(16点)単位で読み出せるリレー系デバイス。番号は「チャンネル×100+ビット(00~15)」の10進表記
//(例: R58015 = 580ch ビット15、R015 = 0ch ビット15)
const CHANNEL_RELAY_PREFIXES: [&str; 4] = ["R", "MR", "LR", "CR"];

/// リレー系デバイスを(種別, チャンネル, ビット)に分解する。対象外のデバイスはNone
pub fn parse_channel_relay(device: &str) -> Option<(String, u32, u8)> {
    let digits_at = device.find(|c: char| c.is_ascii_digit())?;
    let (prefix, digits) = device.split_at(digits_at);
    if !CHANNEL_RELAY_PREFIXES.contains(&prefix) || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let number: u32 = digits.parse().ok()?;
    let (channel, bit) = (number / 100, number % 100);
    (bit < 16).then(|| (prefix.to_string(), channel, bit as u8))
}

fn parse_list<T>(response: &str, expected: usize, parse: fn(&str) -> Result<T>) -> Result<Vec<T>> {
    let values = response
        .split_whitespace()
        .map(parse)
        .collect::<Result<Vec<T>>>()?;
    if values.len() != expected {
        return Err(HostLinkError::InvalidResponse(response.to_string()));
    }
    Ok(values)
}

fn expect_ok(response: String) -> Result<()> {
    if response == "OK" {
        Ok(())
    } else {
        Err(HostLinkError::InvalidResponse(response))
    }
}

pub struct HostLinkClient {
    reader: BufReader<OwnedReadHalf>,
    writer: OwnedWriteHalf,
    timeout: Duration,
}

impl HostLinkClient {
    pub async fn connect(host: &str, port: u16, response_timeout: Duration) -> Result<Self> {
        let stream = timeout(response_timeout, TcpStream::connect((host, port)))
            .await
            .map_err(|_| HostLinkError::Timeout)??;
        //1コマンドずつ即応答を待つ通信なのでNagleアルゴリズムによる送信遅延を無効化する
        stream.set_nodelay(true)?;
        let (reader, writer) = stream.into_split();
        Ok(Self {
            reader: BufReader::new(reader),
            writer,
            timeout: response_timeout,
        })
    }

    /// コマンドを1つ送信して応答1行を返す。エラーコード応答はErr(Plc)になる
    pub async fn query(&mut self, command: &str) -> Result<String> {
        if command.is_empty() || !command.is_ascii() || command.contains(['\r', '\n']) {
            return Err(HostLinkError::InvalidCommand(command.to_string()));
        }
        let mut packet = Vec::with_capacity(command.len() + 1);
        packet.extend_from_slice(command.as_bytes());
        packet.push(b'\r');
        self.writer.write_all(&packet).await?;

        let mut line = Vec::new();
        let n = timeout(self.timeout, self.reader.read_until(b'\n', &mut line))
            .await
            .map_err(|_| HostLinkError::Timeout)??;
        if n == 0 {
            return Err(HostLinkError::Disconnected);
        }
        let response = String::from_utf8_lossy(&line)
            .trim_end_matches(['\r', '\n'])
            .to_string();
        if is_error_code(&response) {
            return Err(HostLinkError::Plc { code: response });
        }
        Ok(response)
    }

    /// 機種コード(?K)
    pub async fn model_code(&mut self) -> Result<String> {
        self.query("?K").await
    }

    /// RUN中ならtrue(?M: 0=PROGRAM, 1=RUN)
    pub async fn is_running(&mut self) -> Result<bool> {
        Ok(self.query("?M").await? == "1")
    }

    pub async fn read_bit(&mut self, device: &str) -> Result<bool> {
        let device = normalize_device(device)?;
        parse_bit(&self.query(&format!("RD {device}")).await?)
    }

    pub async fn read_word(&mut self, device: &str) -> Result<i64> {
        let device = word_device(&normalize_device(device)?);
        parse_word(&self.query(&format!("RD {device}")).await?)
    }

    pub async fn write_bit(&mut self, device: &str, value: bool) -> Result<()> {
        let device = normalize_device(device)?;
        expect_ok(self.query(&format!("WR {device} {}", u8::from(value))).await?)
    }

    pub async fn write_word(&mut self, device: &str, value: i64) -> Result<()> {
        let device = word_device(&normalize_device(device)?);
        expect_ok(self.query(&format!("WR {device} {value}")).await?)
    }

    /// リレー系デバイスをチャンネル(16点)単位で連続読出しする(RDS R58000.H 4 等)。
    /// 戻り値の各ワードはビット0がそのチャンネルのxx00、ビット15がxx15に対応する
    pub async fn read_relay_channels(&mut self, prefix: &str, start_channel: u32, count: usize) -> Result<Vec<u16>> {
        if !CHANNEL_RELAY_PREFIXES.contains(&prefix) {
            return Err(HostLinkError::InvalidDevice(prefix.to_string()));
        }
        let response = self
            .query(&format!("RDS {prefix}{start_channel}00.H {count}"))
            .await?;
        parse_list(&response, count, parse_hex_word)
    }

    /// ビットデバイスのモニタ登録(MBS)。登録後はread_bit_monitorで一括読出しできる
    pub async fn register_bit_monitor(&mut self, devices: &[String]) -> Result<()> {
        let devices = devices
            .iter()
            .map(|d| normalize_device(d))
            .collect::<Result<Vec<_>>>()?;
        self.register_monitor("MBS", &devices).await
    }

    /// ワードデバイスのモニタ登録(MWS)。書式省略時は.Uで登録する
    pub async fn register_word_monitor(&mut self, devices: &[String]) -> Result<()> {
        let devices = devices
            .iter()
            .map(|d| normalize_device(d).map(|d| word_device(&d)))
            .collect::<Result<Vec<_>>>()?;
        self.register_monitor("MWS", &devices).await
    }

    async fn register_monitor(&mut self, command: &str, devices: &[String]) -> Result<()> {
        if devices.is_empty() || devices.len() > MONITOR_MAX {
            return Err(HostLinkError::InvalidCommand(format!(
                "{command}の登録数は1~{MONITOR_MAX}点です({}点)",
                devices.len()
            )));
        }
        expect_ok(self.query(&format!("{command} {}", devices.join(" "))).await?)
    }

    /// モニタ登録したビットデバイスを一括読出し(MBR)。expectedは登録した点数
    pub async fn read_bit_monitor(&mut self, expected: usize) -> Result<Vec<bool>> {
        parse_list(&self.query("MBR").await?, expected, parse_bit)
    }

    /// モニタ登録したワードデバイスを一括読出し(MWR)。expectedは登録した点数
    pub async fn read_word_monitor(&mut self, expected: usize) -> Result<Vec<i64>> {
        parse_list(&self.query("MWR").await?, expected, parse_word)
    }
}

/// テスト用の疑似PLC。受信したコマンドをhandlerに渡し、その戻り値を応答として返す
#[cfg(test)]
pub mod mock {
    use std::sync::{Arc, Mutex};

    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;

    pub struct MockPlc {
        pub port: u16,
        pub received: Arc<Mutex<Vec<String>>>,
    }

    pub async fn spawn(handler: impl Fn(&str) -> String + Send + 'static) -> MockPlc {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let received = Arc::new(Mutex::new(Vec::new()));
        let log = received.clone();
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let (reader, mut writer) = stream.into_split();
            let mut reader = BufReader::new(reader);
            let mut buf = Vec::new();
            while reader.read_until(b'\r', &mut buf).await.unwrap_or(0) > 0 {
                let command = String::from_utf8_lossy(&buf).trim_end_matches('\r').to_string();
                buf.clear();
                log.lock().unwrap().push(command.clone());
                let response = format!("{}\r\n", handler(&command));
                if writer.write_all(response.as_bytes()).await.is_err() {
                    break;
                }
            }
        });
        MockPlc { port, received }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn connect(port: u16) -> HostLinkClient {
        HostLinkClient::connect("127.0.0.1", port, Duration::from_secs(1))
            .await
            .unwrap()
    }

    #[test]
    fn normalizes_and_validates_device_names() {
        assert_eq!(normalize_device("dm0").unwrap(), "DM0");
        assert_eq!(normalize_device("MR000").unwrap(), "MR000");
        assert_eq!(normalize_device("DM10.s").unwrap(), "DM10.S");
        assert_eq!(normalize_device("B1A").unwrap(), "B1A");
        for bad in ["", "X", "0X", "DM0 1", "DM\r0","DM0.Q", "MR0;WR"] {
            assert!(normalize_device(bad).is_err(), "{bad:?} は不正とすべき");
        }
    }

    #[tokio::test]
    async fn reads_and_writes_devices() {
        let plc = mock::spawn(|cmd| match cmd {
            "?K" => "57".into(),
            "?M" => "1".into(),
            "RD X0" => "1".into(),
            "RD DM0.U" => "01234".into(),
            "WR MR0 1" | "WR DM0.U 42" => "OK".into(),
            _ => "E1".into(),
        })
        .await;
        let mut client = connect(plc.port).await;
        assert_eq!(client.model_code().await.unwrap(), "57");
        assert!(client.is_running().await.unwrap());
        assert!(client.read_bit("x0").await.unwrap());
        assert_eq!(client.read_word("DM0").await.unwrap(), 1234);
        client.write_bit("MR0", true).await.unwrap();
        client.write_word("DM0", 42).await.unwrap();
    }

    #[tokio::test]
    async fn error_code_response_becomes_plc_error() {
        let plc = mock::spawn(|_| "E0".into()).await;
        let mut client = connect(plc.port).await;
        let err = client.read_bit("X9999").await.unwrap_err();
        assert!(matches!(&err, HostLinkError::Plc { code } if code == "E0"));
        assert!(!err.is_fatal());
    }

    #[tokio::test]
    async fn monitor_registration_and_bulk_read() {
        let plc = mock::spawn(|cmd| match cmd {
            "MBS MR0 B0 X0" | "MWS DM0.U DM1.S" => "OK".into(),
            "MBR" => "1 0 1".into(),
            "MWR" => "00012 -00003".into(),
            _ => "E1".into(),
        })
        .await;
        let mut client = connect(plc.port).await;
        client
            .register_bit_monitor(&["MR0".into(), "B0".into(), "X0".into()])
            .await
            .unwrap();
        assert_eq!(client.read_bit_monitor(3).await.unwrap(), vec![true, false, true]);
        client
            .register_word_monitor(&["DM0".into(), "DM1.S".into()])
            .await
            .unwrap();
        assert_eq!(client.read_word_monitor(2).await.unwrap(), vec![12, -3]);
        //登録点数と応答の個数が合わない場合はエラー
        assert!(client.read_bit_monitor(2).await.is_err());
    }

    #[test]
    fn parses_channel_relays() {
        assert_eq!(parse_channel_relay("R58015"), Some(("R".into(), 580, 15)));
        assert_eq!(parse_channel_relay("R000"), Some(("R".into(), 0, 0)));
        assert_eq!(parse_channel_relay("R5"), Some(("R".into(), 0, 5)));
        assert_eq!(parse_channel_relay("MR1203"), Some(("MR".into(), 12, 3)));
        assert_eq!(parse_channel_relay("R58016"), None); //ビットは00~15のみ
        assert_eq!(parse_channel_relay("DM100"), None);
        assert_eq!(parse_channel_relay("X10"), None);
        assert_eq!(parse_channel_relay("B1A"), None);
    }

    #[tokio::test]
    async fn reads_relay_channels_as_hex_words() {
        let plc = mock::spawn(|cmd| match cmd {
            "RDS R58000.H 2" => "0001 8000".into(),
            "RDS R000.H 1" => "FFFF".into(),
            _ => "E1".into(),
        })
        .await;
        let mut client = connect(plc.port).await;
        assert_eq!(client.read_relay_channels("R", 580, 2).await.unwrap(), vec![0x0001, 0x8000]);
        assert_eq!(client.read_relay_channels("R", 0, 1).await.unwrap(), vec![0xFFFF]);
        assert!(client.read_relay_channels("DM", 0, 1).await.is_err());
    }

    #[tokio::test]
    async fn rejects_injected_commands() {
        let plc = mock::spawn(|_| "OK".into()).await;
        let mut client = connect(plc.port).await;
        assert!(client.query("WR MR0 1\rM0").await.is_err());
        assert!(client.write_bit("MR0 1\rM0", true).await.is_err());
        assert!(plc.received.lock().unwrap().is_empty());
    }

    /// 起動中のKV STUDIOシミュレータに接続して読出しだけを行う。
    /// cargo test -- --ignored kv_simulator で実行
    #[tokio::test]
    #[ignore]
    async fn kv_simulator_read_only() {
        let mut client = HostLinkClient::connect("127.0.0.1", 8501, Duration::from_secs(2))
            .await
            .expect("シミュレータに接続できません");
        println!("機種コード: {}", client.model_code().await.unwrap());
        println!("RUN中: {}", client.is_running().await.unwrap());
        println!("MR0: {}", client.read_bit("MR0").await.unwrap());
        println!("DM0: {}", client.read_word("DM0").await.unwrap());
        match client.register_bit_monitor(&["MR0".into(), "B0".into()]).await {
            Ok(()) => println!("MBR: {:?}", client.read_bit_monitor(2).await.unwrap()),
            Err(e) => println!("MBS非対応: {e}"),
        }
        match client.register_word_monitor(&["DM0".into(), "DM1".into()]).await {
            Ok(()) => println!("MWR: {:?}", client.read_word_monitor(2).await.unwrap()),
            Err(e) => println!("MWS非対応: {e}"),
        }
    }

    /// チャンネル読出し(.H)のビット順がxx00=ビット0であることを確認する。R58000/R58015を一時的にONにして戻す。
    /// cargo test -- --ignored --nocapture kv_simulator_relay で実行
    #[tokio::test]
    #[ignore]
    async fn kv_simulator_relay_bit_order() {
        let mut client = HostLinkClient::connect("127.0.0.1", 8501, Duration::from_secs(2))
            .await
            .expect("シミュレータに接続できません");
        for (device, expected) in [("R58000", 0x0001u16), ("R58015", 0x8000)] {
            client.write_bit(device, true).await.unwrap();
            let words = client.read_relay_channels("R", 580, 1).await.unwrap();
            client.write_bit(device, false).await.unwrap();
            println!("{device} ON → R580ch = {:04X}", words[0]);
            assert_eq!(words[0] & expected, expected, "{device} がビット位置と一致しません");
        }
    }
}
