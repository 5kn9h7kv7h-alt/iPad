// "Postcard" compositions that mirror the reference board (aerial, old town, harbour, residential,
// station, seaside, night, building details). Used by the look-dev comparison and by the cinematic camera.
export interface Postcard { id: string; label: string; hour: number; pos: [number, number, number]; look: [number, number, number] }

export const POSTCARDS: Postcard[] = [
  { id: 'aerial', label: '全体俯瞰', hour: 17.55, pos: [92, 42, 150], look: [-12, 4, -10] },
  { id: 'oldtown', label: '旧市街', hour: 16.9, pos: [-38.4, 2.1, 3.0], look: [-55, 2.2, -10] },
  { id: 'harbor', label: '港湾地区', hour: 17.35, pos: [-14, 3.6, 76], look: [-58, 3, 42] },
  { id: 'residential', label: '住宅地区', hour: 17.1, pos: [13.2, 2.4, -25.8], look: [26, 3, -46] },
  { id: 'station', label: '駅前地区', hour: 16.6, pos: [-11, 3.4, -27], look: [-30, 3, -45] },
  { id: 'seaside', label: '海岸地区', hour: 17.5, pos: [22, 2.2, 50.2], look: [64, 3, 46] },
  { id: 'night', label: '夜の街並み', hour: 21.0, pos: [20, 16, 128], look: [-18, 4, 4] },
  { id: 'details', label: '建物のディテール', hour: 16.4, pos: [-41.5, 2.0, 7.8], look: [-48, 3.2, 9.5] },
];
