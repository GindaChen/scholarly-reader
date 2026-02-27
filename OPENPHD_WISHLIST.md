# OpenPhD Wishlist for ScholarReader

> 目标：把 ScholarReader 从「增强阅读器」升级成「可演化的学术认知系统」。
>
> 核心原则：可溯源、可协作、可演进、可验证、可复用。

## Companion Docs
- [`OPENPHD_P0_ISSUES.md`](./OPENPHD_P0_ISSUES.md): 可直接执行的 P0 issue 拆解
- [`OPENPHD_100_IDEAS.md`](./OPENPHD_100_IDEAS.md): 100 个按价值/成本分层的扩展点

## P0 (0-6 weeks): 必须先做的能力

### 1) AI 导读与侧栏摘要（Reading Copilot）
- [ ] 章节级导读卡片：每节自动生成 `What/Why/How/Assumption/Open Questions`
- [ ] 阅读中导读（非开头一次性总结）：随着滚动提供“当前段落在全文中的作用”
- [ ] 证据锚点：每条 AI 摘要必须绑定原文 span（点击可回跳）
- [ ] 不确定性标注：AI 内容显示置信度与“可能错误”标签

### 2) AI / Human 注释分层与可追责
- [ ] 注释类型强制区分：`human_note` / `ai_note` / `ai_suggestion`
- [ ] AI 注释默认显示来源：模型、时间、提示词版本、证据 span
- [ ] 一键“转正”：把 AI 注释提升为 human 结论（保留 lineage）
- [ ] 注释审计日志：可追踪谁在何时编辑了什么

### 3) Note 跟随阅读位置（Anchored Notes）
- [ ] 每条注释绑定 selector（text quote + position fallback）
- [ ] 主视图滚动时，右侧 note 自动聚焦当前可视区相关注释
- [ ] “轨道视图”模式：注释在边栏按文章 flow 排序，不再是纯时间流
- [ ] 断锚修复：文档更新后自动重定位并标记置信度

### 4) 变量/函数/张量三层语义抽取
- [ ] 同名异义拆分：`h (encoder)` vs `h (decoder)` 由 AI 上下文判别
- [ ] 函数实体化：提取函数名、参数、定义域、返回值、依赖变量
- [ ] 张量类型推断：对每个 tensor 输出 shape 语义（例如 `B x T x D`）
- [ ] 维度解释卡片：每个维度对应含义与来源句子

## P1 (6-12 weeks): 形成差异化的能力

### 5) Lineage（思考演进）系统
- [ ] Note 版本树：每次改写产生新节点，不覆盖旧观点
- [ ] 分叉与合并：允许并行思路，后续手动 merge
- [ ] 对比视图：比较“现在的我 vs 过去的我”对同一段落的解读
- [ ] 里程碑快照：支持“论文初读/复读/讲解后”的认知切片

### 6) 非线性知识图谱（Note Graph）
- [ ] Note-to-Note 链接：支持 `supports / contradicts / extends / analogies`
- [ ] 变量与注释双向连接：从变量看注释，从注释回到变量/公式
- [ ] 跨论文连接：同一概念在多篇论文中的定义演化
- [ ] 观点聚类：自动聚合同类见解，形成“研究视角”

### 7) 协作阅读（多人在线）
- [ ] 同步光标和 presence（谁在读哪里）
- [ ] 小组频道（Lab / Project / Public）
- [ ] 人类观点与 AI 观点并列展示，可独立过滤
- [ ] 冲突处理：同一锚点的多方注释支持讨论线程

### 8) 语音讲解 -> 活注释
- [ ] 本地/云转录后自动分段映射回原文
- [ ] 把口述内容转换为结构化 note（claim/evidence/question）
- [ ] 讲解版本进入 lineage，而非覆盖原注释
- [ ] 支持“讲给新手听”与“讲给同行听”两种语气模板

## P2 (12+ weeks): 平台化扩展

### 9) AI-driven Literature Ops
- [ ] 语义检索插件：基于问题跨库检索并给出证据链
- [ ] 子领域自动 survey：按时间线与方法谱系生成综述草稿
- [ ] baseline 复刻助手：提取论文配置，自动生成最小可复现实验模板
- [ ] 结果对齐面板：论文报告指标 vs 复刻结果差异分析

### 10) 可视化与可教学化
- [ ] 公式依赖图（Equation DAG）
- [ ] 变量/函数生命线（在哪些章节引入与复用）
- [ ] 维度流图（Tensor dimension flow）
- [ ] 叙事模式（Story mode）：将论文转化成可教学的路径化讲解

## 数据与协议 Wishlist（实现层）

- [ ] 注释协议兼容 W3C Web Annotation Data Model
- [ ] 事件溯源存储：`note_created`, `note_edited`, `note_merged`, `note_verified`
- [ ] Graph schema：Paper / Span / Variable / Function / TensorType / Note / Insight
- [ ] 证据要求：所有 AI 结论默认需绑定 `>=1` 原文证据
- [ ] AI 安全闸：无证据内容默认降级为 `hypothesis`

## 成功指标（North Star + Guardrails）

- [ ] TTFI（Time to First Insight）下降 30%
- [ ] 新读者 onboarding 时间下降 40%
- [ ] AI 注释被人类“转正”的比例 > 35%
- [ ] AI 幻觉率（人工抽检）逐月下降
- [ ] 每篇论文平均产生的可复用 insight 数提升

## 研究到产品的映射（精选）

- Semantic Reader 总览：<https://arxiv.org/abs/2303.14334>
- ScholarPhi（术语/符号就地解释）：<https://arxiv.org/abs/2009.14237>
- Scim（多层次 skimming）：<https://arxiv.org/abs/2205.04561>
- Definition Detection：<https://arxiv.org/abs/2010.05129>
- Math Notation Semantics：<https://aclanthology.org/2021.findings-emnlp.266/>
- S2ORC（大规模论文语料）：<https://aclanthology.org/2020.acl-main.447/>
- QASPER（论文问答）：<https://arxiv.org/abs/2105.03011>
- SciFact（科学主张验证）：<https://aclanthology.org/2020.emnlp-main.609/>
- ALCE（带引用生成评测）：<https://arxiv.org/abs/2305.14627>
- RARR（检索+修订减少幻觉）：<https://arxiv.org/abs/2210.08726>
- SelfCheckGPT（黑盒幻觉检测）：<https://aclanthology.org/2023.emnlp-main.557/>
- OpenScholar（科学文献 RAG 合成）：<https://arxiv.org/abs/2411.14199>
- PaperQA（科学检索问答代理）：<https://arxiv.org/abs/2312.07559>
- ORKG（结构化科研知识图）：<https://arxiv.org/abs/1901.10816>
- PKG Survey（个人知识图谱生态）：<https://arxiv.org/abs/2304.09572>
- Personal Research Knowledge Graphs：<https://arxiv.org/abs/2204.11428>
- Web Annotation 标准：<https://www.w3.org/TR/annotation-model/>
- Whisper（语音转录基础）：<https://arxiv.org/abs/2212.04356>
- MeetingBank（会议/讲解摘要数据）：<https://aclanthology.org/2023.acl-long.906/>
