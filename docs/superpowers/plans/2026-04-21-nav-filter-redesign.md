# Nav & Filter Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Campaign/Drafts nav tabs into the header bar and collapse the Drafts date filter into a compact inline control docked to the Drafts card header.

**Architecture:** Both changes are pure layout edits to `script.html`. No logic, state, or backend changes. Task 1 removes the standalone `<nav>` element and adds tab buttons inside `<header>`. Task 2 restructures the Drafts title block into a two-column row with the compact filter on the right.

**Tech Stack:** React 18 (Babel in-browser), Tailwind CSS (CDN), Google Apps Script web app. No bundler, no test runner — manual verification via `clasp push`.

> **Note:** Per project convention (`CLAUDE.md`), do NOT run `clasp push` — leave that for the user to trigger after reviewing the code.

---

## File Map

| File | Change |
|---|---|
| `script.html:656–693` | Add nav tabs as center child of `<header>`; change `items-center` → `items-stretch` |
| `script.html:695–714` | Delete entire `<nav>` block |
| `script.html:1091–1127` | Restructure Drafts title+filter block into two-column flex row with compact filter |

---

### Task 1: Lift nav tabs into the header

**Files:**
- Modify: `script.html:656–714`

- [ ] **Step 1: Replace the `<header>` opening tag**

Find this exact line (line 656):
```jsx
<header className="border-b border-[var(--border-moderate)] py-3 px-6 mb-4 flex justify-between items-center bg-[var(--surface-primary)]/40 backdrop-blur-md sticky top-0 z-50 shrink-0">
```

Replace with:
```jsx
<header className="border-b border-[var(--border-moderate)] px-6 mb-4 flex items-stretch bg-[var(--surface-primary)]/40 backdrop-blur-md sticky top-0 z-50 shrink-0">
```

Changes: removed `py-3` (padding moves to children), changed `justify-between items-center` → `items-stretch` (children fill full height so the active-tab underline can touch the header's own bottom border).

- [ ] **Step 2: Add `py-3 justify-center mr-8` to the logo `<div>`**

Find this (line 657):
```jsx
                    <div className="flex flex-col">
```

Replace with:
```jsx
                    <div className="flex flex-col justify-center py-3 mr-8">
```

This re-adds the vertical padding locally and centers the logo text within the now-taller flex container.

- [ ] **Step 3: Insert the tab nav between logo div and right-side div**

Find this (line 663):
```jsx
                    <div className="flex items-center gap-6">
```

Insert the following block immediately before it:
```jsx
                    <div className="flex items-center gap-1 flex-1">
                        {[
                            { id: 'campaign', icon: 'fa-paper-plane', label: 'Campaign' },
                            { id: 'drafts', icon: 'fa-file-lines', label: 'Drafts' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 h-full text-sm font-semibold border-b-2 -mb-px transition-all ${
                                    activeTab === tab.id
                                        ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                                        : 'border-transparent text-[var(--text-secondary)] hover:text-white'
                                }`}
                            >
                                <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
                            </button>
                        ))}
                    </div>
```

- [ ] **Step 4: Add `py-3` to the right-side stats `<div>`**

Find (line 663, now shifted down by the insertion):
```jsx
                    <div className="flex items-center gap-6">
```

Replace with:
```jsx
                    <div className="flex items-center gap-6 py-3">
```

- [ ] **Step 5: Delete the standalone `<nav>` block**

Delete lines 695–714 in their entirety — the full block from `<nav className=...>` through `</nav>` and the blank line after it:

```jsx
                <nav className="border-b border-[var(--border-moderate)] bg-[var(--surface-primary)]/30 shrink-0">
                    <div className="flex gap-1 px-6">
                        {[
                            { id: 'campaign', icon: 'fa-paper-plane', label: 'Campaign' },
                            { id: 'drafts', icon: 'fa-file-lines', label: 'Drafts' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-all ${
                                    activeTab === tab.id
                                        ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                                        : 'border-transparent text-[var(--text-secondary)] hover:text-white'
                                }`}
                            >
                                <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
                            </button>
                        ))}
                    </div>
                </nav>
```

- [ ] **Step 6: Commit**

```bash
git add script.html
git commit -m "feat: move nav tabs into header bar"
```

---

### Task 2: Compact filter docked to Drafts card header

**Files:**
- Modify: `script.html:1091–1127`

- [ ] **Step 1: Replace the Drafts title wrapper div**

Find this exact block (lines 1091–1096):
```jsx
                                    <div className="mb-6 border-b border-[var(--border-moderate)] pb-4 shrink-0">
                                        <h2 className="text-2xl font-bold flex items-center gap-2">
                                            <i className="fa-solid fa-file-lines text-[var(--brand-primary)]"></i> Drafts
                                        </h2>
                                        <p className="text-[var(--text-secondary)] mt-1 text-sm">Filter, preview, and send emails from your Gmail Drafts.</p>
                                    </div>

                                    <div className="app-card flex flex-wrap items-center gap-3 mb-6 shrink-0">
                                        <span className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Created</span>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={draftStartDate}
                                            onChange={e => setDraftStartDate(e.target.value)}
                                        />
                                        <span className="text-[var(--text-disabled)]">→</span>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={draftEndDate}
                                            onChange={e => setDraftEndDate(e.target.value)}
                                        />
                                        <button
                                            onClick={fetchDrafts}
                                            disabled={isFetchingDrafts || isSendingDrafts}
                                            className="btn btn-primary"
                                        >
                                            {isFetchingDrafts
                                                ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Loading...</>
                                                : <><i className="fa-solid fa-filter"></i> Filter</>}
                                        </button>
                                    </div>

                                    <p className="text-xs text-[var(--text-disabled)] flex items-center gap-1.5 -mt-3 mb-4 shrink-0">
                                        <i className="fa-solid fa-circle-info"></i>
                                        Filter is based on draft creation date. Results for reply drafts may vary.
                                    </p>
```

Replace with:
```jsx
                                    <div className="mb-6 border-b border-[var(--border-moderate)] pb-4 shrink-0 flex justify-between items-start gap-4">
                                        <div>
                                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                                <i className="fa-solid fa-file-lines text-[var(--brand-primary)]"></i> Drafts
                                            </h2>
                                            <p className="text-[var(--text-secondary)] mt-1 text-sm">Filter, preview, and send emails from your Gmail Drafts.</p>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0">
                                            <div className="flex items-center gap-2 bg-black/20 border border-[var(--border-moderate)] rounded-lg px-3 py-2">
                                                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Created</span>
                                                <input
                                                    type="date"
                                                    className="form-input w-auto text-sm py-1"
                                                    value={draftStartDate}
                                                    onChange={e => setDraftStartDate(e.target.value)}
                                                />
                                                <span className="text-[var(--text-disabled)]">→</span>
                                                <input
                                                    type="date"
                                                    className="form-input w-auto text-sm py-1"
                                                    value={draftEndDate}
                                                    onChange={e => setDraftEndDate(e.target.value)}
                                                />
                                                <button
                                                    onClick={fetchDrafts}
                                                    disabled={isFetchingDrafts || isSendingDrafts}
                                                    className="btn btn-primary"
                                                >
                                                    {isFetchingDrafts
                                                        ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Loading...</>
                                                        : <><i className="fa-solid fa-filter"></i> Filter</>}
                                                </button>
                                            </div>
                                            <p className="text-xs text-[var(--text-disabled)] flex items-center gap-1.5 mt-2">
                                                <i className="fa-solid fa-circle-info"></i>
                                                Filter is based on draft creation date. Results for reply drafts may vary.
                                            </p>
                                        </div>
                                    </div>
```

- [ ] **Step 2: Commit**

```bash
git add script.html
git commit -m "feat: collapse drafts filter into compact card header control"
```

---

## Manual Verification (after user runs `clasp push`)

1. Open the web app
2. **Header:** Confirm Campaign and Drafts tabs appear inline in the header — no separate nav row below the header
3. **Tab switching:** Click Campaign → Drafts → Campaign — active underline updates correctly each time
4. **Drafts card:** Confirm the date filter (Created label + two date inputs + Filter button) appears in the top-right of the Drafts card header, on the same row as the "Drafts" title
5. **Caveat note:** Confirm "Filter is based on draft creation date..." appears right-aligned below the compact filter, not below the title
6. **Filter function:** Set a date range and click Filter — confirm drafts load correctly (no behavioral regression)
7. **Narrow viewport:** Resize the browser narrower — confirm header and Drafts card don't overflow horizontally
