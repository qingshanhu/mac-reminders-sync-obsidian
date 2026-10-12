# mac待办同步obsidian

Mac 自带「提醒事项」与 Obsidian 固定待办页面的双向同步插件。默认每 **5 分钟**同步，无需每天创建日期笔记。

[下载最新版](https://github.com/qingshanhu/mac-reminders-sync-obsidian/releases/latest) · [使用说明](docs/使用说明.md) · [故障排查](docs/故障排查.md) · [开发与构建](docs/开发说明.md)

## 功能

- Mac 新增提醒事项 → Obsidian；Obsidian 新增待办 → Mac。
- 双向同步任务标题、完成状态、截止日期及所在列表。
- 简洁界面：快速添加、全部、今日、逾期、已完成；点击标题编辑。
- 默认 5 分钟，允许 1–1440 分钟；修改后计时自动更新。
- 可开启空闲自动调节：每连续 3 次无变化延长一个基础周期，最多 3 倍；发现变化后恢复基础周期。
- 稳定任务标识、逐字段合并、同步前备份及冲突记录。
- 不需要 Tasks、Dataview、Homebrew 或 reminders-cli。

## 运行要求

| 项目 | 要求 |
|---|---|
| 系统 | macOS 14 或更新版本 |
| Obsidian | 桌面版 1.5 或更新版本，允许第三方插件 |
| 芯片 | 发布包包含 Apple Silicon 和 Intel 架构 |
| 权限 | macOS 提醒事项完整访问权限 |
| 自动同步 | Obsidian 保持运行；关闭或休眠期间不执行 |

已在 macOS 26.6.2、Obsidian 1.14.4、Apple Silicon 真实环境验证新增、完成状态及 Mac 修改回传。Intel 架构已交叉编译并核验二进制，尚未在 Intel 实机测试。

## 安装：普通用户

1. 在 [Releases](https://github.com/qingshanhu/mac-reminders-sync-obsidian/releases/latest) 下载 `work-reminders-sync-v1.0.1-plugin.zip`，解压得到 `work-reminders-sync` 文件夹。
2. 完全退出 Obsidian，将整个文件夹复制到笔记库的 `.obsidian/plugins/` 中。Finder 用 `⌘⇧.` 显示隐藏文件。升级时保留原目录中的 `data.json`、`last-backup.md` 和 `conflicts.jsonl`，仅替换下载包内的程序文件。
3. 打开 Obsidian → 设置 → 第三方插件，允许第三方插件并启用 **Mac 待办同步 Obsidian**。
4. 创建 `工作/平时工作/待办.md`，写入下面代码，在阅读视图打开：

````markdown
```mac-reminders
```
````

5. 点击 **立即同步**，在 macOS 提示中允许提醒事项访问。

首次成功同步会导入 EventKit 可读取的全部提醒事项，包括已完成和无截止日期任务，并创建数据清单。新增任务可选择列表。目前没有排除列表设置。

> 原生桥接程序使用本地签名，未经过 Apple Developer ID 签名和公证。如果 macOS 阻止下载的程序运行，请采用下方源码构建方式；不要关闭系统安全保护。实际权限提示的名称可能为「Obsidian 待办同步」或 Obsidian。

## 安装：完整包与安装脚本

下载并解压 `mac-reminders-sync-obsidian-v1.0.1-universal.zip`。此方法需要 Node.js 18+，无需安装 npm 依赖。

先完全退出 Obsidian，在解压后的目录运行，将路径换成你的笔记库：

```bash
node scripts/install.mjs --vault "/绝对路径/你的笔记库"
```

安装器复制插件、保留已有笔记与同步状态、创建空白模板，并把插件加入启用列表。升级前会把程序文件备份至 `.obsidian/plugins-backup/`。第三方插件开关仍需在 Obsidian 设置中启用。

首次安装可以指定相对目录：

```bash
node scripts/install.mjs --vault "/绝对路径/你的笔记库" --folder "个人/任务"
```

已有任务时不要随意更改目录：`--folder` 不会自动迁移旧目录的任务。迁移前需先暂停同步、备份并移动旧清单。安装器仅支持标准 `.obsidian` 配置目录；自定义配置目录请手动安装。

## 文件结构

```text
你的笔记库/
├── 工作/平时工作/
│   ├── 待办.md                 # 日常入口
│   └── 待办资料/
│       └── 待办清单.md         # Markdown 任务数据，可折叠文件夹
└── .obsidian/plugins/work-reminders-sync/
    ├── main.js
    ├── manifest.json
    ├── styles.css
    ├── RemindersBridge.app/
    ├── data.json              # 首次运行生成：设置和任务映射
    ├── last-backup.md         # 上一次重写前清单
    └── conflicts.jsonl        # 出现冲突时生成
```

插件与数据清单需要保留。日常只打开「待办」，折叠「待办资料」即可。安装包仅含空白模板，没有真实提醒事项数据。

## 操作

| 操作 | 方法 |
|---|---|
| 新建 | 填任务，选日期和列表，点「添加」或按 Enter |
| 完成 | 勾选任务，下次同步更新 Mac；取消勾选可恢复未完成 |
| 修改 | 点击标题修改名称、日期和列表 |
| 立即同步 | 点「立即同步」 |
| 周期 | 展开「同步设置与操作」，填写分钟数后点「应用」 |
| 暂停 | 取消勾选「自动同步」；仍可手动同步 |
| 删除 | 在 Mac 删除，下次同步从 Obsidian 清单移除 |

直接删除 Markdown 行不会删除 Mac 任务，下次同步会补回。

## 同步规则与限制

- 按稳定 ID 关联任务，标题相同的不同任务会分别保留。
- 两端修改不同字段时合并；同时改同一字段时采用 Mac 版本，本地旧值写入 `conflicts.jsonl`。
- Mac 原有备注、附件、标签、闹钟、URL 和重复规则不会被主动改写；新建任务 URL 用于恢复本地标识。
- 子任务层级、附件、标签和重复计划不在界面展示。重复提醒完成后的下一次任务由 Apple 处理，本插件不保证整个重复任务系列的完整管理。
- 修改截止日期不会自动设置提醒闹钟。带时间日期可在编辑窗口填 `YYYY-MM-DD HH:mm`。
- iPhone 改动需要先由 Apple 同步到本 Mac；插件只读本机 EventKit，不直接访问 iCloud，也不承诺其他设备的即时到达时间。
- 「今日」按截止日期显示；「逾期」按早于今天的日期显示，不按当天具体时间判断。
- 只读列表无法写入。权限拒绝、读取失败或超时会显示错误，不应被视为空数据覆盖清单。

## 隐私

插件没有网络请求、统计或远程服务。任务通过本机 EventKit 与 Markdown 交换。你的 Apple 账户和笔记库自身启用的同步服务仍可能同步这些内容。

源码和发布包只含程序、空白模板及合成测试。运行态 `data.json`、笔记库、备份和冲突日志被 Git 忽略；提交前仍须核对文件清单。

## 源码构建

需要 Node.js 18+、Python 3、macOS 14+ 和 Xcode Command Line Tools。没有编译工具时运行 `xcode-select --install`，完成系统安装提示。

```bash
git clone https://github.com/qingshanhu/mac-reminders-sync-obsidian.git
cd mac-reminders-sync-obsidian
npm test
npm run build:universal
npm run package
node scripts/install.mjs --vault "/绝对路径/你的笔记库"
```

构建不下载第三方依赖，更多细节见 [开发说明](docs/开发说明.md)。

## 卸载

在第三方插件设置中停用插件，再退出 Obsidian。备份后移走 `.obsidian/plugins/work-reminders-sync`。是否保留待办笔记由你决定。卸载不会删除 Mac 提醒事项。

## 许可证与参考

[MIT](LICENSE)。

- [Apple：提醒事项访问权限](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders(completion:))
- [Obsidian：Markdown 后处理](https://docs.obsidian.md/plugins/editor/markdown-post-processing)
- [GitHub：仓库命名](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
