# Moodcast · 心情天气

选一片天空，留一句心情，把日子慢慢收藏。

React + TypeScript + Vite 前端，Rust / Axum 后端，SQLx / SQLite 持久化。Rust 服务同时提供 API 和构建后的前端页面。

![Moodcast 桌面预览](docs/preview.png)

预览图使用演示记录，不会写入实际数据库。[Logo 矢量文件](web/public/logo.svg) · [天气月历](docs/calendar.png) · [手机月历](docs/calendar-mobile.png)

[雷雨](docs/storm.png) · [台风](docs/typhoon.png) · [龙卷风](docs/tornado.png)

## 第一版功能

- 十二种全屏心情天气：晴朗、阴天、有雾、小雨、雷雨、落雪、大风、暴雨、冰雹、彩虹、台风、龙卷风。切换天气时整个天空渐变，文字、按钮和半透明面板同步切换明暗。
- 晴天有日光与缓慢漂移的云；阴天整页压暗；雨天有全屏雨幕；雷雨有深色云层、斜雨和间歇闪电；雾天有流动雾层；雪天有冷色天空与飘雪。
- 大风有横向风线与快速云层，暴雨更密更急，冰雹有落粒与回弹，彩虹有七色光弧。台风有旋转云系和强斜雨，龙卷风有漏斗云、旋转云环与卷起的尘粒。
- 每天一条记录，可留白、补记过去的日子、修改和删除，最多 500 个 Unicode 字符。
- 按月回看，点击日期恢复那天的天空和文字；不自动写入示例记录。
- 月历以大号天气图标、独立天气颜色和文字标记展示每日心情，日期置于角落；配色会适配当前天空的明暗。
- 自带背景音乐播放器：上传 MP3 后保存在曲库，支持切换曲目、播放/暂停、拖动进度、单曲循环、音量、静音和移除。刷新会记住曲目、音量和循环设置，但不会自动播放；切换天气不会打断音乐。
- JSON 备份导入、导出；导入先完整校验，再通过事务合并，同日期覆盖。
- 手机布局、动效暂停、系统减少动态效果支持，以及未保存内容离开提醒。暂停动效仍保留天气的明暗和静态雨雪。
- SQLite WAL、自动数据库迁移、错误反馈。

## 环境

- Rust 1.85 或更新版本。
- Node.js 18.16+（推荐 22 LTS）、npm。

项目包含依赖锁文件，使用 `--locked` / `npm ci` 保持版本一致。

## 开发

首次安装：

```sh
cd web
npm ci
cd ..
```

启动前后端：

```sh
bash scripts/dev.sh
```

打开 <http://127.0.0.1:5173>。Vite 把 `/api` 代理到 Rust 的 `127.0.0.1:3000`；退出开发脚本会关闭它启动的 Rust 进程。

也可以分别在两个终端运行 `cargo run --locked` 和 `cd web && npm run dev`。

## 单服务运行

```sh
cd web
npm ci
npm run build
cd ..
cargo run --release --locked
```

打开 <http://127.0.0.1:3000>。数据库默认保存在项目的 `data/moodcast.db`，重启服务仍保留记录。

可配置的环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MOODCAST_BIND` | `127.0.0.1:3000` | HTTP 监听地址 |
| `DATABASE_URL` | 项目内 `data/moodcast.db` 的 SQLite URL | 自定义文件请先创建父目录 |
| `WEB_DIST` | 项目内 `web/dist` | 前端静态文件路径 |
| `MUSIC_DIR` | 项目内 `data/music` | 上传的 MP3 文件目录 |

运行编译好的二进制时，建议显式设置 `WEB_DIST` 和 `DATABASE_URL`，默认路径基于编译时的项目位置。

## Docker

运行阶段使用 `zhangchaobab/niuzios:micro-amd64` 或 `micro-arm64`。Node 与 Rust 官方镜像分别编译前端和 musl 静态可执行文件，最终镜像只复制运行所需产物，以 UID/GID `10001:10001` 启动。

使用 Docker Hub 镜像：

```sh
docker run -d --name moodcast -p 8080:3000 -v moodcast-data:/app/data zhangchaobab/porn-moodcast:latest
```

打开 <http://127.0.0.1:8080>。`latest` 和日期标签用于多架构镜像，另提供 `amd64`、`arm64` 架构标签。

本地构建：

```sh
docker build -t moodcast .
docker run --name moodcast -p 127.0.0.1:3000:3000 -v moodcast-data:/app/data moodcast
```

使用支持多架构的 Buildx 构建器发布：

```sh
docker buildx build --platform linux/amd64,linux/arm64 -t zhangchaobab/porn-moodcast:latest --push .
```

整个 `/app/data` 目录需要持久化，包含数据库及 WAL 文件。运行中的备份请优先使用页面导出；拷贝数据库文件应在服务关闭后进行。

## 背景音乐

[播放器预览](docs/music.png) · [手机版](docs/music-mobile.png)（使用临时测试曲目）

天气选项下面点击「上传 MP3」，选择不超过 30 MB 的 MP3 文件。上传成功后点击播放，可使用曲目下拉框切换音乐；音量、循环开关和进度条都在播放器内。音乐由你手动开启，刷新页面不会突然播放。

音频文件保存在 `MUSIC_DIR`，曲目名称与文件信息保存在 SQLite。天气记录的 JSON 导出不包含音频和曲库；完整备份请在服务关闭后复制整个 `data/` 目录。若自定义了 `MUSIC_DIR`，还需一并备份该目录。

当前是单人版：所有访问这个服务的人共享同一份记录，没有账号和身份认证。默认仅本机访问；公网使用前需增加登录或在反向代理配置访问认证。跨设备查看需要让设备访问同一个服务。

## 验证

```sh
cargo test --workspace --locked
cargo fmt --all -- --check
cd web
npm run build
```

接口集成测试覆盖新增、更新、按月隔离、删除、十二种天气的导出再导入，以及无效输入和无效备份不产生部分写入。数据库迁移测试验证新增天气约束生效，原有文字和时间戳保持不变。

音乐接口测试覆盖上传、格式与大小校验、曲库列表、音频字节范围读取、删除文件，以及音乐上传与 JSON 备份各自的请求大小限制。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 服务状态 |
| GET | `/api/records?month=2026-11` | 查询整月记录 |
| PUT | `/api/records/2026-11-12` | 新增或更新，JSON 为 `{ "weather": "rain", "note": "今天有雨。" }` |
| DELETE | `/api/records/2026-11-12` | 删除当天记录 |
| GET | `/api/export` | 导出全部记录 |
| POST | `/api/import` | 导入版本 1 的备份 JSON，最多 5 MB / 10000 条 |
| GET | `/api/music` | 列出已上传的曲目 |
| POST | `/api/music?name=music.mp3` | 上传原始 MP3 字节，`Content-Type: audio/mpeg`，最多 30 MB |
| GET / HEAD | `/api/music/{id}/audio` | 流式播放音频，支持 HTTP Range 和拖动进度 |
| DELETE | `/api/music/{id}` | 从曲库和磁盘移除曲目 |

`weather` 可选 `sunny`、`cloudy`、`fog`、`rain`、`storm`、`snow`、`wind`、`downpour`、`hail`、`rainbow`、`typhoon`、`tornado`。日期使用浏览器当地的日历日期，创建和修改时间使用 UTC。

## 目录

```text
server/src/            Rust HTTP 服务和接口测试
server/migrations/     SQLite 迁移
web/src/               页面、天气场景和交互
scripts/dev.sh         本地开发启动脚本
data/                  本地数据（Git 忽略）
```
