import PageLayout from './PageLayout'

function AboutTouchpanel() {
  return (
    <PageLayout title="タッチパネルについて">
      <p>
        ここまでPLCについて説明を実施してきましたが、実際の設備ではPLCとセットでタッチパネルがついていることがほとんどです。
        タッチパネルはHMI(Human machine interface)とも呼ばれ、人と機械の接点となるデバイスとのことです。
        PCと異なり、PLCにはディスプレイがついていないため、PLCの状態やPLCが持っているセンサの状態やモーターの位置情報を人が視認することはできません。
        人が視認できないと装置の状態をぱっと確認できないため、非常に不便です。そのためにタッチパネルにPLCの状態を表示するようにします。
      </p>
      <p>
        本サイトのシミュレータにも簡単にですが、タッチパネル機能を模したシミュレータを設置しています。
        タッチパネルでできることは、タッチパネル側から特定のデバイスの状態を変えたり、あるデバイスがONしたらタッチパネル上のランプを光らせたりします。
      </p>
    </PageLayout>
  )
}

export default AboutTouchpanel
