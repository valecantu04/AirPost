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
