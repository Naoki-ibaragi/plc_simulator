import { type ladderCell } from './Variants'
import LadderImage from './Components/LadderImage'

function LadderDisplay({ ladderMap, deviceComment }: { ladderMap: ladderCell[][], deviceComment: {[key:string]:string} }) {
  return (
    <>
      <div className='flex flex-col '>
        <div className='flex gap-0'>
          <span className='shrink-0 w-12 bg-gray-100'></span>
          {ladderMap[0]?.map((_, x) => (
            <span key={x} className='shrink-0 bg-cyan-100 w-20 text-center border border-gray-300'>{x + 1}</span>
          ))}
        </div>
        {ladderMap.map((row, y) => (
          <div key={y} className='flex'>
              <span className='shrink-0 w-12 bg-cyan-100 flex items-center justify-center'>{String(y+1).padStart(3, '0')}</span>
              {row.map((cell, x) => (
                <span key={x} className='shrink-0'><LadderImage
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