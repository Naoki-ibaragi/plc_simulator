import devicemap from "../assets/Device/deviceMap.png"
import internalRelay from "../assets/Device/InternalRelay.png"
import PageLayout, { FigureImage, NextLink } from './PageLayout'

function AboutDevice() {
  return (
    <PageLayout title="デバイスとは">
      <p>
        デバイスは大きく2種類に分けることができます。
        ビットデバイスとワードデバイスです。
        ビットデバイスは1bitの情報を持ちます。つまり、0か1を値として持ちます。
        ビットデバイスにはX,Y,MRといったデバイスがあります。
        これまで説明したようにXは外部からの入力情報を受け取るデバイス、Yは外部への出力情報を持つデバイスです。
        MRは内部リレーと呼ばれ、PLC内部でビット情報を保持するために使用します。
        例えば、下記の様な使用方法ができます。
      </p>
      <FigureImage src={internalRelay} alt="内部リレーの使用例" />
      <p>
        ワードデバイスは各デバイスが16bit分の情報を持ちます。
        ビットデバイスは0か1しか扱えませんが、こちらは<br />
        16bit符号なし 0 ~ +65535(2^16-1) もしくは<br />
        16bit符号あり -32768(2^15) ~ +32767(2^15-1)<br />
        を扱うことができます。
        実際にラダー図の中でその数値が符号あり・なしどちらを指すかは指定してあげる必要があります。
        例えば、何かカウントを保存する変数としてワードデバイスを使用するのであれば、符号なし16bitとして使用します。
        モーターの座標指定用で使用するのであれば、符号つき16bitとして使用する必要があります。
        一般的には特に指定しなければ16bit符号なしがデフォルトとして使用されます。
        符号ありを指定したければDM0.Sのように接尾辞をつけて指定します。
        このあたりの話は後程実際にラダー図を描きながら学習しましょう。
      </p>
      <FigureImage src={devicemap} alt="PLCのメモリマップ" />
      <p>
        PLCのメモリマップは下記のようになります。
        本サイトのシミュレータでは入力リレー・出力リレー・内部リレーそれぞれ32bitずつ割り当てられています。
        データメモリーは32word(16bit×32個)分用意されています。
      </p>
      <NextLink to="/aboutTouchpanel">タッチパネルとは</NextLink>
    </PageLayout>
  )
}

export default AboutDevice
