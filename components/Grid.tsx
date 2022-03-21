import { GridRow } from './GridRow';

interface IGrid {
   grid: Entities.GridTile[][]
}

export const Grid = ({ grid } : IGrid) => {
   return (
      <div className='grid flippable'> {
         grid.map((row) => (
            <GridRow row={row} key={row[0].rowIndex}></GridRow>
         ))
      }
      </div>
   )
}