// 前端逻辑：解析输入 → 调用 /api/profile → 渲染概要卡与双轴趋势图
// 支持中英文：按浏览器语言自适应，可手动切换（记忆在 localStorage）

/* ---------------- i18n 字典 ---------------- */
const I18N = {
  zh: {
    htmlLang: "zh-CN",
    switchTo: "EN", // 切换按钮上显示的目标语言
    title: "Steam 等级趋势图",
    subtitle: "看看你的经验值与等级，是如何随时间一路涨上来的。",
    placeholder:
      "自定义 URL 名 / SteamID64 / 好友代码 / SteamID3 / 资料链接（如 nasakura）",
    inputAria: "Steam 用户标识",
    search: "查询",
    statLevel: "当前等级",
    statJoined: "注册于",
    statBadges: "纳入统计勋章",
    note: "趋势已排除「游戏收藏家」「服役年限」等会随时间累积的勋章，因此曲线末端等级可能略低于上方显示的实际等级。",
    footer: "数据来源：Steam Web API · 需对方资料公开",
    ghLabel: "在 GitHub 上查看源码",
    loading: "正在获取数据…",
    enterId: "请输入用户标识",
    seriesXp: "累计 XP",
    seriesLevel: "等级",
    badgesFmt: (counted, excluded) => `${counted}（已排除 ${excluded}）`,
    earnedFmt: (n, xp) => `本次获得 ${n} 枚勋章（+${xp} XP）`,
    docTitleFmt: (name) => `${name} 的等级趋势 · Steam`,
    errors: {
      no_api_key: "服务端未配置 STEAM_API_KEY",
      bad_input: "无法识别的输入，请填写 steamid64、自定义 URL 名或完整资料链接",
      vanity_not_found: "找不到该自定义 URL 对应的用户",
      user_not_found: "找不到该用户",
      profile_private: "该用户资料未公开",
      no_badges:
        "该用户没有公开的勋章数据（可能勋章/游戏详情设为私密，或确实没有勋章）",
      insufficient_data: "可用勋章数据不足，无法绘制趋势（新账号或勋章过少）",
      steam_error: "Steam 接口错误，请稍后重试",
      server_error: "服务端处理失败，请稍后重试",
      network_error: "网络错误，请稍后重试",
      unknown: "请求失败，请稍后重试",
    },
  },
  en: {
    htmlLang: "en",
    switchTo: "中文",
    title: "Steam Level Trend",
    subtitle: "See how your XP and level have climbed over time.",
    placeholder:
      "Custom URL / SteamID64 / Friend code / SteamID3 / Profile link (e.g. nasakura)",
    inputAria: "Steam identifier",
    search: "Look up",
    statLevel: "Current level",
    statJoined: "Joined",
    statBadges: "Badges counted",
    note: "The trend excludes badges that accrue over time (Game Collector, Years of Service), so the level at the end of the curve may be slightly lower than the actual level shown above.",
    footer: "Data from the Steam Web API · the profile must be public",
    ghLabel: "View source on GitHub",
    loading: "Loading…",
    enterId: "Please enter an identifier",
    seriesXp: "Cumulative XP",
    seriesLevel: "Level",
    badgesFmt: (counted, excluded) => `${counted} (${excluded} excluded)`,
    earnedFmt: (n, xp) => `Earned ${n} badge${n === 1 ? "" : "s"} (+${xp} XP)`,
    docTitleFmt: (name) => `${name}'s Level Trend · Steam`,
    errors: {
      no_api_key: "The server has no STEAM_API_KEY configured",
      bad_input:
        "Unrecognized input — enter a steamid64, custom URL name, or full profile link",
      vanity_not_found: "No user found for that custom URL",
      user_not_found: "User not found",
      profile_private: "This user's profile is private",
      no_badges:
        "No public badge data for this user (badges/game details may be private, or there simply are none)",
      insufficient_data:
        "Not enough badge data to draw a trend (new account or too few badges)",
      steam_error: "Steam API error, please try again later",
      server_error: "The server failed to process the request, please try again",
      network_error: "Network error, please try again",
      unknown: "Request failed, please try again",
    },
  },
};

function detectLang() {
  const stored = localStorage.getItem("lang");
  if (stored === "zh" || stored === "en") return stored;
  const nav = (navigator.language || "").toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

let lang = detectLang();
const dict = () => I18N[lang];
const t = (key) => dict()[key];

/* ---------------- DOM ---------------- */
const form = document.getElementById("search-form");
const input = document.getElementById("user-input");
const btn = document.getElementById("search-btn");
const statusEl = document.getElementById("status");
const profileCard = document.getElementById("profile-card");
const chartWrap = document.getElementById("chart-wrap");
const chartEl = document.getElementById("chart");
const langToggle = document.getElementById("lang-toggle");

let chart = null;
let lastData = null; // 最近一次成功结果，用于语言切换时重渲染

/* ---------------- i18n 应用 ---------------- */
function applyI18n() {
  const d = dict();
  document.documentElement.lang = d.htmlLang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = d[el.dataset.i18n];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = d[el.dataset.i18nPlaceholder];
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", d[el.dataset.i18nAria]);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", d[el.dataset.i18nTitle]);
  });

  langToggle.textContent = d.switchTo;

  // 已有结果则重渲染（标题、勋章数、图表文案随语言变化）
  if (lastData) {
    document.title = d.docTitleFmt(lastData.profile.personaname || "");
    renderProfile(lastData);
    renderChart(lastData.timeline);
  } else {
    document.title = d.title;
  }
}

/* ---------------- 工具 ---------------- */
function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

function setLoading(loading) {
  btn.disabled = loading;
  btn.textContent = loading ? t("loading") : t("search");
}

function formatDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localizeError(data) {
  const errs = dict().errors;
  if (data && data.code && errs[data.code]) return errs[data.code];
  if (data && data.error) return data.error; // 回退到服务端原文
  return errs.unknown;
}

/* ---------------- 查询 ---------------- */
async function query(userValue) {
  const value = (userValue || "").trim();
  if (!value) {
    setStatus(t("enterId"), true);
    return;
  }

  setLoading(true);
  setStatus(t("loading"));
  profileCard.classList.add("hidden");
  chartWrap.classList.add("hidden");

  try {
    const res = await fetch(`/api/profile?user=${encodeURIComponent(value)}`);
    const data = await res.json();

    if (!res.ok) {
      setStatus(localizeError(data), true);
      return;
    }

    setStatus("");
    lastData = data;
    renderProfile(data);
    renderChart(data.timeline);
    document.title = dict().docTitleFmt(data.profile.personaname || "");

    // 更新地址栏，方便分享
    const url = new URL(window.location.href);
    url.searchParams.set("user", value);
    window.history.replaceState(null, "", url);
  } catch (err) {
    setStatus(dict().errors.network_error, true);
  } finally {
    setLoading(false);
  }
}

/* ---------------- 渲染：概要卡 ---------------- */
function renderProfile(data) {
  const { profile, actual, timeline } = data;
  document.getElementById("avatar").src = profile.avatar || "";
  const persona = document.getElementById("persona");
  persona.textContent = profile.personaname || "—";
  persona.href = profile.profileurl || "#";

  document.getElementById("stat-level").textContent =
    actual.level != null ? actual.level : "—";
  document.getElementById("stat-created").textContent = profile.timecreated
    ? formatDate(profile.timecreated * 1000)
    : "—";
  document.getElementById("stat-badges").textContent = dict().badgesFmt(
    timeline.countedBadges,
    timeline.excludedBadges
  );

  profileCard.classList.remove("hidden");
}

/* ---------------- 渲染：图表 ---------------- */
function renderChart(timeline) {
  const points = timeline.points;

  const xpData = points.map((p) => ({
    value: [p.t * 1000, p.cumulativeXp],
    badges: p.badges,
  }));
  const levelData = points.map((p) => ({ value: [p.t * 1000, p.level] }));

  // 把曲线延伸到"现在"（末端补一个平点）
  const lastTs = points[points.length - 1].t * 1000;
  const now = Date.now();
  if (now > lastTs) {
    const lastXp = points[points.length - 1].cumulativeXp;
    const lastLevel = points[points.length - 1].level;
    xpData.push({ value: [now, lastXp], badges: [] });
    levelData.push({ value: [now, lastLevel] });
  }

  chartWrap.classList.remove("hidden");
  if (!chart) chart = echarts.init(chartEl); // 浅色主题（与 Claude 风格一致）

  const nameXp = t("seriesXp");
  const nameLevel = t("seriesLevel");

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", lineStyle: { color: "#c5613f" } },
        backgroundColor: "#fbfaf7",
        borderColor: "#e3e0d6",
        borderWidth: 1,
        textStyle: { color: "#1f1e1d" },
        formatter(params) {
          if (!params.length) return "";
          const ts = params[0].value[0];
          let xp = null;
          let level = null;
          let badges = [];
          for (const p of params) {
            if (p.seriesName === nameXp) {
              xp = p.value[1];
              badges = (p.data && p.data.badges) || [];
            } else if (p.seriesName === nameLevel) {
              level = p.value[1];
            }
          }
          let html = `<b>${formatDate(ts)}</b><br/>`;
          html += `${nameXp}: ${xp != null ? xp.toLocaleString() : "—"}<br/>`;
          html += `${nameLevel}: ${level != null ? level : "—"}`;
          if (badges.length) {
            const gained = badges.reduce((s, b) => s + (b.xp || 0), 0);
            html += `<br/>${dict().earnedFmt(badges.length, gained)}`;
          }
          return html;
        },
      },
      legend: {
        data: [nameXp, nameLevel],
        textStyle: { color: "#1f1e1d" },
        top: 0,
      },
      grid: { left: 60, right: 60, top: 40, bottom: 70 },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: "#d8d4c8" } },
        axisLabel: { color: "#73726c" },
      },
      yAxis: [
        {
          type: "value",
          name: nameXp,
          nameTextStyle: { color: "#a8492b" },
          axisLabel: { color: "#73726c" },
          splitLine: { lineStyle: { color: "rgba(31,30,29,0.06)" } },
        },
        {
          type: "value",
          name: nameLevel,
          nameTextStyle: { color: "#3d3a35" },
          axisLabel: { color: "#73726c" },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: "inside" },
        {
          type: "slider",
          bottom: 16,
          height: 20,
          borderColor: "#e3e0d6",
          backgroundColor: "rgba(0,0,0,0)",
          fillerColor: "rgba(217,116,82,0.18)",
          handleStyle: { color: "#c5613f" },
          moveHandleStyle: { color: "#c5613f" },
          dataBackground: {
            lineStyle: { color: "#cfcabb" },
            areaStyle: { color: "rgba(31,30,29,0.06)" },
          },
          selectedDataBackground: {
            lineStyle: { color: "#c5613f" },
            areaStyle: { color: "rgba(217,116,82,0.15)" },
          },
          textStyle: { color: "#73726c" },
        },
      ],
      series: [
        {
          name: nameXp,
          type: "line",
          yAxisIndex: 0,
          showSymbol: false,
          smooth: true,
          lineStyle: { color: "#c5613f", width: 2.5 },
          itemStyle: { color: "#c5613f" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(217,116,82,0.42)" },
                { offset: 1, color: "rgba(217,116,82,0.03)" },
              ],
            },
          },
          data: xpData,
        },
        {
          name: nameLevel,
          type: "line",
          yAxisIndex: 1,
          step: "end",
          showSymbol: false,
          lineStyle: { color: "#3d3a35", width: 2 },
          itemStyle: { color: "#3d3a35" },
          data: levelData,
        },
      ],
    },
    true // notMerge：语言切换时彻底重建，避免图例残留
  );
}

/* ---------------- 事件 ---------------- */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  query(input.value);
});

langToggle.addEventListener("click", () => {
  lang = lang === "zh" ? "en" : "zh";
  localStorage.setItem("lang", lang);
  applyI18n();
});

window.addEventListener("resize", () => {
  if (chart) chart.resize();
});

/* ---------------- 初始化 ---------------- */
applyI18n();

const initialUser = new URL(window.location.href).searchParams.get("user");
if (initialUser) {
  input.value = initialUser;
  query(initialUser);
}
