// Steam 经验值 ↔ 等级换算（纯函数）
//
// 规则：从第 L 级升到 L+1 级所需经验 = (floor(L/10) + 1) * 100
//   0→10 每级 100，10→20 每级 200，20→30 每级 300 ……
// 校验：等级 10 = 1000 XP，20 = 3000，50 = 15000，100 = 55000（与 Steam 实际一致）。

/** 从第 level 级升到 level+1 级所需的经验 */
export function xpForNextLevel(level) {
  return (Math.floor(level / 10) + 1) * 100;
}

/** 达到某等级所需的累计经验 */
export function xpToReachLevel(level) {
  let xp = 0;
  for (let l = 0; l < level; l++) xp += xpForNextLevel(l);
  return xp;
}

/** 给定累计经验，返回当前 Steam 等级 */
export function levelForXp(xp) {
  if (!xp || xp <= 0) return 0;
  let level = 0;
  let acc = 0;
  while (acc + xpForNextLevel(level) <= xp) {
    acc += xpForNextLevel(level);
    level++;
  }
  return level;
}
