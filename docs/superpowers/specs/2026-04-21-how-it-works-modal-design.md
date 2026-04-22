# How It Works Modal — AirPost Implementation Design

## Context

AirPost needed an in-app guide modal to help users understand its two core workflows (Campaign and Drafts) and their associated concepts. A reusable pattern spec already existed (`docs/superpowers/specs/2026-04-21-how-it-works-modal-pattern.md`); this document captures the AirPost-specific implementation decisions.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Content location | Inline `GUIDE_SECTIONS` constant in `script.html` | Everything already lives in `script.html`; no meaningful separation benefit from a separate file in a single-file GAS project |
| Trigger placement | Far right of header, after user email badge | Doesn't disrupt primary nav; visible without being intrusive |
| Sidebar nav | Click-to-scroll only (no IntersectionObserver) | Guide is short enough that scroll spy adds no real value |
| `dangerouslySetInnerHTML` | Used for intro/step/callout text | Content is authored source-code constants, not user input — CLAUDE.md's iframe rule applies only to untrusted HTML |

---

## Content — `GUIDE_SECTIONS`

Five sections, one group (`features`), defined as a module-scope constant at the top of `script.html`'s Babel block:

| id | title | flow | steps | callouts |
|---|---|---|---|---|
| `campaign` | Campaign | Setup → Audience → Preview & Send | 3 | 1 warning (Timestamp deduplication) |
| `placeholders` | Template Placeholders | — | 2 | 3: warning (reserved cols), info (Name first-word), tip (inline images) |
| `audience` | Audience Sheet | — | 2 | 2: info (CC + Attachments format), warning (Timestamp/Template auto-managed) |
| `drafts` | Drafts | Filter by date → Select drafts → Send | 3 | 2: info (creation date filter), tip (re-filter after send) |
| `history` | Send History | — | — | 2: info (log row structure), tip (shared across domain) |

Data shape:
```js
{
  id: string,
  title: string,
  group: 'features',
  intro: string,            // may contain inline HTML (<strong>, <code>)
  flows?: [{ label }][],   // array of flow chains
  steps?: [{ text }][],    // text may contain inline HTML
  callouts?: [{ variant: 'info'|'warning'|'tip', text }][]
}
```

---

## Component — `HowItWorksModal`

Location: `script.html`, after `ToastContainer` and before `AirPostApp`.

Props: `{ onClose }`

State / refs:
- `activeId` — tracks highlighted sidebar item (default: first section's id)
- `sectionRefs` — single `useRef({})` holding DOM element refs via callback refs, used for `scrollIntoView`

Behaviors:
- `useEffect` attaches `keydown` listener; `Escape` calls `onClose`; cleaned up on unmount
- Backdrop div (`guide-overlay`) calls `onClose` on click; panel div stops propagation
- `scrollTo(id)` sets `activeId` and calls `sectionRefs.current[id].scrollIntoView({ behavior: 'smooth' })`

Section rendering order:
1. `<h2>` section title
2. `<p dangerouslySetInnerHTML>` intro
3. Flow diagram (if `flows`) — flex row of `.guide-flow-node` pills with `.guide-flow-arrow` separators
4. Numbered steps (if `steps`) — `.guide-step-num` circle badge + `dangerouslySetInnerHTML` step text
5. Callouts (if `callouts`) — `.guide-callout guide-callout--{variant}` blocks with `dangerouslySetInnerHTML`
6. `<hr className="guide-divider">` between sections (not after the last)

---

## CSS — `styles.html`

New token added to `:root`:
- `--status-warning: rgb(251, 191, 36)` — amber, fills the gap in the Airfoil token set

New classes (all use CSS custom properties; no hardcoded hex):

| Class | Description |
|---|---|
| `.guide-overlay` | Fixed fullscreen backdrop, `z-index: 200`, dark semi-transparent |
| `.guide-panel` | Centered card, `max-width: 860px`, `height: 86vh`, flex column, `wizard-layout`-style background |
| `.guide-panel-header` | Header bar: title left, X close button right |
| `.guide-panel-title` | Book icon + "How It Works" label |
| `.guide-close-btn` | 28×28px ghost icon button |
| `.guide-body` | Flex row, `flex: 1`, `overflow: hidden` |
| `.guide-sidebar` | 180px wide, independently scrollable, darker bg |
| `.guide-sidebar-group` | 10px uppercase muted group label |
| `.guide-sidebar-item` | Full-width button, `border-left: 2px solid transparent` |
| `.guide-sidebar-item--active` | Left border = brand primary, light tint bg |
| `.guide-content` | `flex: 1`, `overflow-y: auto`, 28px padding |
| `.guide-section-title` | 18px bold section heading |
| `.guide-intro` | 13px secondary text, 1.65 line-height |
| `.guide-divider` | HR between sections (uses `--border-weak`) |
| `.guide-flow` | Flex row with wrap |
| `.guide-flow-node` | Pill: brand-tinted bg + border, `border-radius: 20px` |
| `.guide-flow-arrow` | Muted `→` separator |
| `.guide-step` | Flex row, `gap: 0.625rem` |
| `.guide-step-num` | 20×20px circle badge, brand-tinted |
| `.guide-step-text` | 13px secondary text |
| `.guide-callout` | `border-left: 3px solid`, rounded right corners |
| `.guide-callout--info` | Brand primary border + tint |
| `.guide-callout--warning` | `--status-warning` border + tint |
| `.guide-callout--tip` | `--status-success` border + tint |

---

## Trigger + Wiring — `AirPostApp`

1. New state: `const [isGuideOpen, setIsGuideOpen] = useState(false);`
2. Guide button in header — inside the right flex group, after the user email badge, before the logo group:
   ```jsx
   <button className="guide-trigger-btn" onClick={() => setIsGuideOpen(true)}>
     <i className="fa-solid fa-book-open"></i> Guide
   </button>
   ```
3. Modal render — before closing `</div>` of `AirPostApp`'s return:
   ```jsx
   {isGuideOpen && <HowItWorksModal onClose={() => setIsGuideOpen(false)} />}
   ```

---

## CLAUDE.md Rule

Appended at end of `CLAUDE.md`:

> **How It Works guide:** When adding, modifying, or removing any user-facing feature or workflow, update `GUIDE_SECTIONS` in `script.html` to reflect the change. Add a new entry for new features, update existing steps/callouts for changed behavior, and remove stale content for removed features. The guide must stay in sync with the app.

---

## Verification

1. Guide button appears in header, far right, after the user email badge
2. Clicking opens the modal — overlay, panel, header bar, two-column layout
3. All 5 sidebar items are clickable and scroll the right panel to the correct section + highlight with left border accent
4. Pressing `Escape` closes the modal
5. Clicking the backdrop (outside panel) closes the modal
6. All 5 sections render real content: intro, flows (where applicable), steps (where applicable), callouts
7. `GUIDE_SECTIONS` is the only source of guide content — nothing hardcoded in the component
8. `CLAUDE.md` rule is present and references `GUIDE_SECTIONS` in `script.html`
