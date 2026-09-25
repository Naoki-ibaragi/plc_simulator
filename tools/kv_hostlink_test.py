"""KV STUDIO シミュレータ(またはKV実機)との上位リンク通信テスト

使い方:
    python kv_hostlink_test.py                 # 基本チェック(機種・モード・DM0読出し)
    python kv_hostlink_test.py -i              # 対話モード(任意のコマンドを手入力)
    python kv_hostlink_test.py --monitor X0 8  # X0から8点を周期読出しし、応答時間を計測

上位リンクコマンドの例(対話モードでそのまま入力):
    ?K              機種問い合わせ
    ?M              動作モード問い合わせ(0:PROGRAM / 1:RUN)
    RD DM0          DM0を読出し(書式省略時は.U=16bit符号なし10進)
    RD DM0.S        16bit符号あり
    RDS DM0 10      DM0から10点連続読出し
    RD X0           ビットデバイス読出し(0/1)
    RDS X0 16       X0から16点連続読出し
    WR MR0 1        MR0をON
    WR DM0 1234     DM0に1234を書込み
    WRS DM0 3 1 2 3 DM0から3点連続書込み
    ST MR0 / RS MR0 セット / リセット
"""

import argparse
import socket
import time

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8501

#上位リンクのエラー応答コード
ERROR_CODES = {
    "E0": "デバイス番号異常(存在しないデバイス/範囲外)",
    "E1": "コマンド異常(未対応コマンド/書式誤り)",
    "E2": "プログラム未登録",
    "E4": "書込み禁止",
    "E5": "本体エラー",
    "E6": "コメントなし",
}


class KvHostLink:
    def __init__(self, host: str, port: int, timeout: float = 2.0):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        self._buf = b""

    def close(self):
        self.sock.close()

    def query(self, command: str) -> str:
        """コマンドを送信し、応答1行(CR LF区切り)を返す"""
        #コマンドの終端はCR、応答の終端はCR LF
        self.sock.sendall(command.encode("ascii") + b"\r")
        while b"\r\n" not in self._buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("PLC側から切断されました")
            self._buf += chunk
        line, self._buf = self._buf.split(b"\r\n", 1)
        return line.decode("ascii", errors="replace")


def describe(response: str) -> str:
    if response in ERROR_CODES:
        return f"{response} ({ERROR_CODES[response]})"
    return response


def run_basic_check(plc: KvHostLink):
    for cmd in ["?K", "?M", "RD DM0", "RDS X0 8"]:
        try:
            t0 = time.perf_counter()
            res = plc.query(cmd)
            ms = (time.perf_counter() - t0) * 1000
            print(f"{cmd:<12} -> {describe(res):<40} ({ms:.1f} ms)")
        except socket.timeout:
            print(f"{cmd:<12} -> 応答なし(タイムアウト)")


def run_interactive(plc: KvHostLink):
    print("コマンドを入力してください(空行またはCtrl+Cで終了)")
    while True:
        try:
            cmd = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not cmd:
            break
        try:
            print(describe(plc.query(cmd)))
        except socket.timeout:
            print("応答なし(タイムアウト)")


def run_monitor(plc: KvHostLink, device: str, count: int, interval: float):
    print(f"RDS {device} {count} を {interval * 1000:.0f} ms周期で読出し中(Ctrl+Cで終了)")
    samples = []
    prev = None
    try:
        while True:
            t0 = time.perf_counter()
            res = plc.query(f"RDS {device} {count}")
            ms = (time.perf_counter() - t0) * 1000
            samples.append(ms)
            #値が変化した時だけ表示する
            if res != prev:
                print(f"[{time.strftime('%H:%M:%S')}] {describe(res)}  ({ms:.1f} ms)")
                prev = res
            time.sleep(max(0.0, interval - ms / 1000))
    except KeyboardInterrupt:
        pass
    if samples:
        samples.sort()
        print(
            f"\n応答時間: {len(samples)}回 "
            f"平均 {sum(samples) / len(samples):.2f} ms / "
            f"中央値 {samples[len(samples) // 2]:.2f} ms / 最大 {samples[-1]:.2f} ms"
        )


def main():
    parser = argparse.ArgumentParser(description="KV上位リンク通信テスト")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("-i", "--interactive", action="store_true", help="対話モード")
    parser.add_argument("--monitor", nargs=2, metavar=("DEVICE", "COUNT"), help="周期読出し")
    parser.add_argument("--interval", type=float, default=0.1, help="周期読出しの間隔[秒]")
    args = parser.parse_args()

    try:
        plc = KvHostLink(args.host, args.port)
    except OSError as e:
        print(f"接続失敗: {args.host}:{args.port} ({e})")
        print("KV STUDIOがシミュレータモードで起動しているか、通信設定・ポート番号を確認してください")
        return
    print(f"接続成功: {args.host}:{args.port}")

    try:
        if args.interactive:
            run_interactive(plc)
        elif args.monitor:
            run_monitor(plc, args.monitor[0], int(args.monitor[1]), args.interval)
        else:
            run_basic_check(plc)
    finally:
        plc.close()


if __name__ == "__main__":
    main()
