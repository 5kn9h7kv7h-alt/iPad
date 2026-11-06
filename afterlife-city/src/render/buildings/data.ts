import type { Anchor } from './batch';
/** Filled by <Buildings/> whenever the city geometry is rebuilt; read (never written) by citizens, lamp pools and the camera. */
export const cityData: { anchors: Anchor[]; boxes: { x: number; z: number; hw: number; hd: number; h: number }[]; version: number } = { anchors: [], boxes: [], version: 0 };
