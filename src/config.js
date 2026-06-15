// 集中配置

// 累积型勋章名单：这些勋章的 completion_time 只反映"最近一次升级"，会把多年历史
// 压缩到一个时间点，因此从经验趋势曲线中排除（它们的 XP 仍计入 Steam 实际等级，
// 但不画进曲线，所以曲线末端等级可能略低于实际等级）。
//   13 = 游戏收藏家 Game Collector（随拥有游戏数增长）—— 已核实
//    1 = 服役年限 Years of Service（每年递增）        —— 已核实
//
// ⚠️ 这里的 ID 仅对"无 appid 的特殊勋章"生效。游戏卡牌勋章的 badgeid 也常是
// 1（普通）/2（闪亮），它们靠 appid 区分游戏，绝不能因 badgeid 命中名单被误删——
// 真正的排除判断见 transform.js（要求 appid 缺失）。
// 如需增删，对照 https://steamdb.info/badges/ 调整即可。
export const EXCLUDED_BADGE_IDS = new Set([1, 13]);

// 缓存时长（秒）
export const CACHE_TTL = {
  profile: 12 * 60 * 60, // 处理结果：12 小时
};

// Steam Web API 基址
export const STEAM_API_BASE = "https://api.steampowered.com";
