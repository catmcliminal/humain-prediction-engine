import { describe, expect, it } from 'vitest';
import { RAID, CYBER_MIN, LEVEL_UP_VOTES, SHOOT_DOWN_MIN, FREEZE_AT } from '../src/shared/constants';
import { derive, fleetRows, leaderOf, raidTarget, shotTargets } from '../src/shared/game';
import { emptyState, type GameState } from '../src/shared/types';

const NOW = 1_800_000_000_000;
function game(): GameState {
  const s = emptyState();
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) s.players[id] = { name: id.toUpperCase(), color: '#fff', ts: id.charCodeAt(0) };
  return s;
}
const add = (s: GameState, id: string, pid: string, tag: number, ts = NOW) => { s.preds[id] = { pid, text: 'text ' + id + ' long enough', tag, ts }; };
const vote = (s: GameState, id: string, n: number) => { s.votes[id] = Object.fromEntries('bcdefg'.slice(0, n).split('').map((u) => [u, true])); };
const rate = (s: GameState, id: string, ...r: number[]) => { s.ratings[id] = Object.fromEntries(r.map((v, i) => ['rater' + i, v])); };
const down = (s: GameState, id: string, n: number) => { s.downs[id] = Object.fromEntries(Array.from({ length: n }, (_, i) => ['d' + i, true])); };
const one = (s: GameState, id: string) => derive(s).preds.find((p) => p.id === id)!;

describe('freeze constant', () => {
  it('is midnight NYE Sydney (AEDT)', () => expect(FREEZE_AT).toBe(Date.parse('2027-01-01T00:00:00+11:00')));
});

describe('scoring', () => {
  it('scores votes x 100 x the author tag before 3 ratings', () => {
    const s = game(); add(s, 'p1', 'a', 4); vote(s, 'p1', 3);
    expect(one(s, 'p1').points).toBe(3 * 100 * 4);
  });
  it('ignores the tag once 3 ratings exist and uses the crowd average', () => {
    const s = game(); add(s, 'p1', 'a', 5); vote(s, 'p1', 2); rate(s, 'p1', 2, 2, 3); // avg 2.333
    const p = one(s, 'p1');
    expect(p.useCrowd).toBe(true);
    expect(p.points).toBe(Math.round(2 * 100 * (7 / 3)));
  });
  it('does not use the crowd with only 2 ratings', () => {
    const s = game(); add(s, 'p1', 'a', 5); vote(s, 'p1', 1); rate(s, 'p1', 1, 1);
    expect(one(s, 'p1').lvl).toBe(5);
  });
  it("sums a player's predictions and breaks ties by earlier join", () => {
    const s = game(); add(s, 'p1', 'a', 2); add(s, 'p2', 'a', 3); vote(s, 'p1', 1); vote(s, 'p2', 1);
    add(s, 'q1', 'b', 5); vote(s, 'q1', 1);
    const d = derive(s);
    expect(d.scores.a).toBe(200 + 300);
    expect(d.board[0].pid).toBe('a');
    s.preds.q1.tag = 5; vote(s, 'q1', 1); s.preds.p2.tag = 5; // a = 200+500 ... b = 500
    s.preds.p1.tag = 1; // a = 100+500 = 600
    const tie = game(); add(tie, 'x', 'a', 3); add(tie, 'y', 'b', 3); vote(tie, 'x', 1); vote(tie, 'y', 1);
    expect(derive(tie).board.map((b) => b.pid).slice(0, 2)).toEqual(['a', 'b']); // a joined first (ts 97 < 98)
  });
  it('removes hidden predictions from scores and counts, but keeps scrubbed ones', () => {
    const s = game(); add(s, 'p1', 'a', 3); add(s, 'p2', 'a', 3); vote(s, 'p1', 1); vote(s, 'p2', 1);
    s.hidden.p1 = true; s.scrubbed.p2 = true;
    const d = derive(s);
    expect(d.preds.map((p) => p.id)).toEqual(['p2']);
    expect(d.scores.a).toBe(300); // scrubbed keeps its points
  });
});

describe('reclassification', () => {
  it('moves the card to the crowd row and flags RECLASSIFIED when the rounded average differs from the tag', () => {
    const s = game(); add(s, 'p1', 'a', 5); rate(s, 'p1', 1, 2, 1); // avg 1.33 -> row 1
    const p = one(s, 'p1');
    expect(p.row).toBe(1); expect(p.reclass).toBe(true);
  });
  it('is not reclassified when the rounded average equals the tag', () => {
    const s = game(); add(s, 'p1', 'a', 3); rate(s, 'p1', 3, 3, 4); // 3.33 -> 3
    expect(one(s, 'p1').reclass).toBe(false);
  });
  it('rounds a crowd average of 5.x into row 5 unless CYBERBONKERS applies', () => {
    const s = game(); add(s, 'p1', 'a', 3); rate(s, 'p1', 5, 5, 6); // 5.33, only one 6
    expect(one(s, 'p1').row).toBe(5);
  });
});

describe('CYBERBONKERS', () => {
  it(`needs ${CYBER_MIN}+ ratings of 6 and an average of 5.5+`, () => {
    const s = game(); add(s, 'p1', 'a', 1);
    rate(s, 'p1', 6, 6, 6); expect(one(s, 'p1').row).toBe(6);
    rate(s, 'p1', 6, 6, 5); expect(one(s, 'p1').row).toBe(5); // only two 6s
  });
  it('accepts an average of exactly 5.5 with three 6s', () => {
    const s = game(); add(s, 'p1', 'a', 1); rate(s, 'p1', 6, 6, 6, 4); // avg 5.5
    expect(one(s, 'p1').row).toBe(6);
  });
  it('rejects three 6s with an average below 5.5', () => {
    const s = game(); add(s, 'p1', 'a', 1); rate(s, 'p1', 6, 6, 6, 3, 3); // avg 4.8
    expect(one(s, 'p1').row).toBe(5);
  });
  it('cannot be tagged by the author', () => {
    const s = game(); add(s, 'p1', 'a', 5);
    expect(one(s, 'p1').row).toBe(5);
  });
  it('scores with the crowd average as the multiplier', () => {
    const s = game(); add(s, 'p1', 'a', 1); vote(s, 'p1', 2); rate(s, 'p1', 6, 6, 6);
    expect(one(s, 'p1').points).toBe(2 * 100 * 6);
  });
});

describe('arcade events', () => {
  it(`LEVEL UP at ${LEVEL_UP_VOTES} votes`, () => {
    const s = game(); add(s, 'p1', 'a', 3); vote(s, 'p1', 1); expect(one(s, 'p1').lvup).toBe(false);
    vote(s, 'p1', 2); expect(one(s, 'p1').lvup).toBe(true);
  });

  it('the mothership takes the most-upvoted prediction, ties to the earliest, and needs a vote', () => {
    const s = game(); add(s, 'p1', 'a', 3, NOW - 100); add(s, 'p2', 'b', 3, NOW - 200);
    expect(leaderOf(derive(s).preds)).toBeNull();
    vote(s, 'p1', 2); vote(s, 'p2', 2);
    expect(leaderOf(derive(s).preds)?.id).toBe('p2'); // earlier
    vote(s, 'p1', 3);
    expect(leaderOf(derive(s).preds)?.id).toBe('p1');
  });

  it('the leader is held out of its row', () => {
    const s = game(); add(s, 'p1', 'a', 3); add(s, 'p2', 'b', 3); vote(s, 'p1', 2);
    const d = derive(s), rows = fleetRows(d.preds, s.scrubbed, leaderOf(d.preds)!.id);
    expect(rows[3].shown.map((p) => p.id)).toEqual(['p2']);
  });

  describe('shoot-down', () => {
    it(`needs ${SHOOT_DOWN_MIN}+ shoot-downs AND more than upvotes`, () => {
      const s = game(); add(s, 'p1', 'a', 3);
      down(s, 'p1', 2); expect(one(s, 'p1').shot).toBe(false);
      down(s, 'p1', 3); expect(one(s, 'p1').shot).toBe(true);
      vote(s, 'p1', 3); expect(one(s, 'p1').shot).toBe(false); // equal is not enough
      vote(s, 'p1', 2); expect(one(s, 'p1').shot).toBe(true); // 3 shoot-downs > 2 upvotes
    });
    it('targets only on-screen, unscrubbed, non-leader cards, most shot first', () => {
      const s = game(); add(s, 'p1', 'a', 3); add(s, 'p2', 'b', 3); add(s, 'p3', 'c', 3);
      down(s, 'p1', 3); down(s, 'p2', 5); down(s, 'p3', 4); s.scrubbed.p3 = true;
      const d = derive(s);
      expect(shotTargets(d.preds, s.scrubbed, null).map((p) => p.id)).toEqual(['p2', 'p1']);
    });
    it('does not target a card past the top 8 in its row (not on screen)', () => {
      const s = game();
      for (let i = 0; i < 9; i++) { add(s, 'k' + i, 'a', 3, NOW - i); vote(s, 'k' + i, 1); }
      add(s, 'low', 'a', 3, NOW - 1000); down(s, 'low', 3);
      expect(shotTargets(derive(s).preds, s.scrubbed, null)).toEqual([]);
    });
  });

  describe('timed raid', () => {
    const old = NOW - RAID.minAge - 1000;
    it('picks 0-vote cards older than the minimum age only', () => {
      const s = game(); add(s, 'young', 'a', 3, NOW - RAID.minAge + 1000); add(s, 'voted', 'b', 3, old); vote(s, 'voted', 1);
      expect(raidTarget(derive(s).preds, s.scrubbed, null, NOW)).toBeNull();
    });
    it('takes the lowest row first, then the oldest', () => {
      const s = game(); add(s, 'hi', 'a', 5, old - 9999); add(s, 'lo-new', 'b', 1, old); add(s, 'lo-old', 'c', 1, old - 5000);
      expect(raidTarget(derive(s).preds, s.scrubbed, null, NOW)?.id).toBe('lo-old');
    });
    it('skips scrubbed and hidden predictions and the mothership card', () => {
      const s = game(); add(s, 'a1', 'a', 1, old); add(s, 'a2', 'b', 1, old + 1); add(s, 'a3', 'c', 1, old + 2);
      s.scrubbed.a1 = true; s.hidden.a2 = true;
      expect(raidTarget(derive(s).preds, s.scrubbed, null, NOW)?.id).toBe('a3');
    });
    it('is exactly at the boundary: not older than minAge is safe', () => {
      const s = game(); add(s, 'edge', 'a', 1, NOW - RAID.minAge);
      expect(raidTarget(derive(s).preds, s.scrubbed, null, NOW)).toBeNull();
    });
  });
});

describe('flag pre-hide and host restore', () => {
  const isFlagged = (t: string) => t.includes('BAD');
  it('hides a flagged prediction until a host restores it', () => {
    const s = game(); add(s, 'p1', 'a', 3); s.preds.p1.text = 'this is BAD stuff';
    expect(derive(s, { isFlagged }).preds).toHaveLength(0);
    s.restored.p1 = true;
    expect(derive(s, { isFlagged }).preds).toHaveLength(1);
  });
});
