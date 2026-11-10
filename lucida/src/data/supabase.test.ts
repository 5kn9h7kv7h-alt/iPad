import { describe, expect, it } from 'vitest';
import { fromRow, toRow } from './supabase';

describe('Supabase の行変換', () => {
  it('camelCase ⇄ snake_case を変換し、user_id を付ける', () => {
    expect(toRow({ id: 'e', sourceNode: 'a', targetNode: 'b', createdAt: 't' }, 'u1')).toEqual({ id: 'e', source_node: 'a', target_node: 'b', created_at: 't', user_id: 'u1' });
    expect(fromRow({ id: 'e', source_node: 'a', ai_analysis: { facts: [] }, user_id: 'u1' })).toEqual({ id: 'e', sourceNode: 'a', aiAnalysis: { facts: [] } });
  });
  it('undefined は null にして列を消せる。読み出しでは null を未設定として落とす', () => {
    expect(toRow({ id: 'n', x: undefined, y: 3 }, 'u')).toEqual({ id: 'n', x: null, y: 3, user_id: 'u' });
    const back = fromRow({ id: 'n', x: null, y: 3, hidden: false, user_id: 'u' });
    expect(back).toEqual({ id: 'n', y: 3, hidden: false });
    expect('x' in back).toBe(false);
  });
});
