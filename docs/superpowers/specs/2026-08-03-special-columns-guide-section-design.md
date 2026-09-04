# Special Columns — Guide Section Design

**Date:** 2026-08-03
**Branch:** to be determined

## Goal

Add a new "Special Columns" section to the in-app Guide that teaches users how to use each of the six reserved audience sheet columns: `Email`, `Name`, `CC`, `Attachments`, `Timestamp`, and `Template`.

## Success Criteria

- A new `GUIDE_SECTIONS` entry with `id: 'special-columns'` is inserted immediately after the `'audience'` entry.
- The section renders correctly in the Guide modal sidebar and scrollable content area.
- Each column's content answers "What do I put here and what does it do?"
- No changes to existing section content (brief reminders in Campaign and Template Placeholders stay in place).

## Section Definition

```js
{
    id: 'special-columns',
    title: 'Special Columns',
    group: 'features',
    intro: 'Six column names have special meaning in AirPost. They control how emails are addressed, personalized, and tracked — and cannot be used as {{placeholder}} names in templates.',
    steps: [
        {
            text: '<strong>Email</strong> (required) — Enter the recipient\'s email address. Rows with an empty <code>Email</code> cell are skipped entirely — no email is sent for that row.'
        },
        {
            text: '<strong>Name</strong>, <strong>CC</strong>, <strong>Attachments</strong> (optional) — Fill these in per row to personalize and route each email. Leave any cell blank to skip that behavior for that recipient.'
        },
        {
            text: '<strong>Timestamp</strong>, <strong>Template</strong> (auto-managed) — Leave these columns blank before sending. AirPost writes to them automatically after each successful send — a filled <code>Timestamp</code> tells AirPost that row is done.'
        },
    ],
    callouts: [
        {
            variant: 'info',
            text: 'To personalize with the recipient\'s name, add <code>{{Name}}</code> to your Doc body or subject line. AirPost reads the <code>Name</code> column and inserts only the first word, capitalized — "john smith" → "John".'
        },
        {
            variant: 'info',
            text: 'For <strong>CC</strong>, enter a single email address per cell. For <strong>Attachments</strong>, enter one or more Drive file IDs or full Drive URLs, separated by commas or semicolons — the script must have at least view access to each file. Inaccessible files are skipped silently.'
        },
        {
            variant: 'warning',
            text: 'Never edit <strong>Timestamp</strong> or <strong>Template</strong> manually. AirPost uses <code>Timestamp</code> to decide which rows have already been sent — editing it can cause rows to be re-sent or permanently skipped.'
        },
    ],
}
```

## Placement

Insert as the 4th entry in `GUIDE_SECTIONS` (after `'audience'`, before `'drafts'`).

In `script.html`, the `audience` entry closes at line 72 (`},`) and `drafts` begins at line 73. The new object is inserted between those two lines.

```
Campaign → Template Placeholders → Audience Sheet → Special Columns → Drafts → Send History
```

## Out of Scope

- No changes to existing sections.
- No new Guide groups or group labels — `group: 'features'` reuses the existing group.
- No server-side changes.
