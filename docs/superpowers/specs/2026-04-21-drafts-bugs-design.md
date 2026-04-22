# Spec: Drafts View Bug Fixes — OAuth Scope, Date Filter, Preview Failure, Base64 Decode, Auto-fetch

**Date:** 2026-04-21
**Branch:** `feature/drafts-view`
**Status:** Approved

---

## Context

Three bugs were discovered in the Drafts tab after initial implementation:

1. **Stale drafts in the list** — Drafts deleted or sent outside the app remain visible because the Gmail list API is eventually consistent and the app has no post-load reconciliation.
2. **Preview always fails** — `getDraftContent` throws for every draft (including brand-new ones) because the app was authorized before this function existed. At authorization time, Apps Script auto-detected only the `gmail.metadata` scope (from `getDrafts`). `getDraftContent` requires `gmail.readonly` for `format: 'full'`, which was never granted. The error HTML gets cached as a truthy string, permanently blocking retries.
3. **Date filter off-by-one** — Gmail's `before:` operator is exclusive. A draft created on the end-date day is not returned unless the user sets the end date to tomorrow.

---

## Changes

### 1. OAuth Scopes — `appsscript.json`

Add explicit `oauthScopes` to force a re-authorization the next time any user opens the app. Without explicit scopes, Apps Script auto-detects, and the cached session only holds `gmail.metadata`.

```json
"oauthScopes": [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents"
]
```

`https://mail.google.com/` is the full Gmail scope — covers list, metadata, full-content get, and send for both the Campaign and Drafts tabs.

After `clasp push`, the next app open triggers the authorization dialog. Once re-authorized, `getDraftContent` will have the required access.

---

### 2. Date Filter — `Code.js`, `getDrafts`

Add 1 day to `beforeDate` before building the Gmail query string, making the end date inclusive from the user's perspective.

```js
// Current (exclusive — draft created on end date is not returned)
const beforeQuery = beforeDate.replace(/-/g, '/');

// Fixed (inclusive)
const d = new Date(beforeDate + 'T12:00:00Z'); // noon UTC avoids DST edge cases
d.setUTCDate(d.getUTCDate() + 1);
const beforeQuery = d.toISOString().slice(0, 10).replace(/-/g, '/');
```

No client changes. The date inputs and their labels remain unchanged.

---

### 3. Server Error Distinction — `Code.js`, `getDraftContent`

Currently the `catch` block throws one generic message for all failures. Fix: inspect the error and throw a sentinel the client can key on.

```js
} catch (error) {
  Logger.log(`Error fetching draft content for ${draftId}: ${error.message}\nStack: ${error.stack}`);
  if (error.message && (error.message.includes('404') || error.message.toLowerCase().includes('not found'))) {
    throw new Error('Draft not found');
  }
  throw new Error(`Could not load draft preview: ${error.message}`);
}
```

- `'Draft not found'` — client auto-removes the draft row
- `'Could not load draft preview: <actual error>'` — client shows the message + a retry button, surfacing the real reason

---

### 4. Error Caching + Preview UX — `script.html`

**Problem:** error HTML is stored as a truthy string in `draftContentCache`. The cache-hit guard (`if (draftContentCache[draftId]) return;`) permanently blocks retries.

**Fix:** introduce a parallel `draftContentErrors` state map. The content cache only ever holds successful HTML. Errors live separately.

#### New state

```js
const [draftContentErrors, setDraftContentErrors] = React.useState({});
// shape: { [draftId]: { message: string, notFound: boolean } }
```

#### New `loadDraftContent` helper

```js
const loadDraftContent = async (draftId) => {
  if (draftContentCache[draftId]) return;
  try {
    const html = await runGas('getDraftContent', draftId);
    setDraftContentCache(prev => ({ ...prev, [draftId]: html }));
  } catch (err) {
    const notFound = err.message === 'Draft not found';
    setDraftContentErrors(prev => ({ ...prev, [draftId]: { message: err.message, notFound } }));
    if (notFound) {
      setDrafts(prev => prev.filter(d => d.id !== draftId));
      setSelectedDraftIds(prev => { const s = new Set(prev); s.delete(draftId); return s; });
      setExpandedDraftId(null);
    }
  }
};
```

#### Updated `handleExpandDraft`

Clears the error for a draft before calling `loadDraftContent` (allows re-expanding as an implicit retry):

```js
const handleExpandDraft = async (draftId) => {
  if (expandedDraftId === draftId) { setExpandedDraftId(null); return; }
  setExpandedDraftId(draftId);
  if (draftContentCache[draftId]) return;
  setDraftContentErrors(prev => { const next = { ...prev }; delete next[draftId]; return next; });
  await loadDraftContent(draftId);
};
```

#### Preview pane — three render states

| State | Condition | Renders |
|---|---|---|
| Loading | `!cache[id] && !errors[id]` | Spinner |
| Success | `cache[id]` | `<iframe srcDoc>` |
| Error | `errors[id]` | Styled error message + optional Retry button |

Retry button is shown only when `notFound` is false (there is nothing to retry for a deleted draft). Clicking Retry calls `loadDraftContent(draft.id)` directly — not `handleExpandDraft` — so the panel stays open during the re-fetch.

#### Cleanup in fetch handlers

`fetchDrafts` and `loadMoreDrafts` both clear `draftContentErrors` on each load (mirrors how they clear `draftContentCache` today). `fetchDrafts` resets to `{}`. `loadMoreDrafts` does not reset (preserves errors for drafts already in the list).

---

### 5. Base64 Decode Robustness — `Code.js`, `getDraftContent`

**Problem:** `getDraftContent` calls `Utilities.base64DecodeWebSafe(data)` directly on the raw part data returned by the Gmail API. The API can return MIME-folded base64 (newlines every 76 chars) or standard base64 (`+`/`/` instead of `-`/`_`), both of which cause `base64DecodeWebSafe` to throw "Could not decode string."

**Fix:** Extract a `decodeBase64Part(data)` helper placed alongside `findMimePart`. It strips whitespace and normalizes standard base64 characters to URL-safe equivalents before decoding — a no-op for data already in URL-safe format.

```js
function decodeBase64Part(data) {
  const clean = data.replace(/\s/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(clean)).getDataAsString();
}
```

Replace both inline decode calls in `getDraftContent`:
- Line 851: `return decodeBase64Part(htmlData);`
- Line 856: `const text = decodeBase64Part(plainData);`

---

### 6. Auto-fetch on Drafts Tab Entry — `script.html`

**Problem:** The user must manually click "Filter" every time they open the Drafts tab. The date range already defaults to the last 7 days, so the first fetch should happen automatically.

**Fix:** Add `useRef` to the existing destructure on line 2 of `script.html`, then add a ref flag and one `useEffect` alongside the existing effects. The ref prevents re-fetching when the user switches away and returns (their results and date pickers are preserved).

```js
const draftsFetchInitiated = useRef(false);

useEffect(() => {
    if (activeTab === 'drafts' && !draftsFetchInitiated.current) {
        draftsFetchInitiated.current = true;
        fetchDrafts();
    }
}, [activeTab]);
```

No server changes. The default date range (`last 7 days → today`) already in state is used.

---

## Files Changed

| File | Change |
|---|---|
| `appsscript.json` | Add `oauthScopes` array |
| `Code.js` | `getDrafts`: fix `beforeDate` date math; `getDraftContent`: distinguish 404 vs other errors in catch; add `decodeBase64Part` helper; replace inline decode calls |
| `script.html` | Add `draftContentErrors` state; extract `loadDraftContent`; update `handleExpandDraft`; update `fetchDrafts` cleanup; update preview pane JSX; add `draftsFetchInitiated` ref + auto-fetch `useEffect` |

---

## Verification

1. `clasp push` → open the web app → confirm re-authorization dialog appears
2. After re-auth, open Drafts tab → confirm drafts load automatically without clicking Filter
3. Set end date to today → fetch → confirm drafts created today appear in the list
4. Expand a valid draft → confirm HTML preview renders (no more "Could not decode string" or "Could not load preview")
5. Expand a stale/deleted draft → confirm the row disappears from the list automatically
6. If a content error occurs (non-404), confirm the error message text is visible and the Retry button re-triggers the fetch
7. Switch to Campaign tab and back → confirm results are preserved and no second fetch fires
