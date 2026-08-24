import whatisplc from "../assets/PLC/whatisplc.png"
import { MathJax } from 'better-react-mathjax'
import PageLayout, { FigureImage, MathBlock, NextLink } from './PageLayout'

function AbountPLC() {
  return (
    <PageLayout title="PLCとは">
      <p>
        初めてPLCを学習する方はPCとPLCで何が違うのかということをまず理解しましょう<br/>
        PCもPLCも演算処理をするCPU、データを保持するメモリがある点は同じです<br/>
        PCアプリケーションの処理はテキストデータや画像の処理などPC内で完結処理を実施することがほとんどです<br/>
        一方でPLCは現実世界の情報を受け取り、そのデータを活用して、現実世界の機器を動かします<br/>
        そのため下図のように、PLCにはCPU・メモリーに加えて、外部からの入力を受け取る入力ユニット、外部へ情報を出力する出力ユニットが付属しています
      </p>
      <FigureImage src={whatisplc} alt="PCとPLCの違い" />
      <p>
        PLCが実行している内容は数式で表すと下記の様な形になります<br/>
        後述しますが、一般的にPLCではセンサやボタン等からの入力データを X を用いて表します<br/>
        それに対して、ライトをつけたり、電磁弁を操作したりする出力データを Y を用いて表します<br/>
        つまり、入力 X を受け取って、それを演算して出力 Y を返します<br/>
        PLCのプログラムを作成することは、この関数fを定義することになります<br/>
      </p>
      <MathBlock>
        <MathJax>{"$$Y_0, Y_1, Y_2, \\dots, Y_{15} = f(X_0, X_1, X_2, \\dots, X_{15})$$"}</MathJax>
      </MathBlock>
      <p>
        また、もう一つ重要な点はPLCは電源がついている間この処理を永遠に繰り返します<br/>
        PLCプログラム内にループ処理を明記はしないですが、プログラムは実行され続けています<br/>
        ループが回るたびに、その時点での入力X0,X1,X2...の値に応じて出力Y0,Y1,Y2...を出力します<br/>
        つまり数式で表示すると下記になります<br/>
      </p>
      <MathBlock>
        <MathJax>
          {"$$\\begin{array}{l} \\mathtt{while\\ True:} \\\\ \\quad Y_0, Y_1, Y_2, \\dots, Y_{15} = f(X_0, X_1, X_2, \\dots, X_{15}) \\end{array}$$"}
        </MathJax>
      </MathBlock>
      <p>
        以上がPLCに関する説明になります<br/>
        続いては、PLCのプログラム方法であるラダー言語について説明します<br/>
      </p>
      <NextLink to="/aboutLadder">ラダー言語とは</NextLink>
    </PageLayout>
  )
}

export default AbountPLC
