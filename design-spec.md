# Airfoil Design System — Specification

> A reusable visual design language for internal enterprise tooling. Framework-agnostic. Assumes a JavaScript UI framework and a CSS utility layer (e.g. Tailwind), but all visual decisions live in CSS custom properties.

---

## 1. Aesthetic

**Name:** Airfoil
**Character:** Deep-space glassmorphism. Dark navy/indigo background, translucent frosted panels, a single cyan accent color, and controlled use of glow and blur. Every surface is dark; white text renders at multiple opacities to create hierarchy without additional hues.
**Target context:** Enterprise internal tools. Serious, polished, high-contrast. Not playful. Prioritizes information density and legibility over decoration.

---

## 2. External Dependencies

```html
<!-- Typography -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

<!-- Icons (solid style used throughout) -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
```

Tailwind is used only for structural layout utilities (`flex`, `grid`, `overflow`, etc.). All color, typography, and component visual styles come from the custom CSS token system below.

---

## 3. Design Tokens

Paste this `:root` block into your project's global stylesheet to bootstrap the system.

```css
:root {
    --font-sans: 'Inter', sans-serif;

    /* --- Brand --- */
    --brand-primary:       #22d3ee;
    --brand-primary-hover: #09a8b8;

    /* --- Text --- */
    --text-primary:   #ffffff;
    --text-secondary: rgba(255, 255, 255, 0.80);
    --text-disabled:  rgba(255, 255, 255, 0.56);

    /* --- Backgrounds --- */
    --background-gradient:
        fixed radial-gradient(circle at   0%   0%, rgba(  4, 25, 60,1.00), rgba(  8, 29, 63,0.00) 95%),
        fixed radial-gradient(circle at  90%  15%, rgba( 40, 23,144,0.60), rgba( 37, 30,125,0.00) 38%),
        fixed radial-gradient(circle at  40%  59%, rgba(  0, 79,173,1.00), rgba(  0, 73,159,0.00) 60%),
        fixed radial-gradient(circle at 100% 100%, rgba(  0,134,168,0.68), rgba( 14, 86,117,0.09) 64%),
        fixed radial-gradient(circle at  30% 100%, rgba(  2, 88,144,1.00), rgba(  2, 88,144,0.10) 30%),
        fixed radial-gradient(circle at  99%  99%, rgba(  0, 48, 83,1.00), rgba(  0, 48, 83,1.00) 60%)
        beige;

    --surface-primary:   #093565;
    --card-background:   linear-gradient(135deg, rgba(47,202,255,0.06) 0%, rgba(29,161,220,0.06) 100%);
    --modal-background:  rgba(10, 46, 87, 0.95);
    --secondary-hover:   rgba(47, 202, 255, 0.24);

    /* --- Inputs --- */
    --input-background:   rgba(105, 224, 255, 0.08);
    --input-border:       #4DD2D2;
    --input-border-hover: #95EEE5;

    /* --- Borders --- */
    --border-moderate: rgba(255, 255, 255, 0.24);
    --border-weak:     rgba(9, 168, 184, 0.24);

    /* --- Status --- */
    --status-success:  #21DDAA;
    --status-critical: #FF5664;

    /* --- Shape --- */
    --border-radius: 6px;   /* components */
    /* panels/modals use 12px (hardcoded) */
}
```

---

## 4. Typography

| Role | Size | Weight | Transform | Tracking |
|---|---|---|---|---|
| Body | `0.95rem` | 400 | — | — |
| Button label | `0.8125rem` | 600 | `uppercase` | `0.025em` |
| Field label | `0.75rem` | 600 | — | — |
| Section metadata | `0.75rem` | 600 | `uppercase` | `0.05em` |
| Subtext / hint | `0.75–0.875rem` | 400 | — | — |
| Monospace input | system monospace | 400 | — | — |

Apply `-webkit-font-smoothing: antialiased` to `body`.

**Placeholder / pending text:** italic, `rgba(255,255,255,0.70)`, weight 400.

---

## 5. Elevation & Shadow

Four tiers, from lowest to highest:

```css
/* Tier 1 — Focus ring (inputs) */
box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.20);

/* Tier 2 — Button hover glow (primary) */
box-shadow: 0 4px 12px rgba(34, 211, 238, 0.30);

/* Tier 2 — Button hover glow (danger) */
box-shadow: 0 4px 12px rgba(255, 86, 100, 0.35);

/* Tier 3 — Panel shadow (modals, wizard containers) */
box-shadow: 14px 14px 22px rgba(0,0,0,0.10), 3px 4px 6px rgba(0,0,0,0.10);

/* Tier 4 — Icon/logo glow (filter, not box-shadow) */
filter: drop-shadow(0 0 8px rgba(0, 136, 161, 0.40));
```

---

## 6. Motion

| Element | Property | Duration | Easing |
|---|---|---|---|
| All interactive elements | `all` | `0.2s` | `ease-in-out` |
| Button / interactive hover lift | `transform: translateY(-1px)` | `0.2s` | `ease-in-out` |
| Progress bar fill | `width` | `0.5s` | `cubic-bezier(0.25, 1, 0.5, 1)` |
| Toast enter | slide from right | `0.4s` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Toast exit | opacity fade | `0.4s` | `ease-out` |

**Toast keyframes:**

```css
@keyframes slideInRight {
    from { transform: translateX(120%); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
}

@keyframes fadeOutToast {
    from { opacity: 1; }
    to   { opacity: 0; }
}

.toast-enter { animation: slideInRight 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
.toast-exit  { animation: fadeOutToast 0.4s ease-out forwards; }
```

---

## 7. Component Library

### 7.1 Button

```css
.btn {
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius);
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    border: 1px solid transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
}

/* Primary — filled, brand color */
.btn-primary {
    background-color: var(--brand-primary);
    color: #020f24;                          /* dark text for contrast on cyan */
    border-color: var(--brand-primary);
}
.btn-primary:hover:not(:disabled) {
    background-color: var(--brand-primary-hover);
    border-color: var(--brand-primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 211, 238, 0.30);
}

/* Secondary — ghost, brand text */
.btn-secondary {
    background-color: transparent;
    color: var(--brand-primary);
    border-color: var(--border-moderate);
}
.btn-secondary:hover:not(:disabled) {
    background-color: var(--secondary-hover);
    border-color: var(--brand-primary);
}

/* Danger — filled, red */
.btn-danger {
    background-color: var(--status-critical);
    color: #ffffff;
    border-color: var(--status-critical);
}
.btn-danger:hover:not(:disabled) {
    opacity: 0.88;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 86, 100, 0.35);
}

/* Disabled (applies to all variants) */
.btn:disabled {
    background-color: rgba(255, 255, 255, 0.10);
    color: var(--text-disabled);
    border-color: var(--border-moderate);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}
```

**Usage rules:**
- Primary for the single most important action per context.
- Secondary for navigation (Back), settings toggles, and supplementary actions.
- Danger reserved for destructive or irreversible actions only. Always present inside a confirmation modal — never as the first affordance.
- Include a Font Awesome icon as the first or last child for visual anchoring (`gap: 0.5rem` handles spacing).

---

### 7.2 Form Input

```css
.form-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--input-border);
    background-color: var(--input-background);
    border-radius: var(--border-radius);
    font-size: 0.95rem;
    color: var(--text-primary);
    font-family: var(--font-sans);
    transition: all 0.2s ease;
}

.form-input:hover:not(:disabled) {
    border-color: var(--input-border-hover);
}

.form-input:focus {
    outline: none;
    border-color: var(--brand-primary-hover);
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.20);
    background-color: rgba(105, 224, 255, 0.12);   /* slightly brighter on focus */
}

/* Dark dropdown options (native <select>) */
.form-input option {
    background-color: var(--surface-primary);
    color: var(--text-primary);
}
```

Applies to `<input type="text">`, `<input type="email">`, `<textarea>`, and `<select>`. For monospace inputs (IDs, URLs), add `font-family: monospace`.

---

### 7.3 Panel / Wizard Layout

The primary container surface. Use for modals, multi-step flows, and any elevated content area.

```css
.wizard-layout {
    background: var(--modal-background);       /* rgba(10,46,87,0.95) */
    border: 1px solid var(--border-weak);
    box-shadow: 14px 14px 22px rgba(0,0,0,0.10), 3px 4px 6px rgba(0,0,0,0.10);
    border-radius: 12px;
    backdrop-filter: blur(16px);
}
```

**Confirmation modal pattern:**
Render a `wizard-layout` panel inside a `fixed inset-0 z-[100]` overlay with a `bg-black/60 backdrop-blur-sm` scrim. Max-width `max-w-sm`. Structure: heading → body text → `flex justify-end gap-3` action row (Cancel secondary, Confirm primary or danger).

---

### 7.4 App Card

A lighter inset surface used for form sections within a panel.

```css
.app-card {
    background: var(--card-background);
    border: 1px solid var(--border-moderate);
    border-radius: var(--border-radius);
    padding: 1.5rem;
}
```

Group related form fields inside an `.app-card`. Stack multiple cards with `gap: 1.5rem` or `space-y-6`.

---

### 7.5 Toast Notification

**Anatomy:** icon · [title · message] stacked vertically
**Position:** fixed, top-right, stacks downward (`flex-col gap-3`)
**Dimensions:** `min-width: 280px`, `max-width: 350px`

```css
/* Base toast element */
.toast {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    box-shadow: 0 25px 50px rgba(0,0,0,0.25);
    border: 1px solid var(--border-moderate);
    border-left-width: 4px;
    background-color: var(--surface-primary);
    color: var(--text-primary);
}

/* Accent left border: success or error */
.toast--success  { border-left-color: var(--status-success); }
.toast--error    { border-left-color: var(--status-critical); }

.toast__title    { font-size: 0.875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.toast__message  { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.125rem; }
```

**Timing:** appear immediately, begin exit animation at 3.6 s, remove from DOM at 4.0 s.
**Icon:** `fa-circle-check` in `--status-success` for success; `fa-triangle-exclamation` in `--status-critical` for error.

---

### 7.6 Skeleton Loader

Used during async initialization. Matches the exact dimensions of the real element.

```css
/* Matches the visual footprint of a .form-input */
.skeleton {
    background-color: var(--input-background);
    border: 1px solid var(--input-border);
    border-radius: var(--border-radius);
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
}
```

When using Tailwind: `bg-[var(--input-background)] border border-[var(--input-border)] rounded animate-pulse`.

---

### 7.7 Summary / Metadata List

Used in sidebars and review panels to display key-value pairs of campaign or configuration state.

```css
.summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-bottom: 1rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border-moderate);
}
.summary-item:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

.summary-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    font-weight: 600;
}

.summary-value {
    font-size: 0.95rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

/* Pending / not-yet-set state */
.summary-value--pending {
    color: rgba(255, 255, 255, 0.70);
    font-style: italic;
    font-weight: 400;
}
```

Each value row leads with a Font Awesome icon colored in `--brand-primary` (confirmed) or `--status-success` (validated).

---

### 7.8 Pill / Badge Link

Inline tag used for metadata like linked resources (e.g. folder name, record ID).

```css
.pill {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    border-radius: var(--border-radius);
    background-color: rgba(0, 0, 0, 0.20);
    border: 1px solid var(--border-weak);
    color: var(--brand-primary);
    font-size: 0.75rem;
    font-weight: 500;
    transition: all 0.2s ease-in-out;
}

.pill:hover {
    background-color: rgba(34, 211, 238, 0.10);
    border-color: var(--brand-primary);
}
```

---

### 7.9 Custom Scrollbar

```css
.custom-scrollbar::-webkit-scrollbar        { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track  { background: rgba(0,0,0,0.20); border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb  { background: var(--border-moderate); border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--brand-primary); }
```

Apply `.custom-scrollbar` to any `overflow-y: auto` container.

---

### 7.10 Light Mode Island

Used when rendering content that must appear in a light context — e.g. email previews, document renders, embedded third-party HTML. The island is completely isolated from the app's dark chrome.

```css
.light-island {
    background: #ffffff;
    color: #1e293b;
    border-radius: var(--border-radius);
    border: 1px solid var(--border-moderate);
    overflow: hidden;
}

/* Toolbar chrome (file header, breadcrumb, pagination) */
.light-island__toolbar {
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    color: #64748b;
}

/* Metadata strip (From / To / Subject) */
.light-island__meta {
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    padding: 1rem;
    font-size: 0.875rem;
}
.light-island__meta-label {
    width: 4rem;
    color: #64748b;
}

/* Loading placeholder */
.light-island__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: #cbd5e1;
}
```

**Rendering rule:** Never render user-controlled HTML directly into the app DOM. Use a sandboxed `<iframe srcDoc="...">` with `sandbox="allow-same-origin"` to ensure the content is isolated from the app's styles and scripts.

---

## 8. Layout Patterns

### App Shell

```
┌─────────────────────────────────────────────────┐
│  HEADER (sticky, backdrop-blur, surface-primary) │
├─────────────────────────────────────────────────┤
│                                                  │
│  MAIN (flex-grow, centered, max-w-6xl)           │
│  ┌────────────────────────────────┬──────────┐   │
│  │  LEFT COLUMN (flex-grow)       │ SIDEBAR  │   │
│  │  (scrollable, form content)    │ (w-80)   │   │
│  └────────────────────────────────┴──────────┘   │
│                                                  │
└─────────────────────────────────────────────────┘
```

- **Header:** `position: sticky; top: 0; z-index: 50; backdrop-filter: blur(12px); background: rgba(var(--surface-primary-rgb), 0.4); border-bottom: 1px solid var(--border-moderate);`
- **Content max-width:** `1152px` (`max-w-6xl`)
- **Sidebar:** `320px` fixed width, `background: rgba(0,0,0,0.20)`, `border-left: 1px solid var(--border-moderate)`
- **Panel shape:** `.wizard-layout` wraps the entire left+sidebar area; `border-radius: 12px`

### Form Section

Within the left column, group related fields in `.app-card` blocks with `gap: 1.5rem` between cards. Each card has an optional label row at the top (`font-size: 0.875rem; font-weight: 600; color: var(--text-secondary)`).

### Step Footer

Each step ends with a sticky footer row (`border-top: 1px solid var(--border-moderate); padding-top: 1rem; display: flex; justify-content: space-between`). Back action is `.btn-secondary` (left), primary advance action is `.btn-primary` (right).

---

## 9. Interaction Patterns

### Loading States
Two patterns depending on context:
1. **Skeleton pulse** — initial page load; matches the exact shape of the real element.
2. **Spinner + disabled** — in-flight async actions. Use `fa-circle-notch fa-spin` inside the button label; disable the element to prevent re-submission.

### Destructive Action Confirmation
Never execute destructive/irreversible actions on first click. Open a modal with:
- A `.wizard-layout` panel, max-width `20rem`
- Clear title (action name) + one-sentence consequence statement
- Cancel (`.btn-secondary`) on the left, Confirm (`.btn-danger` or `.btn-primary`) on the right
- Backdrop scrim: `background: rgba(0,0,0,0.60); backdrop-filter: blur(4px)`

### Keyboard Conventions
- `Enter` in a text input submits the primary action for that context.
- `ArrowLeft` / `ArrowRight` paginate list/record views when focus is **not** inside a text input, textarea, or select element (guard: check `document.activeElement.tagName`).

### Validation Feedback
Show an inline results panel when validation runs:
- Status pill: success (`--status-success` bg tint, border, text) or error (`--status-critical`).
- Sorted field list: failing fields first, each row `flex justify-between` with field name (monospace) and a badge.
- Keep the panel visible until the user changes inputs that would invalidate the result.

### Async Field Dependencies
When one field's value drives a dependent lookup (e.g. URL → fetch available options):
- Debounce the trigger by **1000 ms** to avoid firing on every keystroke.
- Show a spinner inline next to the dependent field's label during the fetch.
- Invalidate and clear all downstream state at the moment the triggering field changes.

---

## 10. Do's and Don'ts

| Do | Don't |
|---|---|
| Use `--brand-primary` for accents, icons, active states | Use multiple accent colors — one is enough |
| Lead button text with an icon for visual anchoring | Use icon-only buttons without a tooltip |
| Show loading state immediately before any async call | Leave the UI in an ambiguous state during loading |
| Use `--text-secondary` for labels, `--text-primary` for values | Use pure white for non-primary text |
| Render untrusted HTML in a sandboxed `<iframe srcDoc>` | Use `innerHTML` / `dangerouslySetInnerHTML` for user content |
| Use `.btn-danger` only inside a confirmation modal | Put a danger button as the primary CTA in a form |
| Scope keyboard shortcuts away from focused inputs | Attach global hotkeys unconditionally |

---

*Extracted from AirPost — Red Panda Projects. Last updated 2026-03-17.*
