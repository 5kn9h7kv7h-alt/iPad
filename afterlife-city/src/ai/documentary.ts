// LIFE DOCUMENTARY: facts come from stored events/memories; AI may only narrate them.
import { formatDate } from '../sim/clock';
import { AREA_LABEL, MOOD_LABEL, type WorldState } from '../sim/types';

export interface Documentary { title: string; paragraphs: string[]; facts: string[]; source: 'rules' | 'ai' }

export function lifeFacts(w: WorldState, citizenId: string): string[] {
  const c = w.citizens[citizenId];
  const events = c.lifeEvents.map(id => w.events.find(e => e.id === id)).filter(Boolean) as typeof w.events;
  return events.sort((a, b) => a.time - b.time).map(e => `${formatDate(w.startDate, e.time)}：${e.summary}`);
}

export function documentaryFallback(w: WorldState, citizenId: string): Documentary {
  const c = w.citizens[citizenId];
  const facts = lifeFacts(w, citizenId);
  const home = w.buildings[c.homeId];
  const work = c.workplaceId ? w.buildings[c.workplaceId] : null;
  const paras: string[] = [];
  paras.push(`${c.name}、${c.age}歳。${AREA_LABEL[home.area].split(' ')[0]}の${home.name}で暮らし、${work ? `${work.name}で${c.occupation}として働いている` : `${c.occupation}として自分の時間を生きている`}。`);
  paras.push(`好きなものは${c.interests.slice(0, 3).join('、')}。いま心にあるのは「${c.currentGoal}」ということ。今日の気分は${MOOD_LABEL[c.currentMood]}。`);
  if (facts.length) {
    paras.push('この街で、こんなことがあった。');
    paras.push(facts.slice(-5).join('。\n') + '。');
  } else paras.push('まだ、語るほどの出来事は起きていない。けれど、毎日は静かに積み重なっていく。');
  const mem = [...c.memories].sort((a, b) => b.importance - a.importance)[0];
  if (mem) paras.push(`いちばん強く残っている記憶は、「${mem.summary}」。`);
  return { title: `${c.name}のある一日と、これまで`, paragraphs: paras, facts, source: 'rules' };
}
