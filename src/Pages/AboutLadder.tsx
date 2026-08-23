import {MathJax} from 'better-react-mathjax';
import { Link } from 'react-router-dom'

function AboutLadder() {
  return (
    <div>
        <div className='flex justify-center text-xl text-gray-800'>ラダー言語とは</div>
        <div className='flex justify-center mt-4 text-gray-800'>
            PLCのプログラムの書き方はPCのプログラミング言語とは異なり、ラダー図を使用します。
            これは視覚で直感的に内容を理解できるため、プログラミング未経験の方でも比較的簡単に習得できます。
            このページではラダー言語の記法について簡単に説明します。
            ※発展的な内容については、本サイトのシミュレータを使用して学ぶことができます。
        </div>
        <div className='flex justify-center mt-4 text-gray-800'>
            初めに最も基本的なラダー図を示します。
        </div>
        <img></img>
        <div className='flex justify-center mt-4 text-gray-800'>
            これは下記を表しています。
            <MathJax>
                {"$$\\begin{array}{l} \\mathtt{if\\ X0 == True:} \\\\ \\quad \\mathtt{Y0 = True} \\\\ \\mathtt{else\\ if\\ X0 == False:} \\\\ \\quad \\mathtt{Y0 = False} \\end{array}$$"}
            </MathJax>
        </div>
        <div className='flex justify-center mt-4 text-gray-800'>
            ラダー図は左から右に向けて読み進めます。左側の条件が成り立つと右側に進むます。条件が成り立たないとそこでストップしてしまいます。
            A接点は割り当てられたデバイスがTrueであることを確認します。コイルは常に行の一番右側に置かれ、左側の条件が成立していればTrueになり、成立していなければFalseになります。
            例えば上記の例で、X0にボタンの入力を割り当て、Y0にランプの出力を割り当てた場合、ボタンを押している間だけランプを点灯させる制御はこのプログラムで実現できます。
        </div>
        <div className='flex justify-center mt-4 text-gray-800'>
            続いてAND回路を示します。
            その名前の通り2つ以上の条件が同時に成り立つかを確認する回路です。
            ラダー図では下記の様な書き方をします。
        </div>
        <img></img>
        <div className='flex justify-center mt-4 text-gray-800'>
            数式で書くと下記になります。
            <MathJax>
                {"$$\\begin{array}{l} \\mathtt{if\\ X0 == True:} \\\\ \\quad \\mathtt{Y0 = True} \\\\ \\mathtt{else\\ if\\ X0 == False:} \\\\ \\quad \\mathtt{Y0 = False} \\end{array}$$"}
            </MathJax>
        </div>
        <div className='flex justify-center mt-4 text-gray-800'>
            続いてOR回路を示します。
            その名前の通り2つ以上の条件がいずれか成り立つかを確認する回路です。
            ラダー図では下記の様な書き方をします。
        </div>
        <img></img>
        <div className='flex justify-center mt-4 text-gray-800'>
            数式で書くと下記になります。
            <MathJax>
                {"$$\\begin{array}{l} \\mathtt{if\\ X0 == True:} \\\\ \\quad \\mathtt{Y0 = True} \\\\ \\mathtt{else\\ if\\ X0 == False:} \\\\ \\quad \\mathtt{Y0 = False} \\end{array}$$"}
            </MathJax>
        </div>
        <div className='flex justify-center mt-4 text-gray-800'>
            以上が基本的なラダー図の説明になります。
            このサイトでは実際にブラウザ上でラダーを書くことができますので、この後しっかり身に着けることができます。
            つぎはラダー言語を構成するデバイスについて学習しましょう
        </div>
        <Link to={"/aboutDevice"} className='text-l text-gray-800'>・デバイスとは</Link>
    </div>
  )
}

export default AboutLadder