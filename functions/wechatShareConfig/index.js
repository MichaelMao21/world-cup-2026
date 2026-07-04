const crypto = require("crypto");
const https = require("https");

const APP_ID = process.env.WECHAT_APP_ID || "wx394b4d5d5bd16947";
const APP_SECRET = process.env.WECHAT_APP_SECRET || "";

let accessTokenCache = null;
let ticketCache = null;

exports.main = async function main(event = {}) {
  if (event.action === "oauthProfile") {
    return getOAuthProfile(String(event.code || ""));
  }

  const url = String(event.url || "").split("#")[0];
  if (!APP_ID || !APP_SECRET) {
    return { enabled: false, reason: "WECHAT_APP_SECRET_NOT_CONFIGURED" };
  }
  if (!/^https:\/\/www\.pkgamecup\.cn\//.test(url)) {
    return { enabled: false, reason: "INVALID_URL" };
  }

  const ticket = await getJsApiTicket();
  const nonceStr = crypto.randomBytes(8).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = crypto.createHash("sha1").update(raw).digest("hex");

  return {
    enabled: true,
    appId: APP_ID,
    timestamp,
    nonceStr,
    signature,
  };
};

async function getOAuthProfile(code) {
  if (!APP_ID || !APP_SECRET) {
    return { enabled: false, reason: "WECHAT_APP_SECRET_NOT_CONFIGURED" };
  }
  if (!code) {
    return { enabled: false, reason: "MISSING_CODE" };
  }
  const token = await fetchJson(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${APP_ID}&secret=${APP_SECRET}&code=${encodeURIComponent(code)}&grant_type=authorization_code`);
  if (!token.access_token || !token.openid) throw new Error(token.errmsg || "Failed to fetch oauth access_token");
  const profile = await fetchJson(`https://api.weixin.qq.com/sns/userinfo?access_token=${token.access_token}&openid=${token.openid}&lang=zh_CN`);
  if (!profile.nickname) throw new Error(profile.errmsg || "Failed to fetch user profile");
  return {
    enabled: true,
    openid: profile.openid,
    unionid: profile.unionid || "",
    nickname: profile.nickname,
    avatar_url: profile.headimgurl || "",
  };
}

async function getJsApiTicket() {
  const now = Date.now();
  if (ticketCache && ticketCache.expiresAt > now + 60000) return ticketCache.value;
  const accessToken = await getAccessToken();
  const data = await fetchJson(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`);
  if (!data.ticket) throw new Error(data.errmsg || "Failed to fetch jsapi_ticket");
  ticketCache = {
    value: data.ticket,
    expiresAt: now + Math.max(300, Number(data.expires_in || 7200) - 120) * 1000,
  };
  return ticketCache.value;
}

async function getAccessToken() {
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt > now + 60000) return accessTokenCache.value;
  const data = await fetchJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`);
  if (!data.access_token) throw new Error(data.errmsg || "Failed to fetch access_token");
  accessTokenCache = {
    value: data.access_token,
    expiresAt: now + Math.max(300, Number(data.expires_in || 7200) - 120) * 1000,
  };
  return accessTokenCache.value;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}
