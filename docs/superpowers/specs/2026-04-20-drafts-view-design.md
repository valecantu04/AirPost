# Drafts View — Design Spec

**Date:** 2026-04-20  
**Status:** Approved

---

## Context

AirPost currently supports one email workflow: a 3-step wizard that sends personalized emails from a Google Doc template to a spreadsheet audience. Users also compose emails as Gmail drafts and need a way to review and dispatch those drafts from within AirPost — without leaving the app or switching to Gmail. This spec covers the Drafts View feature: a second top-level tab where users can filter, preview, select, and bulk-send their Gmail drafts, with results logged to the existing AirPost history sheet.

---

## Navigation Change

A **tab bar** is added between the existing Header and the main content area. It contains two tabs:

- **Campaign** — the existing 3-step wizard (default/active on load)
- **Drafts** — the new view defined in this spec

A new `activeTab` state variable (`'campaign' | 'drafts'`) is added to `AirPostApp`. The `Stepper` and step panels conditionally render when `activeTab === 'campaign'`. The Drafts View renders when `activeTab === 'drafts'`. All existing campaign state is preserved when switching tabs.

---

## Drafts View — UI

### Date Filter Bar

At the top of the Drafts View. Contains:
- **Start date** input — defaults to today minus 7 days on mount
- **End date** input — defaults to today on mount
- **Filter button** — triggers `fetchDrafts()` with the selected range

Filtering is based on **draft creation date** (the Gmail internal message date). The filter is not applied automatically on date change — the user must click Filter.

### Draft List

Displays below the filter bar. Each row shows:
- **Checkbox** — checked by default when a draft first loads
- **Subject** line (truncated with ellipsis if overlong)
- **To**, **CC** (if present), **From**, and **creation date** — rendered as a subtitle line
- **Expand chevron** — toggles the inline preview

A **select-all checkbox row** appears above the list, showing the count of currently selected drafts (`N drafts selected`) and the primary action button: **"Send N Drafts"** (disabled when count is 0).

### Inline Preview

Clicking a draft row expands it and renders the draft's HTML body in a sandboxed `<iframe srcDoc>` using the existing Light Mode Island pattern (white background, isolated from app styles). The preview is loaded lazily — `getDraftContent(draftId)` is called on first expand, not on list load. Subsequent expands of the same draft use cached HTML stored in component state.

### Delivery Report Sidebar

A right sidebar appears only after a send run completes. It shows per-draft results:
- `✓ Subject — sent` (in `--status-success` green)
- `✗ Subject — failed: [error message]` (in `--status-critical` red)

A summary line at the bottom: `"N sent · M failed · [date]"`.

The sidebar is hidden on initial load and when the user changes the date filter (stale results are cleared on new filter application).

---

## State (Client-Side Additions)

All new state lives inside `AirPostApp`. No new top-level component is required — the Drafts View is a conditional block inside the existing layout.

| State variable | Type | Initial value | Purpose |
|---|---|---|---|
| `activeTab` | `'campaign' \| 'drafts'` | `'campaign'` | Controls which view is rendered |
| `draftStartDate` | string (YYYY-MM-DD) | today − 7 days | Filter start date |
| `draftEndDate` | string (YYYY-MM-DD) | today | Filter end date |
| `drafts` | array | `[]` | Draft metadata from server |
| `isFetchingDrafts` | boolean | `false` | Loading state for list |
| `expandedDraftId` | string \| null | `null` | Which draft is expanded |
| `draftContentCache` | object (id → html) | `{}` | Cached HTML bodies |
| `isFetchingDraftContent` | boolean | `false` | Loading state for preview |
| `selectedDraftIds` | Set | empty Set | Checked draft IDs |
| `isSendingDrafts` | boolean | `false` | Sending in-progress |
| `draftSendResults` | array \| null | `null` | Per-draft send results |

---

## Server-Side Functions (Code.js)

### `getDrafts(afterDate, beforeDate)`

- Calls `Gmail.Users.Drafts.list('me', { q: 'after:YYYY/MM/DD before:YYYY/MM/DD', maxResults: 50 })`
- For each result, calls `Gmail.Users.Drafts.get('me', id, { format: 'metadata' })` to fetch Subject, To, CC, From headers and the `internalDate` timestamp
- Returns: `[{ id, subject, to, cc, from, createdAt }]` — all plain strings, no Date objects
- `to` and `cc` are comma-joined strings when multiple recipients are present; `cc` is an empty string if absent
- `createdAt` is an ISO date string derived from `internalDate` (milliseconds epoch → ISO string)

### `getDraftContent(draftId)`

- Calls `Gmail.Users.Drafts.get('me', draftId, { format: 'full' })`
- Walks the MIME part tree (`payload.parts`) recursively to find the first `text/html` part
- Decodes its `body.data` (base64url) using `Utilities.newBlob(Utilities.base64DecodeWebSafe(data)).getDataAsString()`
- Falls back to `text/plain` if no HTML part exists (wraps in `<pre>` tags)
- Returns the HTML string

### `sendDrafts(draftIds)`

- Accepts an array of draft ID strings
- For each ID: calls `Gmail.Users.Drafts.send('me', { id: draftId })` inside a try/catch
- One failure does not abort the batch — all IDs are attempted
- Calls `logDraftHistory(Session.getEffectiveUser().getEmail(), results)` after the loop
- Returns: `[{ draftId, subject, to, success, error }]`

### `logDraftHistory(userEmail, results)`

- Opens the History Sheet at `HISTORY_SHEET_ID`
- Appends one row per send run (not per draft) to the existing "Email History" sheet
- Column mapping (no schema change):
  - `Timestamp` — current datetime
  - `User Email` — the sender
  - `Template ID` — `"DRAFT"`
  - `Template Used` — comma-joined list of sent draft subjects
  - `Emails Sent` — count of successful sends
  - `Emails Skipped` — `0` (not applicable for drafts)
  - `Failed Emails` — count of failures

---

## Confirmation Flow

Reuses the existing `ConfirmModal` component with `isDanger: true`.

**Modal message:** `"Send [N] draft(s)? They will be permanently deleted from your Gmail Drafts folder."`

On confirm: `isSendingDrafts` is set to true, `sendDrafts(selectedDraftIds)` is called, results populate `draftSendResults`, the delivery report sidebar appears. After the full batch resolves, successfully sent drafts are removed from the `drafts` list (failed ones remain, unchecked, so the user can retry).

On cancel: no action, modal closes.

---

## Error Handling

- **No drafts in range:** Show an empty state message — `"No drafts found in this date range."` — with a suggestion to widen the date range.
- **`getDrafts` fails:** Show a toast using the existing toast system — `"Failed to load drafts. Please try again."`
- **`getDraftContent` fails:** Show an error inside the expanded preview area — `"Could not load preview."` — with a retry link.
- **Partial send failures:** The delivery report sidebar shows per-draft status. A toast summarizes: `"2 sent, 1 failed."` Failed drafts remain in the list (unchecked) so the user can retry.
- **All sends fail:** A danger toast — `"Send failed. Your drafts were not deleted."`

---

## Verification

1. Push to Apps Script via `clasp push`
2. Open the web app — confirm the tab bar appears with "Campaign" and "Drafts" tabs
3. Click "Drafts" — confirm the date filter bar loads with last-7-days defaults
4. Click "Filter" — confirm the draft list populates with correct Subject/To/CC/From/Date metadata
5. Click a draft row — confirm the inline preview renders the email HTML correctly
6. Check/uncheck drafts — confirm the "Send N Drafts" button count updates
7. Click "Send N Drafts" — confirm the confirmation modal appears with correct count
8. Confirm the send — verify: (a) selected drafts disappear from Gmail Drafts, (b) delivery report sidebar appears, (c) a new row appears in the History Sheet with `Template ID = "DRAFT"`
9. Switch back to "Campaign" tab — confirm all existing campaign state is intact
