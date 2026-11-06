import { describe, expect, it } from 'vitest';
import { audit, routeAudit } from './audit';
import { createWorld } from '../src/sim/world';
import { spotFor } from '../src/sim/paths';

describe('overlap audit (nothing intersects buildings, roads stay clear)', () => {
  it('reports no intersections between buildings, furniture, trees and roads', () => {
    const { issues } = audit();
    if (issues.length) console.log(issues.length + ' issues\n' + issues.slice(0, 80).join('\n'));
    expect(issues).toEqual([]);
  });
  it('pedestrian routes never pass through buildings or walk down the middle of the road', () => {
    const { issues, legs } = routeAudit();
    if (issues.length) console.log(issues.length + ' issues of ' + legs + ' legs\n' + [...new Set(issues)].slice(0, 60).join('\n'));
    expect(issues).toEqual([]);
  });
  it('the seaside gazebo stands clear of the people strolling round the lighthouse', () => {
    const w = createWorld();
    const g = audit(w).B.parts.filter(p => p.tag === 'gazebo');
    expect(g.length).toBeGreaterThan(10);
    const x0 = Math.min(...g.map(p => p.min[0])), x1 = Math.max(...g.map(p => p.max[0])), z0 = Math.min(...g.map(p => p.min[2])), z1 = Math.max(...g.map(p => p.max[2]));
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 4; j++) {
      const s = spotFor(w.buildings.b_lookout, i / 10, j / 4, w);
      const dx = Math.max(x0 - s.x, 0, s.x - x1), dz = Math.max(z0 - s.z, 0, s.z - z1);
      expect(Math.hypot(dx, dz)).toBeGreaterThan(1.8 + 0.4); // wander radius + body
    }
  });
});
