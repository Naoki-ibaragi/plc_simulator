import devicemap from "../assets/Device/deviceMap.png"

function AboutDevice() {
  return (
    <div>
      <div className='flex justify-center text-xl text-gray-800'>デバイスとは</div>
      <div className='flex justify-center text-gray-800'>
        デバイスは大きく2種類に分けることができます。
        ビットデバイスとワードデバイスです。
        ビットデバイスは1bitの情報を持ちます。つまり、0か1を値として持ちます。
        ビットデバイスにはX,Y,MRといったデバイスがあります。
        これまで説明したようにXは外部からの入力情報を受け取るデバイス、Yは外部への出力情報を持つデバイスです。
        MRは内部リレーと呼ばれ、PLC内部でビット情報を保持するために使用します。
        例えば、下記の様な使用方法ができます。
        
        ワードデバイスは各デバイスが16bit分の情報を持ちます。
      </div>
      <img className='w-[35%]' src={devicemap}></img>
      <div className='flex justify-center text-gray-800'>
        PLCを扱う上で一つだけ数学的な概念を理解しておきたいです。
        それが2進数、10進数、16進数です。
        初めて学習する方は少し理解が難しいポイントです。
        時間がかかっても大丈夫です。ゆっくり理解しましょう。
        PCも含めて、情報は全て0か1で保存されています。
        イメージとしては、エクセルの様な2次元のマス目に0か1が並んでいる形です。
        C言語等のプログラミング言語ではメモリ操作をする際に0x0000や0x00FFのような数値でメモリ番地を指定しますが、それがPLCではX0やY0の様な文字列を使用することになります。
        分かりにくい数値ではなく、文字列でメモリ番地をさせるとてもユーザーフレンドリーな設計になっています。
        PLCのメモリマップは下記のようになります。
      </div>
      <img></img>
      <div className='flex justify-center text-gray-800'>

      </div>


    </div>

  )
}

export default AboutDevice