// Template (non-AI) dialogue. AI-generated text may replace this later, but outcomes are decided by the engine.
import { pick, rand } from './rng';
import type { Citizen, Relationship, WorldState } from './types';

export type Topic = 'greeting' | 'weather' | 'interest' | 'work' | 'worry' | 'rumor' | 'plan';
type Line = { speakerId: string; text: string };

const WEATHER_TXT: Record<string, string[]> = {
  clear: ['いい天気ですね。', '今日は海がきれいですよ。', '日差しが気持ちいいですね。'],
  cloudy: ['雲が厚いですね。', '降らないといいんですが。', '少し肌寒いですね。'],
  rain: ['よく降りますね。', '雨の日は足元が大変で。', '雨音を聞いていると落ち着きます。'],
  fog: ['今日は霧が深いですね。', '港の汽笛だけが聞こえます。', '霧の街もいいものですね。'],
};

export function chooseTopic(w: WorldState, a: Citizen, b: Citizen, rel: Relationship): Topic {
  if (rel.meetings === 0 && rel.familiarity < 25) return 'greeting';
  const r = rand(w);
  if (rel.sharedInterest && r < 0.35) return 'interest';
  if (r < 0.55) return 'weather';
  if (r < 0.75) return 'work';
  if (r < 0.88 && rel.trust > 40) return 'worry';
  if (r < 0.95) return 'rumor';
  return 'plan';
}

export function makeDialogue(
  w: WorldState, a: Citizen, b: Citizen, rel: Relationship, topic: Topic, placeName: string, tone: 'warm' | 'neutral' | 'tense',
): Line[] {
  const A = (text: string): Line => ({ speakerId: a.id, text });
  const Bl = (text: string): Line => ({ speakerId: b.id, text });
  const first = (c: Citizen) => c.name.split(' ')[0];
  if (tone === 'tense') {
    return [
      A(pick(w, ['……どうも。', 'ああ、あなたですか。', 'こんなところで会うとはね。'])),
      Bl(pick(w, ['何か用ですか。', '……ええ。', '最近、少し言い方がきつくないですか。'])),
      A(pick(w, ['いえ、別に。', 'そういうつもりじゃ……。', 'そう聞こえたなら、失礼しました。'])),
    ];
  }
  switch (topic) {
    case 'greeting':
      return [
        A(`はじめまして、${a.name}です。${placeName}にはよく来るんですか？`),
        Bl(`${b.name}です。${b.occupation}をしています。この辺りはよく通るんです。`),
        A(`そうなんですね。これから、よろしくお願いします。`),
      ];
    case 'weather': {
      const lines = WEATHER_TXT[w.env.weather];
      return [A(pick(w, lines)), Bl(pick(w, ['本当に。' + pick(w, lines), 'ええ、この季節らしいですね。', `${Math.round(w.env.temperature)}度くらいでしょうか。`]))];
    }
    case 'interest': {
      const i = rel.sharedInterest ?? a.interests[0];
      return [
        A(`${first(b)}さんも${i}がお好きだと聞きました。`),
        Bl(pick(w, [`ええ、時間があればつい${i}のことばかり。`, `そうなんです。${first(a)}さんもですか？`])),
        A(pick(w, ['今度、ゆっくり話しましょう。', '最近のお気に入りを教えてください。'])),
      ];
    }
    case 'work':
      return [
        A(`${b.occupation}のお仕事、最近どうですか？`),
        Bl(pick(w, ['忙しいけれど、悪くないですよ。', '変わらず、というところです。', '天気に振り回されっぱなしです。'])),
        A(`${a.occupation}の方も似たようなものです。お互い無理せずに。`),
      ];
    case 'worry':
      return [
        Bl(pick(w, ['実は最近、少し考えごとが多くて。', '眠りが浅い日が続いているんです。'])),
        A(pick(w, ['話すだけでも楽になりますよ。', '私でよければ、いつでも聞きます。'])),
        Bl('ありがとうございます。助かります。'),
      ];
    case 'rumor':
      return [
        A(pick(w, ['聞きました？ 港のほうで、何か動きがあるらしいですよ。', '最近、あの辺りで見慣れない人を見かけるそうです。', '商店街の話、聞きました？'])),
        Bl(pick(w, ['本当ですか。気になりますね。', '噂ですよね、まだ。', 'へえ、知りませんでした。'])),
      ];
    default:
      return [
        A(pick(w, ['今度、一緒にお茶でもどうですか。', '週末、海岸まで歩きませんか。'])),
        Bl(pick(w, ['いいですね、ぜひ。', '予定が合えば、ぜひ。'])),
      ];
  }
}
