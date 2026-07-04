# CloudBase 搭建说明

## 目标

第一版只承接预测 PK 的核心数据，不做复杂运营后台。

CloudBase 负责保存：

- 用户昵称
- PK 房间
- 房间成员
- 单场比赛预测答案
- 积分和排行榜基础数据

浏览量、访问来源、停留时间等数据后续接入百度统计。

## 控制台需要创建的集合

在 CloudBase 控制台创建以下数据库集合：

| 集合名 | 用途 |
| --- | --- |
| `profiles` | 用户资料，文档 ID 使用 CloudBase 匿名用户 ID |
| `prediction_rooms` | 预测 PK 房间 |
| `room_members` | 房间参与关系，文档 ID 为 `房间ID_用户ID` |
| `predictions` | 用户预测答案，文档 ID 为 `房间ID_用户ID` |

## 建议权限

MVP 阶段为了先跑通功能：

- `profiles`：所有用户可读，登录用户可写自己的资料
- `prediction_rooms`：所有用户可读，登录用户可创建
- `room_members`：所有用户可读，登录用户可创建自己的加入记录
- `predictions`：登录用户可创建和更新自己的预测

正式上线前需要把写入规则收紧，避免用户伪造他人数据。

## 网站配置

把 CloudBase 环境 ID 写入：

```js
window.APP_CONFIG = {
  cloudbaseEnvId: "你的环境ID",
  cloudbaseSdkUrl: "https://imgcache.qq.com/qcloud/cloudbase-js-sdk/1.7.3/cloudbase.full.js",
  supabaseUrl: "",
  supabaseAnonKey: "",
};
```

配置文件位置：

- 开发版：`js/app-config.js`
- 发布版构建后：`dist/js/app-config.js`

也可以构建时使用环境变量：

```bash
CLOUDBASE_ENV_ID=你的环境ID npm run build:h5
```

## 验收标准

完成 CloudBase 配置后，打开 H5 页面并验证：

1. 输入昵称后可以创建预测 PK 房。
2. CloudBase 控制台 `profiles` 出现用户资料。
3. `prediction_rooms` 出现 PK 房间。
4. `room_members` 出现房间成员。
5. `predictions` 出现预测答案。
6. 换一台手机或浏览器打开分享链接，可以加入同一个 PK 房。

## 后续再做

- 用云函数结算半场 / 全场预测结果
- 自动计算积分和赢家
- 运营后台看板
- 百度统计埋点

## 半场比分自动刷新规则

半场战报不能只靠前端 H5 抓 FIFA 页面完成，需要 CloudBase 云函数或定时任务负责，避免用户关掉页面后停止刷新。

建议流程：

1. 每个比赛房保存官方开球时间和 FIFA match URL。
2. 到达 `开球时间 + 50 分钟` 后，云函数首次请求 FIFA 赛程 / Match Centre 数据。
3. 如果页面已经显示 `HT`、`Half-time` 或可识别的半场比分，则写入房间结算状态并计算上半场积分。
4. 如果尚未显示半场结束，则每 2 分钟再次请求一次。
5. 直到识别到半场比分，或超过开球后 75 分钟仍未识别时进入人工复核状态。
6. 前端半场战报页只读取 CloudBase 中的半场结算结果，不直接抓 FIFA。
