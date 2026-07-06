import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const output = resolve("dist");
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "data"), { recursive: true });
await mkdir(resolve(output, "js"), { recursive: true });
await mkdir(resolve(output, "assets"), { recursive: true });

const buildVersion = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
const html = (await readFile(resolve("prototype.html"), "utf8"))
  .replace(/\.\/data\/prototype-data\.js\?v=[^"]+/g, `./data/prototype-data.js?v=${buildVersion}`);
await writeFile(resolve(output, "index.html"), html, "utf8");
await cp(resolve("data/prototype-data.js"), resolve(output, "data/prototype-data.js"));
await cp(resolve("data/player-stats.json"), resolve(output, "data/player-stats.json")).catch(() => {});
await cp(resolve("js/prediction-service.js"), resolve(output, "js/prediction-service.js"));
await cp(resolve("assets/share-card.png"), resolve(output, "assets/share-card.png"));
await cp(resolve("assets/share-thumb.png"), resolve(output, "assets/share-thumb.png"));
await cp(resolve("assets/qr"), resolve(output, "assets/qr"), { recursive: true });
await cp(resolve("assets/match-posters"), resolve(output, "assets/match-posters"), { recursive: true }).catch(() => {});
await cp(resolve("assets/poster-templates"), resolve(output, "assets/poster-templates"), { recursive: true });

const rootFiles = await readdir(".");
for (const file of rootFiles.filter((name) => /^MP_verify_.+\.txt$/.test(name))) {
  await cp(resolve(file), resolve(output, file));
}

const appConfigSource = await readFile(resolve("js/app-config.js"), "utf8");
const appConfigContext = { window: {} };
vm.runInNewContext(appConfigSource, appConfigContext);
const sourceConfig = appConfigContext.window.APP_CONFIG || {};
const cloudbaseEnvId = process.env.CLOUDBASE_ENV_ID || sourceConfig.cloudbaseEnvId || "";
const cloudbaseSdkUrl = process.env.CLOUDBASE_SDK_URL || sourceConfig.cloudbaseSdkUrl || "";
const supabaseUrl = process.env.SUPABASE_URL || sourceConfig.supabaseUrl || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || sourceConfig.supabaseAnonKey || "";
const config = `window.APP_CONFIG = ${JSON.stringify({
  ...sourceConfig,
  cloudbaseEnvId,
  cloudbaseSdkUrl,
  supabaseUrl,
  supabaseAnonKey,
}, null, 2)};\n`;
await writeFile(resolve(output, "js/app-config.js"), config, "utf8");

console.log(`H5 built at ${output}${cloudbaseEnvId ? " with CloudBase configuration" : supabaseUrl ? " with Supabase configuration" : " in demo mode"}`);
