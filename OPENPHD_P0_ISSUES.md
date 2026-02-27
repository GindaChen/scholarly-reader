# OpenPhD P0 Executable Issues

> Scope: 0-6 weeks
>
> Goal: ship a usable "AI + Human layered reading" loop with evidence traceability.

## Issue 1: feat(reader): Layered note model (`human_note` / `ai_note`)

### Problem
Current notes do not clearly separate human-authored insights from AI-authored insights.

### Scope
- Add annotation types: `human_note`, `ai_note`
- Render source badge in notes panel
- Keep backward compatibility with legacy `note`

### Acceptance Criteria
- [ ] New notes can be saved as human or AI source
- [ ] Notes list visibly labels source on each card
- [ ] Legacy `note` data still renders as human

### Files
- `services/scholarly-reader/public/reader.js`
- `services/scholarly-reader/public/reader.css`

---

## Issue 2: feat(reader): Evidence anchor + jump-to-evidence

### Problem
Notes are not reliably tied to exact reading location; users cannot quickly jump back to evidence.

### Scope
- Capture `anchorSelector` + `anchorOffset` when creating note/collapse
- Add "Jump" action in notes list
- Fallback to text search when anchor cannot be resolved

### Acceptance Criteria
- [ ] Every new note stores anchor metadata
- [ ] Clicking Jump scrolls to the anchor and flashes focus
- [ ] If anchor breaks, fallback search still works for most cases

### Files
- `services/scholarly-reader/public/reader.js`
- `services/scholarly-reader/public/reader.css`
- `services/scholarly-reader/server.js`

---

## Issue 3: feat(reader): Annotation upsert correctness

### Problem
Editing existing annotation can create duplicate records due to POST-based save path.

### Scope
- Use `PUT /api/annotations/:docId/:id` for updates
- Extend PUT whitelist fields (`type`, `selectedText`, `anchor*`)

### Acceptance Criteria
- [ ] Editing an existing note updates one record, not duplicates
- [ ] Updated fields persist across reload

### Files
- `services/scholarly-reader/server.js`
- `services/scholarly-reader/public/reader.js`

---

## Issue 4: feat(reader): Note-article flow sync (track mode lite)

### Problem
Notes panel behaves like a time feed, not an article-flow companion.

### Scope
- Add sorting mode toggle: `time` vs `flow`
- In flow mode, order notes by anchor position in article

### Acceptance Criteria
- [ ] Users can switch between time order and flow order
- [ ] Flow order follows reading sequence

### Files
- `services/scholarly-reader/public/reader.js`
- `services/scholarly-reader/public/reader.css`

---

## Issue 5: feat(ai): Section-level reading copilot cards

### Problem
No persistent "导读" scaffolding tied to each section.

### Scope
- Create section card schema: `What/Why/How/Assumption/OpenQuestions`
- Render in side panel with source spans
- Add "AI-generated" watermark + model metadata

### Acceptance Criteria
- [ ] At least one card per H2 section
- [ ] Every claim has clickable evidence span
- [ ] Cards are explicitly labeled AI-generated

### Files
- `services/scholarly-reader/public/reader.js`
- `services/scholarly-reader/public/reader.css`
- `services/scholarly-reader/server.js`

---

## Issue 6: feat(reader): AI hallucination guardrails (UI + data)

### Problem
AI note credibility is unclear; hallucinations are hard to audit.

### Scope
- Add note status: `hypothesis`, `verified`, `rejected`
- Default AI note status to `hypothesis`
- Add manual verify/reject actions

### Acceptance Criteria
- [ ] New AI notes default to hypothesis
- [ ] Human can mark verified/rejected
- [ ] Status is visible in note card and persisted

### Files
- `services/scholarly-reader/public/reader.js`
- `services/scholarly-reader/public/reader.css`
- `services/scholarly-reader/server.js`

---

## Issue 7: feat(extraction): semantic symbol split (same name, different meaning)

### Problem
Same symbol in different contexts is merged as one variable, causing conceptual confusion.

### Scope
- Add variable identity key: `symbol + local_scope + semantic_role`
- Display disambiguation suffix in sidebar (e.g. `h (encoder)`, `h (decoder)`)
- Keep cross-link to origin equations

### Acceptance Criteria
- [ ] Distinct semantics with same symbol are separated
- [ ] Sidebar and equation panel show disambiguated labels

### Files
- `services/scholarly-reader/server.js`
- `services/scholarly-reader/agents/import-agent/*`
- `services/scholarly-reader/public/reader.js`

---

## Issue 8: feat(extraction): function + tensor type cards

### Problem
Reader extracts symbols but misses function signatures and tensor shape semantics.

### Scope
- Extract function entities with arguments and return meaning
- Extract tensor shapes (`B x T x D`) and dimension descriptions
- Render as cards linked to equations

### Acceptance Criteria
- [ ] Function entities appear in side panel with signatures
- [ ] Tensor cards show shape + dimension semantics
- [ ] Cards link to at least one equation anchor

### Files
- `services/scholarly-reader/agents/import-agent/*`
- `services/scholarly-reader/public/reader.js`
- `services/scholarly-reader/public/reader.css`

---

## Suggested Execution Order

1. Issue 1 -> 2 -> 3 (data and UX foundation)
2. Issue 4 (flow sync)
3. Issue 5 -> 6 (AI layer with trust mechanisms)
4. Issue 7 -> 8 (semantic extraction depth)

## Milestone Definition (P0 done)

- [ ] User can create AI/Human notes with clear labels
- [ ] Every note can jump to evidence
- [ ] Annotation edits are idempotent (no duplication)
- [ ] Initial reading copilot cards are visible and auditable

