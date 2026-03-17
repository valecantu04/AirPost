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

## Pending

### ⏳ #1 — `getSendAsAliases`: Operator precedence admits unverified aliases
**Description:** The filter `alias.sendAsEmail && alias.isPrimary || alias.isDefault || alias.verificationStatus === 'accepted'` evaluates as `(sendAsEmail && isPrimary) || isDefault || verified` due to JS operator precedence. An alias marked `isDefault` passes through with no email address or verification check.
**Fix:** Add parentheses: `alias.sendAsEmail && (alias.isPrimary || alias.isDefault || alias.verificationStatus === 'accepted')`.

### ⏳ #2 — `getTemplateContent`: CSS quote replacement skipped in preview mode
**Description:** `if (!forPreview)` replaces `"` → `'` in CSS values only during actual sends. In preview mode, CSS values containing `"` (e.g. `font-family: "Inter"`) are injected literally into `style="..."` attributes, producing malformed HTML and broken preview rendering.
**Fix:** Remove the `!forPreview` condition so the replacement always runs.

### ⏳ #3 — `sendEmailsWithSheet`: `fromEmail` not re-validated server-side
**Description:** `fromEmail` arrives from the client and is passed directly to `GmailApp.sendEmail(..., { from: fromEmail })` with no server-side check that it belongs to the executing user's verified aliases.
**Fix:** Re-fetch the user's aliases inside `sendEmailsWithSheet` and confirm `fromEmail` is in the list before proceeding.
