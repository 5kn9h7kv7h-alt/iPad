// Quality tiers. The default for touch devices (iPhone) is "mid"; desktops get "high".
// Budgets are what V7 will enforce in the e2e check (tests/e2e/smoke.mjs).
export type QualityTier = 'low' | 'mid' | 'high';

export interface QualityParams {
  dprMax: number;
  shadows: boolean;
  shadowMap: number;
  shadowRange: number;     // half-size (world units) of the shadow frustum that follows the camera target
  antialias: boolean;
  rainDrops: number;
  seaSegments: [number, number];
  terrainSegments: [number, number];
  treeDetail: 0 | 1;       // crown mesh subdivision
  post: null | { bloomScale: number; multisampling: number }; // bloom + grade (null = renderer tone mapping only)
  driftParticles: number;  // seasonal petals / leaves
  hiResidents: number;     // nearest residents drawn with rigged, animated models
  treeScale: number;       // 0..1 share of trees drawn
  budget: { drawCalls: number; triangles: number };
}

export const QUALITY: Record<QualityTier, QualityParams> = {
  low: { dprMax: 1, shadows: false, shadowMap: 512, shadowRange: 60, antialias: false, rainDrops: 500, seaSegments: [48, 24], terrainSegments: [90, 70], treeDetail: 0, post: null, driftParticles: 0, hiResidents: 0, treeScale: 0.5, budget: { drawCalls: 100, triangles: 150_000 } },
  mid: { dprMax: 1.75, shadows: true, shadowMap: 1024, shadowRange: 70, antialias: true, rainDrops: 1000, seaSegments: [80, 40], terrainSegments: [130, 100], treeDetail: 1, post: { bloomScale: 0.5, multisampling: 4 }, driftParticles: 120, hiResidents: 8, treeScale: 0.75, budget: { drawCalls: 150, triangles: 300_000 } },
  high: { dprMax: 2, shadows: true, shadowMap: 2048, shadowRange: 90, antialias: true, rainDrops: 1800, seaSegments: [128, 64], terrainSegments: [180, 140], treeDetail: 1, post: { bloomScale: 0.75, multisampling: 4 }, driftParticles: 260, hiResidents: 14, treeScale: 1, budget: { drawCalls: 300, triangles: 800_000 } },
};

const KEY = 'afterlife.quality';

export function detectTier(): QualityTier {
  try {
    const q = new URLSearchParams(location.search).get('quality') ?? localStorage.getItem(KEY);
    if (q === 'low' || q === 'mid' || q === 'high') return q;
  } catch { /* storage unavailable */ }
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return touch ? 'mid' : 'high';
}

export function saveTier(t: QualityTier): void {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}
