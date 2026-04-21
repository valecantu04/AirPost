# How It Works Modal — Bootstrap Prompt

Copy everything below this line and paste it into Claude Code in the target project.

---

Add a "How It Works" guide modal to this app. Here is the full pattern to follow:

## Step 1 — Explore first
Read the existing codebase to understand:
- What are the main features and workflows a user interacts with?
- Where is the main navigation or header component?
- What framework and component conventions does this project use (React, SolidJS, Vue, plain JS, etc.)?
- What file extension and directory should the content file live in?

Do this exploration before writing any code.

## Step 2 — Create the content file

Create a file at an appropriate path (e.g. `src/lib/how-it-works-content.ts` or equivalent) with this structure:

**Types to define:**

```
GuideCalloutVariant = 'info' | 'warning' | 'tip'

GuideGroup = string   // e.g. 'getting-started' | 'features' | 'automation'

GuideCallout {
  variant: GuideCalloutVariant
  text: string  // may contain inline HTML for bold/code
}

GuideStep {
  text: string  // may contain inline HTML for bold/code
}

GuideFlowNode {
  label: string
}

GuideSection {
  id: string
  title: string
  group: GuideGroup
  intro: string         // one-paragraph description, may contain inline HTML
  flows?: GuideFlowNode[][]  // array of chains; each chain is an ordered node array
  steps?: GuideStep[]
  callouts?: GuideCallout[]
  mockup?: () => any  // optional render function returning a framework-native UI element
}
```

Define a `GUIDE_SECTIONS` array of `GuideSection` objects. Also define a `GROUPS` array (ordered) and a `GROUP_LABELS` map (group key → display label).

**Initial content:** Write 3–6 sections covering the app's main features based on your exploration. Use these callout variants purposefully:
- `info` — how something works that isn't obvious
- `warning` — a constraint or gotcha the user should know
- `tip` — a power-user shortcut or non-obvious workflow

## Step 3 — Create the modal component

Create a modal component adapted to the project's framework. The modal must:

**Layout:**
- Full-screen overlay (backdrop with click-to-close)
- Centered panel: ~860px wide, 86vh tall, no inner scroll on the container
- Two-column layout:
  - Left: 180px sidebar — sections grouped by category. Group label (uppercase, small, muted). Each section is a clickable button that scrolls the main content to that section. Active section gets a left border accent and light background tint.
  - Right: flex-1, independently scrollable, 28–32px padding

**Header bar (above the two-column layout):**
- "How It Works" label with a book icon (use whatever icon library the project has; fall back to a text label)
- Close button (X icon) at far right
- Pressing Escape closes the modal

**Content rendering per section:**
- `<h2>` for section title
- `<p>` for intro (rendered as HTML if the framework supports it)
- Flow diagrams: a flex row of pill-shaped nodes connected by → arrows
- Numbered steps: custom numbered list (circle badge with number + step text rendered as HTML)
- Callouts: left-border colored block (info = brand accent, warning = amber, tip = green), with the text rendered as HTML
- Optional mockup: render below the callouts

**Section divider:** horizontal rule between sections.

## Step 4 — Wire the trigger

Add a "Guide" button to the main nav or header. The button should:
- Show a book icon (if available) + the text "Guide"
- On click: open the modal
- Be positioned where it doesn't disrupt the primary nav actions (e.g. far right of the nav)

## Step 5 — Add the CLAUDE.md rule

Append this rule to the project's CLAUDE.md (or equivalent agent instructions file, or create one if it doesn't exist):

**How It Works guide:** When adding, modifying, or removing any user-facing feature or workflow, update `[the content file path you chose]` to reflect the change. Add a new `GuideSection` entry for new features, update existing steps/callouts for changed behavior, and remove stale content for removed features. The guide must stay in sync with the app.

## Notes

- Adapt all code to the project's framework, component conventions, styling system, and file extensions.
- If the project has a CSS variable-based design system, use those variables for colors; otherwise use inline styles or whatever the project uses.
- If the project has no icon library, use a text label for the trigger button and omit the header icon.
- The content file must be the single source of truth for all guide content. The modal component reads from it; it is never hardcoded in the component.
- Do not add error handling, loading states, or API calls — this modal is entirely static.
