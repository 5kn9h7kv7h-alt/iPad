// "Postcard" compositions that mirror the reference board (aerial, old town, harbour, residential,
// station, seaside, night, building details). Used by the look-dev comparison and by the cinematic camera.
export interface Postcard { id: string; label: string; hour: number; pos: [number, number, number]; look: [number, number, number] }

export const POSTCARDS: Postcard[] = [
  { id: 'aerial', label: '全体俯瞰', hour: 17.55, pos: [92, 42, 150], look: [-12, 4, -10] },
  { id: 'oldtown', label: '旧市街', hour: 16.9, pos: [-38.6, 2.2, 8], look: [-44, 2.8, -14] },
  { id: 'harbor', label: '港湾地区', hour: 17.35, pos: [-60, 3.5, 64], look: [-36, 3, 44] },
  { id: 'residential', label: '住宅地区', hour: 17.1, pos: [12.5, 2.0, -6], look: [6, 2.5, -24] },
  { id: 'station', label: '駅前地区', hour: 16.6, pos: [-8, 4.5, -25], look: [-28, 3.5, -44] },
  { id: 'seaside', label: '海岸地区', hour: 17.5, pos: [62, 2.6, 51.5], look: [84, 2.2, 45.5] },
  { id: 'night', label: '夜の街並み', hour: 21.0, pos: [20, 16, 128], look: [-18, 4, 4] },
  { id: 'details', label: '建物のディテール', hour: 16.4, pos: [-37.8, 3.0, -3.5], look: [-45.5, 4.0, -9.5] },
];
