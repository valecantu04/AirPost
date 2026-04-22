# Nav & Filter Redesign Design Spec

**Date:** 2026-04-21
**Status:** Approved
**Branch:** feature/drafts-view

---

## Context

Two layout problems in the current UI:
1. The Campaign/Drafts nav tabs occupy their own dedicated row below the header, wasting vertical real estate.
2. The Drafts filter (date range + button) is a full-width `app-card` that dominates the top of the Drafts view before any drafts appear.

Both are pure layout changes. No logic, state, or backend behavior changes.

---

## Change 1 — Nav Tabs Into Header (`script.html`)

**Current:** A `<nav>` element (lines 695–714) sits below `<header>` as its own bar with a `border-b` and `bg-[var(--surface-primary)]/30` background. It renders Campaign and Drafts as tab buttons with a bottom-border indicator.

**Target:** Remove the `<nav>` element entirely. Lift the two tab buttons into the `<header>` as a third flex child, positioned between the logo area (left) and the right-side stats group (right).

**Details:**
- Header is `flex justify-between items-center` — add `items-stretch` so the nav can span full header height for the `border-b-2` active indicator to touch the header's bottom edge.
- Tab buttons keep identical styling: `border-b-2`, brand color (`var(--brand-primary)`) when active, `text-[var(--text-secondary)]` when inactive, `hover:text-white` transition.
- Button height spans the full header height (`h-full`) so the active underline aligns with the header's own `border-b`.
- The `shrink-0` on the removed `<nav>` is no longer needed.

---

## Change 2 — Compact Filter in Drafts Card Header (`script.html`)

**Current:** Lines 1098–1127 — a full-width `app-card` div containing a stacked layout: `CREATED` label, start date input, `→`, end date input, Filter button — all taking significant vertical space.

**Target:** Remove the standalone filter `app-card`. Restructure the Drafts section title block into a `flex justify-between items-start` row:
- **Left:** existing `<h2>` (Drafts title) and `<p>` subtitle, unchanged.
- **Right:** a compact filter group containing:
  - Small `Created` label (`text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]`)
  - Start date `<input type="date">` (use existing `form-input` class, narrowed via `w-auto` or explicit width)
  - `→` separator
  - End date `<input type="date">`
  - Filter `<button>` (existing `btn btn-primary` class)
  - Wrapped in a single container: `flex items-center gap-2 bg-black/20 border border-[var(--border-moderate)] rounded-lg px-3 py-2`

**Caveat note:** The existing `<p>` caveat ("Filter is based on draft creation date...") moves directly below the compact filter group, right-aligned (`text-right` or `flex justify-end`). Same text, same classes (`text-xs text-[var(--text-disabled)] flex items-center gap-1.5`).

**No logic changes:** `draftStartDate`, `draftEndDate`, `fetchDrafts`, `isFetchingDrafts`, `isSendingDrafts` — all unchanged.

---

## Files Modified

- **`script.html`** only
  - Remove `<nav>` block (lines 695–714)
  - Update `<header>` to include tab buttons as center child
  - Restructure Drafts section title block (lines 1091–1127) into two-column layout with compact filter on right

---

## Verification

1. `clasp push`
2. Open the web app
3. Confirm the header contains Campaign and Drafts tabs inline — no separate nav row below the header
4. Click each tab — confirm active indicator (underline) works correctly
5. On the Drafts tab: confirm the filter (date inputs + Filter button) appears in the top-right of the Drafts card header, not as a separate full-width card below the title
6. Confirm the caveat note appears below the compact filter, right-aligned
7. Filter by date range — confirm drafts load correctly (no regression in behavior)
8. Confirm layout holds on narrower viewport widths (the header and Drafts card should not overflow)
