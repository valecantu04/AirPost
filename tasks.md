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

---

## valecantu04/email_style_fidelity

**Goal:** Emails must look identical to their preview. Styling must be fully preserved in the sent email, including for Gemini-generated templates. The Gmail signature must appear at the bottom with its original styling intact.

**Root cause:** Three compounding bugs. The signature is appended after `</html>`, which causes email clients to reparse and discard inlined styles. The preview masks this by rendering inside Tailwind's styled div (ambient styles bleed in, making it look correct when it isn't). The `forPreview` quote bug compounds this for Gemini templates that use quoted font names.

### Step 1 — Fix signature insertion (`Code.js`, `sendEmailsWithSheet` line 303)
Change `let emailContent = templateText + userSignature;` to insert the signature inside `</body>` rather than after `</html>`:
```js
let emailContent = userSignature
  ? templateText.replace(/<\/body>/, userSignature + '</body>')
  : templateText;
```
The signature is placed after the template's `</div>` but before `</body>`, so it is **not** inside the `bodyStyles` wrapper div and its own inline styles are unaffected.

### Step 2 — Always normalize CSS `"` → `'` (`Code.js`, `getTemplateContent` line 466)
Remove the `if (!forPreview)` guard so quote normalization runs in both preview and send paths:
```js
rules = rules.replace(/"/g, "'");
```

### Step 3 — Replace `dangerouslySetInnerHTML` with `<iframe srcDoc>` (`script.html`, line 757)
The preview renders into the app's Tailwind-styled div, causing ambient styles to bleed in. Replace with an isolated iframe:
```jsx
<iframe
  srcDoc={previewData?.html || '<p style="color:#94a3b8;text-align:center;margin-top:2.5rem;font-style:italic">Click "Gen Preview" to render template.</p>'}
  sandbox="allow-same-origin"
  style={{ width: '100%', height: '100%', border: 'none', display: 'block', flexGrow: 1 }}
  title="Email Preview"
/>
```
`sandbox="allow-same-origin"` blocks script execution while preserving correct CSS and image rendering. The iframe is a fully isolated context — no Tailwind, no ambient styles — matching what Gmail sees.
