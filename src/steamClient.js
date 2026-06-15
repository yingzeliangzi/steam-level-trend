// Steam Web API 封装 + 用户输入解析

import { STEAM_API_BASE } from "./config.js";

const VANITY_RE = /^[a-zA-Z0-9_.-]{2,32}$/;
const STEAMID64_RE = /^7656\d{13}$/;
const STEAMID3_RE = /^\[?U:1:(\d{1,10})\]?$/i;
const STEAMID2_RE = /^STEAM_[0-5]:([01]):(\d{1,10})$/i;
const FRIENDCODE_RE = /^\d{1,10}$/;

// 个人账号 steamid64 基准偏移（0x0110000100000000），超出 JS 安全整数范围，需用 BigInt
const STEAMID64_BASE = 76561197960265728n;
const MAX_ACCOUNT_ID = 4294967295n; // uint32 上限

// accountid（好友代码 / SteamID3 的 W）→ steamid64 字符串
function accountIdToSteamId64(accountId) {
  return (BigInt(accountId) + STEAMID64_BASE).toString();
}

// accountid → {type:'steamid'} 或 null（越界时）
function steamIdFromAccountId(accountId) {
  const n = BigInt(accountId);
  if (n < 1n || n > MAX_ACCOUNT_ID) return null;
  return { type: "steamid", value: accountIdToSteamId64(n) };
}

export class SteamApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "SteamApiError";
    this.status = status;
  }
}

/**
 * 从用户输入解析出标识，支持多种识别码：
 *   - 自定义 URL 名（vanity）          nasakura
 *   - SteamID64（17 位）               76561197960287930
 *   - 完整资料链接                     https://steamcommunity.com/id/... 或 /profiles/...
 *   - 好友代码 / account id（纯数字）  22202
 *   - SteamID3                         [U:1:22202] 或 U:1:22202
 *   - SteamID2                         STEAM_0:0:11101
 * vanity 返回 {type:'vanity'} 需后续 ResolveVanityURL 解析；
 * 其余均可本地直接换算为 {type:'steamid'}。
 * @returns {{type:'steamid'|'vanity', value:string} | null}
 */
export function parseIdentifier(input) {
  const raw = (input || "").trim();
  if (!raw) return null;

  // 完整 URL： steamcommunity.com/id/<vanity> 或 /profiles/<steamid>
  const urlMatch = raw.match(/steamcommunity\.com\/(id|profiles)\/([^/?#]+)/i);
  if (urlMatch) {
    const kind = urlMatch[1].toLowerCase();
    const value = decodeURIComponent(urlMatch[2]);
    if (kind === "profiles" && STEAMID64_RE.test(value)) {
      return { type: "steamid", value };
    }
    if (kind === "id" && VANITY_RE.test(value)) {
      return { type: "vanity", value };
    }
    return null;
  }

  // SteamID64（17 位）
  if (STEAMID64_RE.test(raw)) return { type: "steamid", value: raw };

  // SteamID3： [U:1:W]
  let m = raw.match(STEAMID3_RE);
  if (m) return steamIdFromAccountId(m[1]);

  // SteamID2： STEAM_X:Y:Z  → accountid = Z*2 + Y
  m = raw.match(STEAMID2_RE);
  if (m) return steamIdFromAccountId(BigInt(m[2]) * 2n + BigInt(m[1]));

  // 好友代码 / account id（纯数字，且非 17 位 steamid64）
  if (FRIENDCODE_RE.test(raw)) return steamIdFromAccountId(raw);

  // 纯数字但不在以上任何范围 → 无效（避免误当作 vanity）
  if (/^\d+$/.test(raw)) return null;

  // 自定义 URL 名（vanity）
  if (VANITY_RE.test(raw)) return { type: "vanity", value: raw };

  return null;
}

async function steamGet(path, params, key, base = STEAM_API_BASE) {
  const url = new URL(`${base}${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new SteamApiError(`${path} 返回 HTTP ${res.status}`, res.status);
  }
  return res.json();
}

/** vanity 名 → steamid64，失败返回 null */
export async function resolveVanity(vanity, key, base = STEAM_API_BASE) {
  const data = await steamGet(
    "/ISteamUser/ResolveVanityURL/v1/",
    { vanityurl: vanity },
    key,
    base
  );
  const r = data && data.response;
  if (r && r.success === 1 && r.steamid) return r.steamid;
  return null;
}

/** 取勋章数据：返回 response 对象（含 badges[]、player_level、player_xp 等） */
export async function getBadges(steamid, key, base = STEAM_API_BASE) {
  const data = await steamGet(
    "/IPlayerService/GetBadges/v1/",
    { steamid },
    key,
    base
  );
  return (data && data.response) || {};
}

/** 取玩家概要：返回单个 player 对象或 null */
export async function getPlayerSummary(steamid, key, base = STEAM_API_BASE) {
  const data = await steamGet(
    "/ISteamUser/GetPlayerSummaries/v2/",
    { steamids: steamid },
    key,
    base
  );
  const players = data && data.response && data.response.players;
  return (players && players[0]) || null;
}
