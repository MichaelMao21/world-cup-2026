# H5 上线指南

## 架构

- EdgeOne Pages：托管 H5 静态文件。
- Supabase Auth：匿名用户身份。
- Supabase Postgres：预测房、成员、答案和排行榜。
- 本机演示模式：未配置 Supabase 时使用 `localStorage`。

## 1. 创建 Supabase 项目

1. 在 Supabase 新建项目。
2. 打开 **Authentication > Providers > Anonymous Sign-Ins** 并启用匿名登录。
3. 打开 **SQL Editor**，执行 [`supabase/schema.sql`](./supabase/schema.sql)。
4. 在 **Project Settings > API** 保留两项：
   - Project URL
   - Publishable key / anon key

不要把 `service_role` 密钥放到网页、Git 或 EdgeOne 前端环境变量中。

## 2. 本地验证云数据

将 `js/app-config.example.js` 中的格式填入 `js/app-config.js`：

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_OR_ANON_KEY",
};
```

运行：

```bash
python3 -m http.server 8769
```

打开 `http://127.0.0.1:8769/prototype.html`。

## 3. 部署到 EdgeOne Pages

1. 将项目推送到一个私有 GitHub 仓库。
2. 在 EdgeOne Pages 中导入该仓库。
3. 设置构建参数：
   - Build command: `npm run build:h5`
   - Output directory: `dist`
4. 添加构建环境变量：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. 首次部署先使用 EdgeOne 提供的默认域名验证。
6. 验证后绑定独立 `.com` 域名并开启 HTTPS。

未做 ICP 备案时，加速区域选择“全球可用区（不含中国大陆）”。

## 4. 发布前检查

```bash
npm run check:h5
npm run build:h5
```

用两个不同的浏览器或无痕窗口验证：

1. A 创建预测房并分享链接。
2. B 通过链接设置昵称、加入并提交预测。
3. A 刷新后能看到 2 名成员。
4. 预测答案只对本人可见，结算后才可公开。
