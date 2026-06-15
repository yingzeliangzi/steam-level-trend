// 把原始 badge 列表加工成可直接画图的时间序列（纯函数）

import { EXCLUDED_BADGE_IDS } from "./config.js";
import { levelForXp } from "./levelMath.js";

/**
 * @param {Array} badges    GetBadges 返回的 badges 数组（含 badgeid, completion_time, xp, appid, level）
 * @param {number} timeCreated 账号注册 Unix 时间戳（来自 GetPlayerSummaries，可选）
 * @returns {{
 *   points: Array<{t:number, cumulativeXp:number, level:number, badges:Array}>,
 *   countedBadges:number, excludedBadges:number, totalXp:number, finalLevel:number
 * }}
 */
export function buildTimeline(badges, timeCreated) {
  const usable = (badges || []).filter(
    (b) =>
      b &&
      // 仅排除"特殊累积型勋章"：它们没有 appid，且 badgeid 命中名单。
      // 关键：游戏卡牌勋章的 badgeid 也可能是 1（普通）/2（闪亮），靠 appid 区分游戏，
      // 绝不能因 badgeid 命中名单就误删——所以排除条件必须同时要求 appid 缺失。
      !(b.appid == null && EXCLUDED_BADGE_IDS.has(b.badgeid)) &&
      typeof b.completion_time === "number" &&
      b.completion_time > 0 &&
      typeof b.xp === "number"
  );

  // 按获得时间升序
  usable.sort((a, b) => a.completion_time - b.completion_time);

  const points = [];
  let cumulativeXp = 0;

  // 起点：注册时间，XP=0（仅当它不晚于第一个勋章时间，避免时间轴乱序）
  if (
    timeCreated &&
    timeCreated > 0 &&
    (usable.length === 0 || timeCreated <= usable[0].completion_time)
  ) {
    points.push({ t: timeCreated, cumulativeXp: 0, level: 0, badges: [] });
  }

  for (const b of usable) {
    cumulativeXp += b.xp;
    const entry = {
      badgeid: b.badgeid,
      appid: b.appid ?? null,
      xp: b.xp,
      level: b.level ?? null,
    };
    const last = points[points.length - 1];
    if (last && last.t === b.completion_time) {
      // 同一时间戳的多个勋章合并到一个数据点
      last.cumulativeXp = cumulativeXp;
      last.level = levelForXp(cumulativeXp);
      last.badges.push(entry);
    } else {
      points.push({
        t: b.completion_time,
        cumulativeXp,
        level: levelForXp(cumulativeXp),
        badges: [entry],
      });
    }
  }

  return {
    points,
    countedBadges: usable.length,
    excludedBadges: (badges || []).length - usable.length,
    totalXp: cumulativeXp,
    finalLevel: levelForXp(cumulativeXp),
  };
}
