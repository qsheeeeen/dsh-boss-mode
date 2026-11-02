# dsh-orchestrator-preset

给 DeepSeek Harness 加一个 **编排模式**：主 Agent 不直接读写文件，所有实际工作交给子 Agent；它负责定目标、计划、派活、追问、打断、盘点、要决策。

模式选择器里只会多出这一张卡片（名称 `编排模式`，id `orchestrator`）；标准模式、极简模式等内置模式不变，也没有第二个多出来的卡片。

## 合成内容

| 插件 | 作用 |
|---|---|
| `@deepseek-ai/dsh-persona`（`complete: true`） | 系统提示词整段替换；Harness 的一等身份、工具说明、persona 后缀都不再追加 |
| `@deepseek-ai/dsh-time-context` | 当前时间（运行时上下文，不是提示词 section，所以不受 `complete` 影响） |
| `@local/dsh-orchestrator-preset`（本包的 `index.js`） | 屏蔽继承来的全局工具，只留本预设自己的工具 |
| `@deepseek-ai/dsh-tool-subagent`（`agentPreset: standard`） | `subagent`：启动一个子 Agent |
| `@deepseek-ai/dsh-tool-subagent-control` | `send_message`：追问/回消息；`interrupt_agent`：打断当前回合 |
| `@deepseek-ai/dsh-tool-subagent-control/list-agents` | `list_agents`：盘点自己派出去的子 Agent |
| `@deepseek-ai/dsh-tool-todo` | `todo_write`：主 Agent 自己的步骤清单（允许多个 in_progress） |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question`：结构化地向用户要决策 |
| `@deepseek-ai/dsh-tool-goal` | `get_goal` / `create_goal` / `update_goal`：一个持久化的长期目标 |
| `dsh-compaction-basic` + `dsh-command-compact` | 长会话压缩（`isolate: { compaction: true }`） |

所以主 Agent 的模型可见工具是九个：

| 工具 | 管理职能 |
|---|---|
| `subagent` | 创建 |
| `send_message` | 沟通 |
| `interrupt_agent` | 控制 |
| `list_agents` | 盘点 |
| `todo_write` | 步骤计划与跟踪 |
| `ask_user_question` | 决策升级 |
| `get_goal` / `create_goal` / `update_goal` | 跨轮目标 |

## 通信与协作语义

- 子 Agent 不是一次性的。`spawn` 出来的是本地可续聊子 Agent，会话持久化；完成一轮后变成 inactive，但可以再次唤醒，接着自己的上下文继续。
- `send_message({ agent_id, message })` 只返回“已投递”，不返回回答。正在跑的子在最近的 step 边界收到（Steer）；已经停下的子会开启新一轮。它的回答之后以消息/完成通知的形式回来，所以发送后结束回合即可，不要轮询。
- `interrupt_agent({ agent_id })` 只停子 Agent 当前这一轮，子 Agent 本身和它的收件箱都还在，之后可以继续发消息。
- `list_agents({ scope })` 默认列直接子 Agent，`scope: "descendants"` 列整棵树并带上 parent 和 depth。上下文压缩掉 id 之后用它找回，不要因为丢了 id 就重开一个重复的子 Agent。
- 子 Agent 也可以主动给主 Agent 发消息（标准模式自带 `send_message`），主 Agent 会被唤醒并可以用 `send_message` 回它。

## 管理语义（提示词怎么约束的）

- **先计划再派活**：超过一步的任务先用 `todo_write` 列出工作流，一个条目对应一条委派；派出去标 in_progress，报告回来并且核对过才标 completed。清单是“还缺什么”的账本，不是给用户看的报告。
- **目标只管跨轮**：目标是跨轮的 objective，清单只是走向它的步骤。`create_goal` 只在用户自己的请求要求一个长期目标时创建；只读 `get_goal` 拿到准确的 id + revision 才能 `update_goal`。只有用户的直接请求能创建/编辑/暂停/恢复目标，子 Agent 的建议不算授权。真正达成才 `complete`；同一个具体阻塞连续至少 3 轮才能 `blocked`，并写进 `blocked_reason`。会话恢复后 active 目标会被 disarm，用户说“继续”时先 `resume`。
- **能自己定的就自己定**：文件布局、命名、测试策略这类工程选择交给被派的子 Agent；只有真正属于用户的决定（范围、优先级、不可逆的取舍、猜不出来的权限/凭据）才用 `ask_user_question`，一次问清、给出收敛后的选项，同时继续不依赖答案的部分。
- **验收**：报告可能不完整或有错，要求同一个子 Agent 补，而不是拿猜测补。

## 为什么没有独立的“执行者”预设

Harness 的预设注册表把**每一个声明过的预设**都返回给模式选择器（`agentPresets/list` 返回全部声明），而 `tool-subagent` 的 `agentPreset` 只能指向一个**已声明**的预设。这个版本没有“隐藏预设 / 仅子 Agent 可用”的字段，所以单独声明一个 worker 预设，它必然出现在模式选择器里供人直接选。

因此这里不声明 worker，子 Agent 直接复用内置的 `standard`：它有完整的 shell、读写文件、搜索、web、skill 工具，而且用户本来就能选它，选择器不会被多加一张卡片。

代价与对策：标准模式的子 Agent 也带着 `subagent` 之类的工具（默认委派深度上限 1，真调用会拿到深度上限错误），并且带有 `ask_user_question`。所以编排模式的提示词要求：派活时明确告诉子 Agent“有歧义就自行选一个合理解释、在报告里说明并完成任务”。

## 为什么需要 index.js

Web 面把模型可见的工具都挪进了预设，但 Host 层仍有全局工具（当前是 `working_directory`）。预设只能追加作用域内的工具，不能删除全局工具；能删的只有两种办法：禁用 Host 行（会连带影响所有预设），或在 Agent 的作用域链上注册一条交集式限制。

`index.js` 走第二条：在预设自己的作用域里注册 `ctx.tools.restrict({ deny })`，只作用于挂载该预设的 Agent。限制**只能点名该作用域继承来的工具**，点名本预设自己注册的工具会被 `restrict()` 直接拒绝，所以 `PRESET_TOOL_NAMES` 必须与 `cordis.patch.yml` 里本预设注册的工具名完全一致：

- 少写一个 → `restrict()` 抛错，整个预设激活失败（响亮失败，不是静默）；
- 多写一个 → 那个工具会被自己的限制挡掉，主 Agent 反而看不见它。

当前是九个名字：`subagent`、`send_message`、`interrupt_agent`、`list_agents`、`todo_write`、`ask_user_question`、`get_goal`、`create_goal`、`update_goal`。`tools/change` 监听会补上运行期才出现的全局工具（比如后接入的 MCP 工具）。

## 改系统提示词

- 提示词在 `cordis.patch.yml` 的 `preset-orchestrator` → `persona.prefix`。`complete: true` 表示这段文字就是完整的系统提示词。
- 因为 `complete: true`，`tool-goal` 自带的 goal 政策 section 会被丢掉，所以“谁能建目标、blocked 阈值、resume”这些规则是抄进提示词的。如果你改了 `tool-goal` 的 `blockedAfterConsecutiveRounds`，记得同步提示词里的“3 轮”。
- `prefix` 是模板：只有已注册变量能写，`{{model}}` 可用；写一个未注册的 `{{...}}` 会让 prompt 组装报错，而不是静默忽略。
- 改完后重新安装一次（对本目录先 `remove_bundle` 再 `install_bundle`，同版本重复安装会被拒绝），然后**重启 DSH**：预设里的插件行不在插件列表里，改 `index.js` 时运行中的进程会继续用缓存的旧模块。已经存在的会话保持它启动时的那份合成，新会话/新子 Agent 才用新版本。

## 调整范围

- 想加共享任务板 / `wait_agent` / 任务认领与依赖：换成实验性的 `@deepseek-ai/dsh-experimental-agent-team` + `@deepseek-ai/dsh-experimental-tool-agent-team`（9 个工具，子 Agent 要用 `spawn_teammate` 创建）。
- 想允许两层委派：给 `tool-subagent` 配 `maxDepth: 2`。
- 想再收窄主 Agent 的工具：从 `cordis.patch.yml` 删掉对应行，并同步删掉 `index.js` 里 `PRESET_TOOL_NAMES` 的那个名字。

## 文件

```
package.json        包清单（bundle patch + 显示元数据导出）
cordis.patch.yml    编排模式预设声明（提示词在这里）
index.js            预设作用域的全局工具屏蔽
locale/{en,zh}.json 插件管理页的标题/描述
icon.svg            图标
```
