import { MathJax } from 'better-react-mathjax'
import PageLayout, { FigurePlaceholder, MathBlock, NextLink } from './PageLayout'

function AboutLadder() {
  return (
    <PageLayout title="ラダー言語とは">
      <p>
        PLCのプログラムの書き方はPCのプログラミング言語とは異なり、ラダー図を使用します<br/>
        これは視覚的に内容を理解できるため、プログラミング未経験の方でも比較的簡単に理解できます<br/>
        このページではラダー言語の記法について簡単に説明します<br/>
        ※発展的な内容については、本サイトのシミュレータを使用して学ぶことができます
      </p>
      <p>初めに最も基本的なラダー図を示します。</p>
      <FigurePlaceholder label="基本のラダー図" />
      <p>
        ラダー図は左から右に向けて読み進めます<br/>
        左側の条件が成り立つと右側に進むます。<br/>
        また、ラダー図上の2つの記号はそれぞれA接点、コイルと呼びます。
        これらは最も基本的な記号なので覚えてください<br/>
        A接点はそのデバイスがON状態だと条件が成立し、右側へ処理を進めます。デバイスがOFF状態だとそこより右側へ処理を進めません<br/>
        コイルはコイルまで
        逆にデバイスがOFF状態だと条件が成立するものをB接点と呼びます。記号ではA接点にスラッシュを引いたものになります。
        つまり入力X0がONすると、出力Y0をON、入力X0がOFFであれば出力Y0をOFFするということです
        これはプログラミング言語で表記すると下記を表しています<br/>
      </p>
      <MathBlock>
        <MathJax>
          {"$$\\begin{array}{l} \\mathtt{if\\ X0 == True:} \\\\ \\quad \\mathtt{Y0 = True} \\\\ \\mathtt{else\\ if\\ X0 == False:} \\\\ \\quad \\mathtt{Y0 = False} \\end{array}$$"}
        </MathJax>
      </MathBlock>
      <p>
        ラダー図は左から右に向けて読み進めます。左側の条件が成り立つと右側に進むます。条件が成り立たないとそこでストップしてしまいます。
        A接点は割り当てられたデバイスがTrueであることを確認します。コイルは常に行の一番右側に置かれ、左側の条件が成立していればTrueになり、成立していなければFalseになります。
        例えば上記の例で、X0にボタンの入力を割り当て、Y0にランプの出力を割り当てた場合、ボタンを押している間だけランプを点灯させる制御はこのプログラムで実現できます。
      </p>
      <p>
        続いてAND回路を示します。
        その名前の通り2つ以上の条件が同時に成り立つかを確認する回路です。
        ラダー図では下記の様な書き方をします。
      </p>
      <FigurePlaceholder label="AND回路のラダー図" />
      <p>数式で書くと下記になります。</p>
      <MathBlock>
        <MathJax>
          {"$$\\begin{array}{l} \\mathtt{if\\ X0 == True:} \\\\ \\quad \\mathtt{Y0 = True} \\\\ \\mathtt{else\\ if\\ X0 == False:} \\\\ \\quad \\mathtt{Y0 = False} \\end{array}$$"}
        </MathJax>
      </MathBlock>
      <p>
        続いてOR回路を示します。
        その名前の通り2つ以上の条件がいずれか成り立つかを確認する回路です。
        ラダー図では下記の様な書き方をします。
      </p>
      <FigurePlaceholder label="OR回路のラダー図" />
      <p>数式で書くと下記になります。</p>
      <MathBlock>
        <MathJax>
          {"$$\\begin{array}{l} \\mathtt{if\\ X0 == True:} \\\\ \\quad \\mathtt{Y0 = True} \\\\ \\mathtt{else\\ if\\ X0 == False:} \\\\ \\quad \\mathtt{Y0 = False} \\end{array}$$"}
        </MathJax>
      </MathBlock>
      <p>
        以上が基本的なラダー図の説明になります。
        このサイトでは実際にブラウザ上でラダーを書くことができますので、この後しっかり身に着けることができます。
        つぎはラダー言語を構成するデバイスについて学習しましょう
      </p>
      <NextLink to="/aboutDevice">デバイスとは</NextLink>
    </PageLayout>
  )
}

export default AboutLadder
