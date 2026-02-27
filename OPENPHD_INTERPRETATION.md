# Interpretation: From ScholarReader to OpenPhD

## 1. 这件事本质上是什么

你描述的不是“更强的阅读器”，而是一个 **Research Cognition OS**：

- 论文是输入，不是终点
- 注释是资产，不是边注
- 理解是演化过程，不是一次性总结
- AI 是“可审计的协作者”，不是最终裁判

一句话定义：
**OpenPhD = 以论文为锚点、以 lineage 为主线、以多人协作为增益的学术认知系统。**

## 2. 核心对象模型（你这个 idea 的数据结构）

### Primitive Objects
- `Paper`: 文献实体
- `Span`: 论文中的具体证据片段（字符范围 + selector）
- `Variable`: 变量实体（支持同名异义）
- `Function`: 函数实体（参数、返回、依赖）
- `TensorType`: 类型实体（shape + 维度语义）
- `Note`: 注释实体（human/ai 分层）
- `Insight`: 高层结论（由多个 Note 聚合）
- `Narration`: 语音/讲解转录后形成的结构化观点

### Edges (Non-linear links)
- `supports`, `contradicts`, `extends`, `reframes`, `question_about`
- `derived_from`（lineage 关系）
- `grounded_in`（结论 -> 证据 span）

这套模型能同时容纳：
- 你今天的理解
- 你十年前/未来版本的理解
- 你和他人的不同解读
- AI 产生但尚未确认的候选结论

## 3. 你强调的“Lineage”怎么落地

### 3.1 版本化规则
- 任何“改写观点”都是新节点，不覆盖旧节点
- 节点包含：作者、来源（human/ai）、时间、证据、父节点
- 支持 branch（分叉理解）与 merge（综合结论）

### 3.2 展示形态
- 时间轴：按演进顺序看思维轨迹
- 分支树：对比不同解释路径
- 叙事模式：自动串成可教学故事线（给 newcomer）

### 3.3 价值
- 从“我记了什么”升级到“我如何形成这个判断”
- 让 onboarding 从“啃原文”变成“先吸收高质量 lineage，再回原文验证”

## 4. AI 在系统中的角色（不是全知解释器）

### 4.1 AI should do
- 结构化：提取变量/函数/tensor 类型
- 连接：把散落注释聚成 insight graph
- 导航：给出阅读路径与关键转折点
- 反思：指出矛盾、缺证据、待验证假设

### 4.2 AI should NOT do
- 不可伪装成人类结论
- 不可无证据地下断言
- 不可覆盖历史观点

### 4.3 可信度机制（必要）
- 所有 AI note 强制显示标签和证据
- 无证据自动标记为 hypothesis
- 人类可一键“采纳/驳回/待定”

## 5. “怎么工作一下”：分三阶段做成

## Phase A (MVP, 4-6 weeks): 先把“活注释”跑通

目标：你在阅读中马上能感觉到价值。

1. 侧栏导读 + 证据回跳  
2. AI/Human 注释分层  
3. Anchored notes 跟随滚动  
4. 注释版本链（最小 lineage）  

验收标准：
- 同一段落可同时看到 AI 与人类注释
- 每条 AI 注释都能回到证据 span
- 修改注释后可看到历史版本

## Phase B (Product-Market Fit, 6-12 weeks): 形成差异化

目标：从“阅读工具”变成“研究工作台”。

1. 变量/函数/tensor 三层抽取  
2. Note graph（supports/contradicts/extends）  
3. 讲解音频转录 -> 结构化 insight  
4. 协作阅读（presence + threaded discussion）  

验收标准：
- 同名异义变量可分辨
- tensor 维度有可解释卡片
- 一次组会讨论能沉淀为可复用图谱

## Phase C (Platform, 3-6 months): 做成 OpenPhD 基础设施

目标：让“跨论文知识组织”成为默认能力。

1. 子领域检索 + 自动 survey 草稿  
2. baseline 复刻插件与结果对齐  
3. 跨论文概念/公式映射  
4. Story mode（给新人的教学路径）  

验收标准：
- 新人能在 1-2 小时理解一条研究脉络
- 每篇核心论文都有可复用的“lineage 叙事图”

## 6. 技术架构建议（与现有 ScholarReader 对齐）

### Ingestion Layer
- 现有 HTML/Markdown/TeX 流程继续保留
- 增加语音转录输入（Whisper）

### Enrichment Layer
- LLM 做结构化抽取（变量/函数/类型/主张）
- 检索增强用于证据绑定与反事实检查

### Knowledge Layer
- 事件溯源 + 图数据库（或 graph index）
- 支持 lineage 与非线性关系查询

### Interaction Layer
- Reader 主视图 + note 轨道 + graph 视图 + story 视图
- 强制 AI/Human 分层显示与过滤

## 7. 风险与防线

### 风险
- AI 幻觉污染知识库
- 多人协作中的低质量噪声
- 注释过多导致认知负担上升

### 防线
- 证据绑定与可追责元数据
- 质量分级（草稿/已验证/共识）
- 视图分层（初学者只看已验证，高级用户看全量）

## 8. 你这个 idea 的战略意义

这不是“给论文加 AI chat”。
这是把 **“个人科研经验”** 从不可复用、不可传承的隐性知识，转成可演进、可协作、可教学的显性知识资产。

如果做成，OpenPhD 可能成为：
- 研究生的 AI 导师
- 课题组的共享思维外脑
- 子领域 onboarding 的基础设施

