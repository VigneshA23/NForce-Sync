import type { CSSProperties } from 'react';

/**
 * Grid definition shared by the Executive Dashboard's KPI tile row and its date-range filter bar, so the
 * chips stay centred over the tiles. Change columns/gap here only. The existing `.nf-r-kpis` media rules
 * (<=1024px / <=380px) still override the columns on the tile row.
 */
export const KPI_GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 16,
};
