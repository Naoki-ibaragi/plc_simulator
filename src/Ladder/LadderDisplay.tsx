import { type ladderCell } from './Variants'
import LadderImage from './Components/LadderImage'
import { useContext } from 'react'

function LadderDisplay({ ladderMap, deviceComment }: { ladderMap: ladderCell[][], deviceComment: {[key:string]:string} }) {
  return (
    <>
      <div className='flex flex-col '>
        <div className='flex gap-0'>
          <span className='font-bold w-12 bg-gray-300'></span>
          {ladderMap[0]?.map((_, x) => (
            <span key={x} className='font-bold bg-cyan-500 w-20 text-center border border-gray-300'>{x + 1}</span>
          ))}
        </div>
        {ladderMap.map((row, y) => (
          <div key={y} className='flex'>
              <span className='font-bold w-12 bg-cyan-500 flex items-center justify-center'>{y+1}</span>
              {row.map((cell, x) => (
                <span key={x}><LadderImage 
                cell={cell.cell} 
                device={cell.device}
                comment={cell.device ? deviceComment[cell.device]:""}
                row={y} 
                col={x}
                hasLine={cell.hasLine}></LadderImage></span>
              ))}
          </div>
        ))}
      </div>
    </>
  )
}

export default LadderDisplay