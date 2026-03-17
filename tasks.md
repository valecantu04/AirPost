# AirPost — Code Quality Tasks

Tracking logical bugs, security gaps, and performance improvements identified during review of `Code.js`.

---

## Completed

### ✅ #5 — `generateAudienceSheet`: Missing `CC` column
`CC` was absent from the auto-generated audience sheet even though it's a first-class documented feature.
**Fix:** Added `'CC'` to the header array in `generateAudienceSheet`, before `'Attachments'`.

### ✅ #6 — Dead server-side code: `getSubjectLine`, `setSubjectLine`, `cleanup`
These three functions were never called from the client. The subject line is managed entirely in React state and passed directly to `sendEmailsWithSheet`.
**Fix:** Deleted all three functions. Corrected the stale note in `CLAUDE.md`.

---

## Completed (continued)

### ✅ #4 — `generateEmailPreview`: Template re-fetched on every row navigation
`getTemplateContent` (with a 3-retry / 1.5s-sleep loop) was called fresh on every pagination click, even though the template HTML is immutable across rows.
**Fix:** Added `CacheService.getUserCache()` lookup in `generateEmailPreview` keyed by `'preview_' + templateId` with a 600s TTL. If the payload exceeds the 100KB CacheService limit, the `cache.put()` throws silently and the function falls back to a live fetch — no behavior change for oversized templates.

---

## Completed (continued)

### ✅ #1 — `getSendAsAliases`: Operator precedence admits unverified aliases
**Fix:** Added parentheses so `alias.sendAsEmail` is always required: `alias.sendAsEmail && (alias.isPrimary || alias.isDefault || alias.verificationStatus === 'accepted')`.

### ✅ #2 — `getTemplateContent`: CSS quote replacement skipped in preview mode
**Fix:** Removed the `forPreview` parameter entirely from `getTemplateContent`. Quote normalization (`"` → `'`) now always runs. All call sites updated.

### ✅ #3 — `sendEmailsWithSheet`: `fromEmail` not re-validated server-side
**Fix:** Added authoritative alias check at the top of `sendEmailsWithSheet` using `Gmail.Users.Settings.SendAs.list('me')` directly. Throws before any sheet access if `fromEmail` is not in the user's alias list.

---

## valecantu04/email_style_fidelity

**Goal:** Emails must look identical to their preview. Styling must be fully preserved in the sent email, including for Gemini-generated templates. The Gmail signature must appear at the bottom with its original styling intact. All fonts must render consistently across desktop and mobile as native Gmail (Arial).

### ✅ Step 1 — Fix signature insertion (`Code.js`)
`let emailContent = templateText + userSignature` was appending the signature after `</html>`, causing email clients to reparse and discard inlined styles. Fixed with `templateText.replace(/<\/body>/, userSignature + '</body>')`.

### ✅ Step 2 — Remove `forPreview` CSS quote guard (`Code.js`)
Folded into #2 above. `forPreview` parameter removed entirely; quote normalization always runs.

### ✅ Step 3 — Replace `dangerouslySetInnerHTML` with `<iframe srcDoc>` (`script.html`)
Preview rendered inside the app's Tailwind div, causing ambient styles to bleed in. Replaced with `<iframe srcDoc sandbox="allow-same-origin">` for a fully isolated rendering context matching what Gmail sees.

### ✅ Step 4 — Font normalization (`Code.js`)
Added `normalizeFontFamily()` helper that replaces all `font-family` declarations with `Arial, Helvetica, sans-serif`. Applied at all three CSS processing locations in `getTemplateContent` (cssMap entries, bodyStyles, existing inline styles). Gmail signatures are unaffected as they are inserted after `getTemplateContent` returns.

---

## valecantu04/styling_fix_take2 — Frontend UI/UX

### ✅ #10 — Remove dead `.header-powered-by` CSS rule (`styles.html`)
### ✅ #11 — Preview pane chrome: replace `slate-*` Tailwind classes with CSS design token classes (`styles.html`, `script.html`)
### ✅ #12 — Migrate inline `style={{}}` objects to named CSS classes (`styles.html`, `script.html`)

### ✅ #1 — Replace `window.confirm()` with styled modal (`script.html`, `styles.html`)
Both "Dispatch Emails" and "Start Over" used native browser dialogs. Replaced with a reusable `ConfirmModal` component.
**Fix:** Added `.btn-danger` to `styles.html`. Added `modal` state + `openModal`/`closeModal`/`handleModalConfirm` helpers. Extracted `executeSend()` and `executeStartOver()`. Added `ConfirmModal` component before `AirPostApp`; rendered in JSX with `fixed` overlay + `wizard-layout` card.

### ✅ #2 — State invalidation fires on every URL keystroke (`script.html`)
The `useEffect` invalidator was wiping validation state on every character typed, not after debounce resolves.
**Fix:** Removed `sheetUrl` from the invalidator's dependency array. Moved the four `set*` invalidation calls to the top of `handleExtractTabs` so they fire only after the debounce resolves.

### ✅ #3 — `handleExtractTabs` stale closure risk (`script.html`)
**Fix:** Wrapped in `useCallback([sheetUrl])` to prevent stale closure bugs.

### ✅ #4 — `HighlightedSubject` defined inside `AirPostApp` body (remount bug) (`script.html`)
React creates a new component type reference on every parent render, causing unnecessary unmount/remount of the subject line display on every state change.
**Fix:** Moved `HighlightedSubject` to module scope (after `ConfirmModal`), giving it a stable reference identity.

### ✅ #5 — `WORKFLOW_STEPS` constant defined inside `AirPostApp` body (`script.html`)
Static array redeclared on every render, passing a new reference to `Stepper` each time.
**Fix:** Moved to module scope (after `runGas`).

### ✅ #6 — Unguarded `.match()[0]` in three handlers (`script.html`)
`handleValidateSheet`, `fetchPreview`, and `executeSend` all called `sheetUrl.match(...)[0]` directly. A `null` return throws a TypeError that bypasses the `catch` block, permanently locking loading state as `true`.
**Fix:** Added `const sheetIdMatch = sheetUrl.match(...); if (!sheetIdMatch) return addToast(...)` guard in all three handlers before setting loading state.

### ✅ #7 — Dispatch button `disabled` check does not trim whitespace (`script.html`)
`disabled={isSending || !subjectLine}` allows a spaces-only subject to enable the button.
**Fix:** Changed to `disabled={isSending || !subjectLine.trim()}`.

### ✅ #8 — `handleUpdateFolder` missing loading state / double-submit guard (`script.html`)
No button disable or spinner during the async folder update + re-fetch, allowing duplicate submissions.
**Fix:** Added `isUpdatingFolder` state; set in `try/finally`; Update button shows spinner and is disabled while loading.

### ✅ #9 — Keyboard navigation for preview pane (`script.html`)
No way to paginate preview without clicking.
**Fix:** Added `useEffect` that attaches a `keydown` listener on `document` when on step 3 with loaded preview data. ← → arrow keys call `fetchPreview(previewIndex ± 1)` respecting bounds. Listener cleaned up on deps-change/unmount.
