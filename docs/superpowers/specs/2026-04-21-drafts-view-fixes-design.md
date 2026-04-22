# Drafts View — Post-Review Fixes Design Spec

**Date:** 2026-04-21
**Status:** Approved
**Branch:** feature/drafts-view

---

## Context

After the initial drafts view implementation, a code review surfaced four issues: a hardcoded hex color in server-returned HTML that is correct in context but undocumented, a schema inconsistency in the History Sheet, and two missing UX disclosures (date filter semantics for reply drafts, and silent truncation at 50 results). This spec covers all four fixes.

No downstream consumers of the History Sheet were identified, so the schema fix has no migration risk.

---

## Fix 1 — `getDraftContent` Hardcoded Hex Color (`Code.js:855`)

**What:** The no-content fallback (`(No readable content found)`) uses the inline style `color:#94a3b8`.

**Why it's correct but undocumented:** The fallback HTML is returned as a string and rendered inside a sandboxed `<iframe srcDoc>`. CSS custom properties (`var(--text-disabled)`) from the outer page do not cascade into iframes — the variable would silently resolve to nothing. The hex `#94a3b8` matches the `--text-disabled` token value and is appropriate here.

**Change:** Add a one-line inline comment on `Code.js:855`:

```javascript
// #94a3b8 = var(--text-disabled); CSS vars don't cascade into sandboxed iframes
return '<p style="color:#94a3b8;font-style:italic;padding:12px">(No readable content found)</p>';
```

No functional change.

---

## Fix 2 — `logDraftHistory` Schema Inconsistency (`Code.js:905–917`)

**What:** `logDraftHistory` currently stores a newline-joined error string in the "Failed Emails" column (e.g., `"user@x.com - error\nother@x.com - error"`). The campaign function `logEmailHistory` stores an integer count in that column.

**Change:** Remove the `failedText` variable and pass `failed.length` (integer) directly to `appendRow`. Error detail is already surfaced in the delivery report sidebar and doesn't need to be duplicated in the sheet.

Before:
```javascript
var failedText = failed.length > 0
  ? failed.map(function(r) { return r.to + ' - ' + r.error; }).join('\n')
  : 'None';

historySheet.appendRow([
  new Date(), userEmail, 'DRAFT', templateUsed, sent.length, 0, failedText
]);
```

After:
```javascript
historySheet.appendRow([
  new Date(), userEmail, 'DRAFT', templateUsed, sent.length, 0, failed.length
]);
```

---

## Fix 3 — Date Filter Caveat (`script.html`)

**What:** Gmail's `after:` / `before:` query operators filter by the message's send date in the thread, not necessarily the draft's creation timestamp. A reply draft created today may not appear under today's filter if the original thread is older. The `internalDate` used for the displayed `createdAt` is the creation timestamp and is correct — only the filter's inclusion behavior may surprise users.

**Change:** Add a static one-line helper note immediately below the filter bar `app-card` div (after line 1098). Always visible — the caveat applies regardless of filter state.

```jsx
<p className="text-xs text-[var(--text-disabled)] flex items-center gap-1.5 -mt-3 mb-4 shrink-0">
    <i className="fa-solid fa-circle-info"></i>
    Filter is based on draft creation date. Results for reply drafts may vary.
</p>
```

---

## Fix 4 — 50-Draft Truncation Indicator (`Code.js` + `script.html`)

**What:** `getDrafts` caps results at 50 via `maxResults: 50`. When the Gmail API returns a `nextPageToken`, more results exist beyond the cap but are silently omitted.

### Server (`Code.js`)

Change `getDrafts` return type from a bare array to a plain object:

```javascript
// Before:
return draftItems.map(...).filter(Boolean);

// After:
const drafts = draftItems.map(item => { ... }).filter(Boolean);
return { drafts: drafts, truncated: !!listResult.nextPageToken };
```

### Client (`script.html`)

**New state variable** (add after the `draftSendResults` state declaration):
```jsx
const [draftsTruncated, setDraftsTruncated] = useState(false);
```

**Update `fetchDrafts`** to unpack the new return shape:
```jsx
const { drafts: results, truncated } = await runGas('getDrafts', draftStartDate, draftEndDate);
setDrafts(results);
setDraftsTruncated(truncated);
setSelectedDraftIds(new Set(results.map(d => d.id)));
```

Also reset truncation state when starting a new filter run (add `setDraftsTruncated(false)` at the top of `fetchDrafts`, alongside the existing resets for `draftSendResults` and `expandedDraftId`).

**Truncation notice** — add between the filter bar caveat note and the draft list / empty state (after Fix 3's note):

```jsx
{draftsTruncated && (
    <p className="text-xs text-[var(--text-disabled)] flex items-center gap-1.5 mb-4 shrink-0">
        <i className="fa-solid fa-triangle-exclamation text-amber-400"></i>
        Showing first 50 drafts — narrow your date range to see all.
    </p>
)}
```

Note: `text-amber-400` is used because `--status-warning` is not defined in the design token set (only `--status-success` and `--status-critical` exist). Tailwind CDN provides `text-amber-400`.

---

## Files Modified

- **`Code.js`** — Fix 1 (comment), Fix 2 (schema), Fix 4 (return type change in `getDrafts`)
- **`script.html`** — Fix 3 (static caveat note), Fix 4 (new state, updated `fetchDrafts`, truncation notice)

---

## Verification

1. `clasp push`
2. Open the web app → Drafts tab
3. Confirm the "Filter is based on draft creation date" note is visible below the filter bar
4. If >50 drafts exist in the selected range: confirm the truncation notice appears; otherwise confirm it is absent
5. Click "Send" on a draft batch that includes a failure — open the History Sheet and confirm the "Failed Emails" column contains an integer (e.g., `1`), not a string
6. Expand a draft with no readable content — confirm the gray italic fallback renders correctly in the iframe preview
7. Check the Apps Script execution log for no new errors
