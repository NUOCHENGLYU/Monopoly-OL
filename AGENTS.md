# agents.md — “Property Tycoon” (Monopoly-like) 在线网页多人游戏

> 目标：做一个**可与朋友在线实时联机**的“大富翁/Monopoly-like”网页游戏，免费自建部署，体验不糟糕。  
> 重要：避免使用 “Monopoly/大富翁” 官方名称、棋盘格名、卡牌文本、图标素材等受版权/商标保护内容。我们做一个**规则相似的原创克隆**：项目名暂定 **Property Tycoon**。

---

## 0) Agent 工作方式（必须遵守）

1. **增量交付**：每个 Milestone 结束必须是“可运行 + 可验收”的状态，不允许一次性堆完。
2. **服务端权威**：多人联机必须以服务端为唯一可信来源（骰子随机、资金结算、回合推进都在服务端）。
3. **可复现**：所有验收都要给出明确命令与预期输出；失败要能定位（日志/测试报错）。
4. **不依赖付费服务**：默认本地运行与 Docker 部署；线上部署可选但不强制。
5. **优先简单可玩**：先做“能玩一局”的 MVP，再逐步补全规则与 UI。

---

## ASK_USER（仅当必须时才问；否则按默认执行）

如果用户没有给信息，按默认：
- 玩家数：2–6（默认 2–4）
- 房主：创建房间的人
- 回合限时：60 秒（默认启用）
- 断线重连：允许（默认 5 分钟内可重连）
- 平台：PC 浏览器优先，移动端基本可用即可

可选要问：
1) 是否需要 AI 机器人？（默认不做）
2) 是否需要账号系统？（默认不做，使用房间码+昵称）
3) 是否需要观战？（默认不做）
4) 是否需要完整传统规则（拍卖/交易/抵押/房屋/监狱/机会卡等）到什么程度？（默认逐步做）

---

## 技术栈（默认；除非用户要求改）

- Monorepo：pnpm workspaces（也可兼容 npm，但用 pnpm 更顺）
- 前端：React + TypeScript + Vite
- 后端：Node.js + TypeScript + Express
- 实时通信：Socket.IO（WebSocket）
- 测试：
  - 规则引擎：Vitest
  - 后端集成：Vitest + socket.io-client
  - E2E（后期）：Playwright（可选）
- 代码规范：ESLint + Prettier
- 构建/部署：Dockerfile + docker-compose（后期）

---

## 规则范围（按里程碑逐步实现）

**MVP（可玩一局）必须包含：**
- 房间系统（创建/加入/准备）
- 回合制掷骰前进
- 地产购买、收租、余额变化
- 经过起点获得奖励（类似 GO）
- 破产出局、最后存活者胜利
- 断线重连（至少同一浏览器刷新可恢复）

**后续逐步加入：**
- 监狱（进监狱/出监狱/罚金）
- 税收格
- 事件卡（Chance-like / Community-like 的“原创卡牌”）
- 房屋/酒店（升级租金）
- 交易（玩家间转让/换钱）
- 抵押（可选）
- 拍卖（可选）
- 动画与音效（可选）

---

## 数据与协议（必须遵循：服务端权威）

### 共享模型（建议放 packages/engine）
- `GameState`：全量状态（可序列化 JSON）
- `Player`：id, name, money, position, inJail, jailTurns, properties, isBankrupt...
- `BoardSpace`：type（START/PROPERTY/TAX/JAIL/GOTO_JAIL/CARD/FREE/UTILITY/RAIL...）, cost, rentTable, colorGroup...
- `Action`：客户端只能发送“意图”，服务端验证并应用
  - `ROLL_DICE`
  - `BUY_CURRENT_SPACE`
  - `END_TURN`
  - 后续扩展：`PAY_BAIL`, `USE_CARD`, `TRADE_OFFER`, `TRADE_ACCEPT`...

### Socket 事件（建议）
- client->server
  - `room:create {name}`
  - `room:join {roomCode, name}`
  - `room:ready {ready:boolean}`
  - `game:action {roomCode, action}`
  - `game:reconnect {roomCode, playerToken}`
- server->client
  - `room:state {room}`
  - `game:state {state}`
  - `game:error {code, message}`
  - `toast {message}`

### 身份凭证（无需账号）
- 玩家加入成功后，服务端返回 `playerToken`（随机字符串），前端存 localStorage
- 断线重连：携带 token，服务端恢复同一 playerId

---

# Milestones（每步都有验收标准）

> 每个 Milestone 完成后：  
> 1) `pnpm -r lint` 通过（若该里程碑已引入 lint）  
> 2) `pnpm -r test` 通过（若该里程碑已引入 test）  
> 3) 给出“如何手动验证”的步骤  
> 4) 更新 README：如何运行与当前功能列表

---

## Milestone A — 仓库脚手架 + 本地跑通（前后端空壳）

### 交付内容
1. Monorepo 初始化：
   - `apps/server`（Express + TS）
   - `apps/web`（Vite React + TS）
   - `packages/engine`（空壳，后续放规则引擎）
2. 基础脚本：
   - 根目录 `pnpm dev` 同时启动 server + web
   - `pnpm build` 构建
3. 健康检查：
   - server 提供 `GET /health` -> `{"ok": true}`
4. 基础页面：
   - web 显示 “Property Tycoon” 与后端 health 状态（fetch /health）

### 验收标准（成功/失败）
- 成功：
  1) `pnpm i`
  2) `pnpm dev`
  3) 浏览器打开 web 地址（Vite 输出的 localhost URL）
     - 页面显示标题 “Property Tycoon”
     - 页面显示 health ok（比如 “Server: OK”）
- 失败：
  - server 启动报错 /health 访问失败
  - web 无法 fetch /health（跨域/代理未配置）

---

## Milestone B — 规则引擎 v0：棋盘与移动（纯函数 + 单元测试）

### 交付内容
1. 在 `packages/engine` 实现：
   - 棋盘数据（至少 20–40 格，名称原创）
   - `createInitialState(players[])`
   - `rollDice(rngSeed?) -> {d1,d2,total}`（注意：服务端最终会用）
   - `applyAction(state, action, ctx) -> newState`（先支持 ROLL_DICE / END_TURN）
   - 回合推进、位置更新、经过起点奖励（例如 +200）
2. Vitest 单测覆盖：
   - 掷骰范围 1–6
   - 移动后位置正确（含绕圈）
   - 经过起点奖励生效
   - 非当前玩家行动被拒绝（返回 error 或 state 不变并带错误码）

### 验收标准
- 成功：
  - `pnpm --filter @pty/engine test` 通过（包名你来定，但要一致）
- 失败：
  - 任何测试失败或无测试

---

## Milestone C — 后端房间系统 + Socket.IO 连通（无游戏逻辑或仅最小）

### 交付内容
1. server 集成 Socket.IO：
   - 允许创建房间，生成 `roomCode`（短码如 6 位）
   - 加入房间，设置昵称，分配 `playerId` 与 `playerToken`
   - 房间状态广播：玩家列表、ready 状态
2. 内存存储（先不做数据库）：
   - rooms Map
   - 每个 room 包含 players 与（暂时空的）gameState
3. 最小的“开始游戏”：
   - 当房主点击开始（或所有人 ready）创建初始 `GameState`（调用 engine）

### 验收标准
- 成功（自动化）：
  - 写一个 `apps/server/test/room.test.ts` 使用 `socket.io-client`：
    1) A 创建房间 -> 拿到 roomCode
    2) B 加入同一 roomCode
    3) 双方都收到 `room:state` 且玩家数=2
- 成功（手动）：
  - 启动 `pnpm dev`，用两个浏览器窗口连接
  - 能创建/加入/看到对方昵称
- 失败：
  - 房间状态不同步
  - 断开一个 socket 导致房间崩溃

---

## Milestone D — 前端大厅 UI + 联机基础体验（Lobby）

### 交付内容
1. 前端实现页面：
   - 首页：输入昵称，创建房间 / 输入房间码加入
   - 大厅：显示玩家列表与 ready 状态
   - 房主可开始游戏（或所有人 ready 自动开始）
2. 连接管理：
   - Socket 自动重连
   - 保存 playerToken 到 localStorage
3. 错误提示：
   - room 不存在、满员、昵称为空等

### 验收标准
- 成功（手动）：
  1) 两个标签页打开
  2) A 创建房间，B 输入房间码加入
  3) 大厅中双方都能看到彼此，ready 状态变更实时同步
- 失败：
  - 刷新后无法恢复身份（至少同一浏览器刷新要能重连回房间）
  - 同步延迟或错乱（明显不一致）

---

## Milestone E — 可玩 MVP：掷骰前进 + 买地 + 收租 + 结束回合

### 交付内容（服务端权威）
1. 服务端接收 `game:action`：
   - 只允许当前玩家行动
   - `ROLL_DICE`：服务端生成骰子（客户端不得传骰子点数）
   - 应用 engine 得到新 state，广播给所有客户端
2. 引擎支持：
   - 格子类型至少：START / PROPERTY / EMPTY
   - 落在无主 PROPERTY：允许购买（BUY_CURRENT_SPACE）
   - 落在他人 PROPERTY：自动扣租金并转给所有者
   - 余额不足：判定破产（出局），资产归零（MVP 简化）
   - 最后存活者胜利（state 标记 winner）
3. 前端游戏页（最小可用）：
   - 显示棋盘（可先用简化网格或列表，不要求精美）
   - 显示玩家余额、当前位置
   - 当前玩家看到按钮：Roll / Buy / End Turn（按状态可用）
   - 显示日志（最近 10 条事件：掷骰、移动、交易金钱等）

### 验收标准
- 成功（手动）：
  1) 两人进入同一房间并开始游戏
  2) A 掷骰 -> A 位置变化，双方页面同步一致
  3) A 落在无主地产 -> 点击 Buy 后余额减少，地产归属显示正确
  4) B 落在 A 地产 -> 自动扣租金并给 A，双方余额同步一致
  5) 连续回合后若一方资金归零/负数 -> 破产出局，另一方胜利提示出现
- 成功（自动化，至少一个）：
  - 后端集成测试：模拟两客户端，强制固定 rngSeed，让一段脚本对局后断言余额与归属
- 失败：
  - 客户端可伪造骰子/越权操作
  - 双端状态不一致（出现“你看到你买了地，但对方没看到”）

---

## Milestone F — 监狱 + 税收 + 事件卡（原创）

### 交付内容
1. 新格子类型：
   - TAX：固定扣款给“银行”
   - JAIL：监狱格（访问不入狱）
   - GOTO_JAIL：直接入狱（位置到 JAIL，标记 inJail）
   - CARD：抽卡（Chance-like / Community-like）
2. 监狱规则（简化但一致）：
   - 入狱后最多 3 回合
   - 每回合可选择：付保释金（如 50）立刻出狱并继续；或掷骰尝试（可选实现）
   - 3 回合后自动付/出狱（按你实现的规则写清楚）
3. 事件卡（原创文本）：
   - 至少 10 张：收钱/付钱/移动到某格/修理费等
   - 记录抽到的卡与效果到日志

### 验收标准
- 成功（手动）：
  - 踩到 GOTO_JAIL 后：玩家状态显示 “In Jail”
  - 在监狱中：Roll 按钮禁用或变为 Jail Roll；可 Pay Bail 出狱
  - TAX 格扣款正确
  - CARD 格抽卡效果正确且双方一致
- 失败：
  - 出狱逻辑导致回合错乱
  - 抽卡在不同客户端结果不同（必须服务端决定）

---

## Milestone G — 房屋/升级系统（形成“策略点”）

### 交付内容
1. 地产分组（颜色组/区域组）
2. 垄断判定（拥有同组全部地产）
3. 购买房屋（简化版）：
   - 只有垄断后可建房
   - 每块地产最多 4 房 + 1 酒店（可选）
   - 租金随房屋数变化（rentTable）
4. UI：
   - 地产详情面板（owner、rent、house count、build cost）
   - 当前玩家可建房按钮

### 验收标准
- 成功：
  - 拥有同组全部地产后出现 Build 操作
  - 建房后租金提升，其他玩家踩到时扣款正确
- 失败：
  - 未垄断也能建房
  - 租金表不生效

---

## Milestone H — 交易（玩家之间）+ 回合计时 + 断线重连强化

### 交付内容
1. 交易系统（最小可用）：
   - A 发起报价：给钱/要钱/给地产/要地产（先支持“钱+地产”的组合即可）
   - B 接受/拒绝
   - 服务端验证：资产/金额足够、地产归属正确
2. 回合计时：
   - 每回合 60 秒倒计时（可配置）
   - 超时自动 END_TURN 或默认动作（写清规则）
3. 断线重连强化：
   - 刷新页面后 5 分钟内可用 token 回来
   - 回来后能恢复到同一 playerId 与状态
   - 断线玩家在房间列表标记 disconnected

### 验收标准
- 成功（手动）：
  - 发起交易 -> 对方收到弹窗 -> 接受后资产变化正确、双方一致
  - 故意不操作等超时 -> 自动切换回合
  - 刷新页面 -> 自动重连回同一局并恢复身份
- 失败：
  - 交易可被越权接受/篡改
  - 超时导致状态机卡死

---

## Milestone I — UI/体验打磨 + 可部署

### 交付内容
1. UI：
   - 棋盘更像棋盘（40 格环形或近似布局）
   - 动画：棋子移动、弹出提示（可简化）
   - 移动端适配基本可用
2. 可部署：
   - Dockerfile（server + web build 输出静态资源由 server 托管，或 nginx 分离）
   - docker-compose 一键启动
   - 环境变量：PORT、CORS、TURN_TIMER、SEED_MODE（测试用）
3. 文档：
   - README：本地开发、运行、部署、常见问题
   - “当前规则说明” 一页写清楚（避免玩家争论）

### 验收标准
- 成功：
  - `docker compose up --build` 后访问页面可玩
  - 两个浏览器（不同设备/不同网络可选）能联机
- 失败：
  - docker 启不起来
  - 生产构建与开发行为不一致（例如 socket 路径错误）

---

# 质量门槛（从 Milestone B 起逐步加）

- TypeScript 严格模式：尽量开启 `strict`
- 引擎必须有单测；关键规则（收租、入狱、抽卡）要覆盖
- 服务端对 action 做 schema 校验（zod 或自写校验均可）
- 日志里不要泄露 playerToken
- 房间人数上限、消息频率限制（最小防刷）

---

# Repo 结构建议

/
  apps/
    server/
    web/
  packages/
    engine/
    shared/        (可选：共享 types/schemas)
  agents.md
  README.md
  docker-compose.yml (后期)

---

# Done 定义（最终）

当满足以下条件就算完成：
1) 任意两台电脑打开网页，通过房间码进入同一局
2) 能完整玩到胜负（破产/胜利判定）
3) 断线刷新可回到同一局
4) 服务端权威，无法靠篡改前端作弊掷骰或改钱
5) 一键部署（Docker）可用

---
