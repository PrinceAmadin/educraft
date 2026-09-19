import crypto from "crypto";
import { UAParser } from "ua-parser-js";

/**
 * User-agent, referrer and visitor parsing for click tracking.
 * Ported from Traqly's lib/click-processor.ts (pure parts only; Traqly's
 * ip-api.com geo lookup is not ported, geography comes from Vercel's edge
 * headers instead, see geo-headers.ts).
 */

// The ONE place an IP becomes a stored identifier. Falls back to AUTH_SECRET so
// there is never a public default salt; the raw IP itself is never stored.
function salt(): string {
  return process.env.IP_HASH_SALT || process.env.AUTH_SECRET || "educraft-click-salt";
}

export function hashIp(ip: string): string {
  return crypto.createHmac("sha256", salt()).update(ip).digest("hex");
}

const BOT_UA_PATTERNS = [
  /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i, /baiduspider/i,
  /yandexbot/i, /sogou/i, /exabot/i, /facebot/i, /ia_archiver/i,
  /wget/i, /curl/i, /python-requests/i, /java\/[0-9]/i, /perl/i,
  /ruby/i, /php/i, /go-http-client/i, /axios/i, /node-fetch/i,
  /headlesschrome/i, /phantomjs/i, /selenium/i, /playwright/i,
  /puppeteer/i, /scrapy/i, /mechanize/i, /httpclient/i, /okhttp/i,
  /apachehttpclient/i, /httpunit/i, /libwww/i, /lwp-trivial/i,
  /twiceler/i, /mj12bot/i, /ahrefsbot/i, /semrushbot/i, /dotbot/i,
  /rogerbot/i, /linkcheck/i, /sitecheck/i, /pagespeedinsights/i,
  /gtmetrix/i, /pingdom/i, /statuscake/i, /uptime/i, /monitor/i,
  /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i, /whatsapp/i,
  /telegrambot/i, /discordbot/i, /slackbot/i, /preview/i,
];

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(ua));
}

export function isHeadless(ua: string): boolean {
  return /HeadlessChrome|PhantomJS|Electron/i.test(ua);
}

export function parseDevice(ua: string): "mobile" | "desktop" | "tablet" {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (
    /mobile|android|iphone|ipod|blackberry|opera mini|opera mobi|iemobile|webos|windows phone/i.test(ua)
  )
    return "mobile";
  return "desktop";
}

export function parseOs(ua: string): string {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/windows nt/i.test(ua)) return "windows";
  if (/mac os x/i.test(ua)) return "macos";
  if (/linux/i.test(ua)) return "linux";
  if (/cros/i.test(ua)) return "chromeos";
  return "other";
}

export function parseCountry(code: string | null): string | null {
  if (!code) return null;
  return code.toUpperCase();
}

/** In-app WebViews, matched BEFORE generic detection: they all embed Chrome/Safari. */
const IN_APP_BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/instagram/i, "Instagram"],
  [/fbav|fban|fb_iab|fbios|fbsv/i, "Facebook"],
  [/whatsapp/i, "WhatsApp"],
  [/twitter|twitterforiphone/i, "Twitter/X"],
  [/telegram/i, "Telegram"],
  [/tiktok|bytedance|musical_ly|trill/i, "TikTok"],
  [/snapchat/i, "Snapchat"],
  [/line\//i, "LINE"],
  [/kakaotalk/i, "KakaoTalk"],
  [/pinterest/i, "Pinterest"],
  [/linkedinapp|li_app/i, "LinkedIn"],
  [/gsa\//i, "Google App"],
  [/micromessenger/i, "WeChat"],
];

/** Standalone browsers that masquerade as Chrome/Safari. */
const DISGUISED_BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/duckduckgo/i, "DuckDuckGo"],
  [/brave/i, "Brave"],
  [/huaweibrowser/i, "Huawei Browser"],
  [/yabrowser/i, "Yandex Browser"],
  [/ucbrowser|ucweb/i, "UC Browser"],
  [/samsungbrowser/i, "Samsung Internet"],
];

const BROWSER_ALIASES: Record<string, string> = {
  "mobile safari": "Safari",
  safari: "Safari",
  "chrome webview": "Chrome",
  "chrome headless": "Chrome",
  "chrome mobile": "Chrome",
  chromium: "Chromium",
  "mobile chrome": "Chrome",
  edge: "Edge",
  "microsoft edge": "Edge",
  "firefox mobile": "Firefox",
  "mobile firefox": "Firefox",
  "opera mini": "Opera Mini",
  "opera mobi": "Opera",
  "opera touch": "Opera Touch",
  "samsung browser": "Samsung Internet",
  "samsung internet": "Samsung Internet",
  ie: "Internet Explorer",
  "internet explorer": "Internet Explorer",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  wechat: "WeChat",
  line: "LINE",
  kakaotalk: "KakaoTalk",
  yandex: "Yandex Browser",
  "yandex browser": "Yandex Browser",
  "huawei browser": "Huawei Browser",
  "uc browser": "UC Browser",
};

export function parseBrowser(ua: string): string {
  if (!ua || !ua.trim()) return "Unknown";

  for (const [pattern, name] of IN_APP_BROWSERS) if (pattern.test(ua)) return name;
  for (const [pattern, name] of DISGUISED_BROWSERS) if (pattern.test(ua)) return name;

  try {
    const name = new UAParser(ua).getBrowser().name;
    if (name) return BROWSER_ALIASES[name.toLowerCase()] ?? name;
  } catch {
    /* fall through to the regex ladder */
  }

  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return "Chrome";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/safari\//i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/opera|opr\//i.test(ua)) return "Opera";
  if (/trident|msie/i.test(ua)) return "Internet Explorer";
  return "Unknown";
}

/** Where the visitor came from, from the Referer header. */
export function classifyReferrer(referrer: string | null | undefined): string {
  if (!referrer) return "direct";
  const r = referrer.toLowerCase();
  if (r.includes("instagram.com")) return "instagram";
  if (r.includes("facebook.com") || r.includes("fb.com")) return "facebook";
  if (r.includes("wa.me") || r.includes("whatsapp.com")) return "whatsapp";
  if (r.includes("twitter.com") || r.includes("t.co") || r.includes("x.com")) return "twitter";
  if (r.includes("tiktok.com")) return "tiktok";
  if (r.includes("linkedin.com")) return "linkedin";
  if (r.includes("t.me") || r.includes("telegram.org")) return "telegram";
  if (r.includes("youtube.com")) return "youtube";
  return "other";
}
