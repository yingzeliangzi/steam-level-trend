// Cloudflare Worker 入口：
//   - /api/profile?user=<标识>  代理 Steam API，注入 key，返回加工好的时间序列
//   - 其余路径交给静态资源（public/）

import { CACHE_TTL } from "./config.js";
import {
  parseIdentifier,
  resolveVanity,
  getBadges,
  getPlayerSummary,
  SteamApiError,
} from "./steamClient.js";
import { buildTimeline } from "./transform.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/profile") {
      return handleProfile(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}

async function handleProfile(request, env, ctx) {
  const key = env.STEAM_API_KEY;
  if (!key) {
    return json({ error: "服务端未配置 STEAM_API_KEY", code: "no_api_key" }, 500);
  }

  const url = new URL(request.url);
  const id = parseIdentifier(url.searchParams.get("user"));
  if (!id) {
    return json(
      {
        error: "无法识别的输入，请填写 steamid64、自定义 URL 名或完整资料链接",
        code: "bad_input",
      },
      400
    );
  }

  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache.local/profile/${id.type}/${encodeURIComponent(id.value)}`
  );

  // 允许前端用 Cache-Control: no-cache 强制刷新
  const bypass = request.headers.get("cache-control") === "no-cache";
  if (!bypass) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  try {
    // 1. 解析 steamid
    let steamid = id.value;
    if (id.type === "vanity") {
      const resolved = await resolveVanity(id.value, key);
      if (!resolved) {
        return json(
          { error: "找不到该自定义 URL 对应的用户", code: "vanity_not_found" },
          404
        );
      }
      steamid = resolved;
    }

    // 2. 并发取勋章 + 概要
    const [badgeResp, summary] = await Promise.all([
      getBadges(steamid, key),
      getPlayerSummary(steamid, key),
    ]);

    if (!summary) {
      return json({ error: "找不到该用户", code: "user_not_found" }, 404);
    }
    // communityvisibilitystate: 3 = 公开
    if (summary.communityvisibilitystate !== 3) {
      return json({ error: "该用户资料未公开", code: "profile_private" }, 403);
    }

    const badges = (badgeResp && badgeResp.badges) || [];
    if (badges.length === 0) {
      return json(
        {
          error:
            "该用户没有公开的勋章数据（可能勋章/游戏详情设为私密，或确实没有勋章）",
          code: "no_badges",
        },
        404
      );
    }

    // 3. 加工
    const timeline = buildTimeline(badges, summary.timecreated);
    if (timeline.points.length < 2) {
      return json(
        {
          error: "可用勋章数据不足，无法绘制趋势（新账号或勋章过少）",
          code: "insufficient_data",
        },
        422
      );
    }

    const payload = {
      steamid,
      profile: {
        personaname: summary.personaname,
        avatar: summary.avatarfull,
        profileurl: summary.profileurl,
        timecreated: summary.timecreated ?? null,
      },
      // Steam 实际报告的等级/经验（含被排除的累积型勋章）
      actual: {
        level: badgeResp.player_level ?? null,
        xp: badgeResp.player_xp ?? null,
      },
      timeline,
    };

    const response = json(payload, 200, {
      "Cache-Control": `public, max-age=${CACHE_TTL.profile}`,
    });
    // 异步写缓存，不阻塞响应
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    if (err instanceof SteamApiError) {
      return json(
        { error: `Steam 接口错误：${err.message}`, code: "steam_error" },
        502
      );
    }
    return json({ error: "服务端处理失败，请稍后重试", code: "server_error" }, 500);
  }
}
