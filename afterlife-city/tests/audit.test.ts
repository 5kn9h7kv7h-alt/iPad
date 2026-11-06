import { describe, expect, it } from 'vitest';
import { audit, routeAudit } from './audit';

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
});
