//位置決めユニット(キーエンスKV-XH16ML/XH04ML相当)のシミュレーション。
//ラダーからはリレー(R)と専用命令(U_WRPPNT等)でのみ操作し、軸の動作(原点復帰・ポイント運転)はここで完結させる。
//リレー番号は実機の「先頭リレー+オフセット」の体系(軸nは+400×(n-1))をそのまま使い、先頭リレーはR0固定とする。
//R番号は「チャンネル×100+ビット(0~15)」形式のため、オフセットもそのまま数値として足す。

export type AxisPoint = {
    position:number, //目標座標(mm)
    speed:number, //移動速度(mm/s)
    accel:number, //加減速度(mm/s^2)
}

export type AxisConfig = {
    initialPosition:number, //電源投入時のステージ位置(mm)。原点復帰を実行するまでは原点との関係が未確定として扱う
    homeSpeed:number, //原点復帰速度(mm/s)
    homeAccel:number, //原点復帰の加減速度(mm/s^2)
    servoReadyMs:number, //サーボON要求からサーボレディになるまでの時間(ms)
    points:Record<number, AxisPoint>, //ポイント番号(1~)ごとの位置決めデータ
}

export type AxisUnitConfig = {
    axes:AxisConfig[],
}

//軸エラーコード。実機のコード体系とは異なる、このシミュレータ独自のもの
export const AXIS_ERROR = {
    NONE: 0,
    NOT_OPERABLE: 1, //動作許可OFFの状態で運転開始/運転中に動作許可がOFFになった
    SERVO_OFF: 2, //サーボがレディでない状態で運転開始/運転中にサーボがOFFになった
    NOT_HOMED: 3, //原点復帰が完了していない状態でポイント運転を開始した
    INVALID_POINT: 4, //開始ポイント番号が未登録
    FORCE_STOP: 5, //強制停止
    IN_ERROR: 6, //軸エラー中に運転を開始した
} as const;

export const AXIS_ERROR_MESSAGE:Record<number, string> = {
    0: '正常',
    1: '動作許可OFF',
    2: 'サーボレディでない',
    3: '原点復帰が未完了',
    4: '開始ポイント番号が未登録',
    5: '強制停止',
    6: '軸エラー中の運転開始',
}

//共通リレーのオフセット
const COMMON_OUT = { operationEnable: 0, forceStop: 2 } as const;
const COMMON_IN = { operable: 6600 } as const;
//軸ごとのリレーのオフセット(軸1の場合。軸nは+400×(n-1))
const AXIS_OUT = { start: 200, doneClear: 202, errorClear: 300, servoOn: 305, homeRequest: 310 } as const;
const AXIS_IN = { startAck: 6800, done: 6802, error: 6900, busy: 6903, servoReady: 6905, homeDone: 6910 } as const;

const AXIS_RELAY_STRIDE = 400;

export function commonRelay(offset:number):string {
    return `R${offset}`;
}

export function axisRelay(offset:number, axis:number):string {
    return `R${offset + AXIS_RELAY_STRIDE * (axis - 1)}`;
}

//デバイスコメントの初期値(KV STUDIOのユニットデバイスコメント相当)
export function createAxisRelayComments(axisCount:number):Record<string, string> {
    const comments:Record<string, string> = {
        [commonRelay(COMMON_OUT.operationEnable)]: '動作許可',
        [commonRelay(COMMON_OUT.forceStop)]: '強制停止',
        [commonRelay(COMMON_IN.operable)]: '動作可能',
    };
    for(let axis=1;axis<=axisCount;axis++){
        const label = `軸${axis} `;
        comments[axisRelay(AXIS_OUT.start, axis)] = label + '位置決め制御開始';
        comments[axisRelay(AXIS_OUT.doneClear, axis)] = label + '位置決め完了クリア';
        comments[axisRelay(AXIS_OUT.errorClear, axis)] = label + '軸エラークリア';
        comments[axisRelay(AXIS_OUT.servoOn, axis)] = label + 'サーボON';
        comments[axisRelay(AXIS_OUT.homeRequest, axis)] = label + '原点復帰要求';
        comments[axisRelay(AXIS_IN.startAck, axis)] = label + '位置決め制御開始完了';
        comments[axisRelay(AXIS_IN.done, axis)] = label + '位置決め完了';
        comments[axisRelay(AXIS_IN.error, axis)] = label + '軸エラー中';
        comments[axisRelay(AXIS_IN.busy, axis)] = label + '軸制御中';
        comments[axisRelay(AXIS_IN.servoReady, axis)] = label + 'サーボレディ';
        comments[axisRelay(AXIS_IN.homeDone, axis)] = label + '原点復帰完了';
    }
    return comments;
}

type Move = {
    from:number,
    to:number,
    speed:number,
    accel:number,
    duration:number, //移動時間(s)
    elapsed:number, //経過時間(s)
}

export type AxisState = {
    position:number, //現在位置(mm)
    homed:boolean, //原点復帰が完了しているか(原点復帰完了リレーとは別で、以降ずっと保持する)
    servoReady:boolean,
    servoOnElapsedMs:number,
    mode:'idle' | 'homing' | 'moving',
    move:Move | null,
    startPoint:number, //U_WRPPNTで書き込まれた開始ポイント番号
    errorCode:number,
    //入力リレーの状態
    startAck:boolean,
    done:boolean,
    homeDone:boolean,
    error:boolean,
    //出力リレーの前回値(立ち上がり検出用)
    prevStart:boolean,
    prevHomeRequest:boolean,
    prevErrorClear:boolean,
}

export function createAxisStates(config:AxisUnitConfig):AxisState[] {
    return config.axes.map(axis => ({
        position: axis.initialPosition,
        homed: false,
        servoReady: false,
        servoOnElapsedMs: 0,
        mode: 'idle',
        move: null,
        startPoint: 0,
        errorCode: AXIS_ERROR.NONE,
        startAck: false,
        done: false,
        homeDone: false,
        error: false,
        prevStart: false,
        prevHomeRequest: false,
        prevErrorClear: false,
    }));
}

function createMove(from:number, to:number, speed:number, accel:number):Move {
    const distance = Math.abs(to - from);
    const accelDistance = speed * speed / accel; //加速+減速に必要な距離
    let duration:number;
    if(distance >= accelDistance){
        duration = distance / speed + speed / accel; //台形: 加速時間+等速時間+減速時間
    }else{
        duration = 2 * Math.sqrt(distance / accel); //三角形: 最高速度に達せず減速に入る
    }
    return { from, to, speed, accel, duration, elapsed: 0 };
}

//台形(または三角形)速度パターンでの、移動開始からの走行距離(mm、常に正)
function travelled(move:Move):number {
    const distance = Math.abs(move.to - move.from);
    const t = Math.min(move.elapsed, move.duration);
    const { speed, accel } = move;
    const accelDistance = speed * speed / accel;
    const peakSpeed = distance >= accelDistance ? speed : Math.sqrt(distance * accel);
    const tAccel = peakSpeed / accel;
    const dAccel = peakSpeed * tAccel / 2;
    if(t <= tAccel) return accel * t * t / 2;
    const tCruiseEnd = move.duration - tAccel;
    if(t <= tCruiseEnd) return dAccel + peakSpeed * (t - tAccel);
    const remaining = move.duration - t;
    return distance - accel * remaining * remaining / 2;
}

//1スキャン分、軸ユニットを進める。deviceValueはラダー評価後(出力リレーが最新)の値を渡す。
//戻り値のwritesは入力リレー(ユニット→CPU)の値で、呼び出し側でdeviceValueへ書き戻す
export function stepAxisUnit(
    states:AxisState[],
    config:AxisUnitConfig,
    deviceValue:Record<string, boolean>,
    elapsedMs:number,
):{ states:AxisState[], writes:Record<string, boolean> }{
    const read = (key:string) => !!deviceValue[key];
    const writes:Record<string, boolean> = {};

    const operationEnable = read(commonRelay(COMMON_OUT.operationEnable));
    const forceStop = read(commonRelay(COMMON_OUT.forceStop));
    const operable = operationEnable && !forceStop;
    writes[commonRelay(COMMON_IN.operable)] = operable;

    const next = states.map((prev, index) => {
        const axis = index + 1;
        const axisConfig = config.axes[index];
        const s:AxisState = { ...prev };
        const relay = {
            start: read(axisRelay(AXIS_OUT.start, axis)),
            doneClear: read(axisRelay(AXIS_OUT.doneClear, axis)),
            errorClear: read(axisRelay(AXIS_OUT.errorClear, axis)),
            servoOn: read(axisRelay(AXIS_OUT.servoOn, axis)),
            homeRequest: read(axisRelay(AXIS_OUT.homeRequest, axis)),
        };

        //最初に検出した軸エラーだけを保持する(エラー中に別のエラーが起きてもコードは上書きしない)
        const raiseError = (code:number) => {
            if(s.error) return;
            s.error = true;
            s.errorCode = code;
        };
        const abortMotion = (code:number) => {
            s.mode = 'idle';
            s.move = null;
            raiseError(code);
        };

        //サーボ: ONを保持している間だけカウントし、一定時間後にレディになる
        if(relay.servoOn){
            s.servoOnElapsedMs += elapsedMs;
            s.servoReady = s.servoOnElapsedMs >= axisConfig.servoReadyMs;
        }else{
            s.servoOnElapsedMs = 0;
            s.servoReady = false;
        }

        //運転中に動作不可/サーボOFFになったら停止してエラーにする
        if(s.mode !== 'idle'){
            if(forceStop) abortMotion(AXIS_ERROR.FORCE_STOP);
            else if(!operationEnable) abortMotion(AXIS_ERROR.NOT_OPERABLE);
            else if(!s.servoReady) abortMotion(AXIS_ERROR.SERVO_OFF);
        }

        //軸エラークリア(立ち上がりで、停止中のみ有効)
        if(relay.errorClear && !s.prevErrorClear && s.mode === 'idle'){
            s.error = false;
            s.errorCode = AXIS_ERROR.NONE;
        }

        //移動を進める
        if(s.mode !== 'idle' && s.move){
            s.move = { ...s.move, elapsed: s.move.elapsed + elapsedMs / 1000 };
            const dir = Math.sign(s.move.to - s.move.from);
            if(s.move.elapsed >= s.move.duration){
                s.position = s.move.to;
                if(s.mode === 'homing'){
                    s.homed = true;
                    s.homeDone = true;
                }else{
                    s.done = true;
                }
                s.mode = 'idle';
                s.move = null;
            }else{
                s.position = s.move.from + dir * travelled(s.move);
            }
        }

        //ハンドシェイク: 要求リレーがOFFになると、対応する開始完了/完了リレーをOFFにする
        if(!relay.start) s.startAck = false;
        if(relay.doneClear) s.done = false;
        if(!relay.homeRequest) s.homeDone = false;

        //原点復帰要求(立ち上がり)
        if(relay.homeRequest && !s.prevHomeRequest && s.mode === 'idle'){
            if(!operable) raiseError(AXIS_ERROR.NOT_OPERABLE);
            else if(!s.servoReady) raiseError(AXIS_ERROR.SERVO_OFF);
            else if(s.error) { /* エラー中は開始しない(コードは保持) */ }
            else{
                s.mode = 'homing';
                s.homeDone = false;
                s.move = createMove(s.position, 0, axisConfig.homeSpeed, axisConfig.homeAccel);
            }
        }

        //位置決め制御開始(立ち上がり)。開始条件を満たさない場合も開始完了はONにして、軸エラーで知らせる
        if(relay.start && !s.prevStart && s.mode === 'idle'){
            s.startAck = true;
            const point = axisConfig.points[s.startPoint];
            if(s.error) raiseError(AXIS_ERROR.IN_ERROR);
            else if(!operable) raiseError(AXIS_ERROR.NOT_OPERABLE);
            else if(!s.servoReady) raiseError(AXIS_ERROR.SERVO_OFF);
            else if(!s.homed) raiseError(AXIS_ERROR.NOT_HOMED);
            else if(!point) raiseError(AXIS_ERROR.INVALID_POINT);
            else{
                s.mode = 'moving';
                s.done = false;
                s.move = createMove(s.position, point.position, point.speed, point.accel);
            }
        }

        s.prevStart = relay.start;
        s.prevHomeRequest = relay.homeRequest;
        s.prevErrorClear = relay.errorClear;

        writes[axisRelay(AXIS_IN.startAck, axis)] = s.startAck;
        writes[axisRelay(AXIS_IN.done, axis)] = s.done;
        writes[axisRelay(AXIS_IN.error, axis)] = s.error;
        writes[axisRelay(AXIS_IN.busy, axis)] = s.mode !== 'idle';
        writes[axisRelay(AXIS_IN.servoReady, axis)] = s.servoReady;
        writes[axisRelay(AXIS_IN.homeDone, axis)] = s.homeDone;
        return s;
    });

    return { states: next, writes };
}
