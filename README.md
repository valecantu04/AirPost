<div align="center">

# ✈️ AirPost

**Enterprise bulk email merging, built on Google Workspace.**

*Design personalized campaigns in Google Docs. Reach your audience from Google Sheets. Send through Gmail — all without leaving your browser.*

---

![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-V8-4285F4?style=flat-square&logo=google&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![clasp](https://img.shields.io/badge/clasp-deployed-34A853?style=flat-square&logo=google&logoColor=white)
![Access](https://img.shields.io/badge/Access-Domain%20Restricted-orange?style=flat-square)

</div>

---

## 📖 Overview

AirPost is a Google Apps Script web application that turns Google Docs, Sheets, and Gmail into a powerful, zero-infrastructure email campaign engine. It walks you through a guided three-step wizard — from selecting a template to previewing individual emails to sending a personalized batch — all with automatic deduplication so no recipient ever gets the same email twice.

---

## ✨ Features

| Feature | Description |
|---|---|
| **📄 Doc-based Templates** | Use Google Docs as rich-HTML email templates with `{{placeholder}}` merge fields |
| **📊 Sheet-driven Audiences** | Pull recipients from any tab of a Google Sheet, with automatic column validation |
| **👤 Send As / Alias Support** | Send from any verified Gmail alias or delegated account in your Google Workspace |
| **🔁 Deduplication** | Rows with an existing `Timestamp` are automatically skipped — safe to re-run after partial sends |
| **📎 Per-recipient Attachments** | Add a comma-separated `Attachments` column with Google Drive file IDs or URLs to attach unique files per row |
| **📧 CC Support** | Add a `CC` column to the sheet to carbon-copy additional recipients on any email |
| **🖼️ Inline Image Handling** | Base64 images embedded in Docs templates are automatically converted to RFC-compliant CID attachments |
| **✍️ Auto Signature** | Appends the sender alias's Gmail signature to every email |
| **👁️ Live Preview** | Render a personalized preview for any row before sending the full campaign |
| **📜 History Logging** | Every campaign is recorded (user, template, sent/skipped/failed counts) to a central Google Sheet |
| **⚙️ Configurable Folder** | Template folder ID is stored per-user in Properties Service — no code changes needed |

---

## 🗂️ Project Structure

```
AirPost/
├── Code.js           # All server-side Google Apps Script logic
├── Index.html        # Main HTML shell (Templated, served by doGet)
├── script.html       # React UI component (injected into Index.html)
├── styles.html       # CSS design tokens and component styles (injected)
├── appsscript.json   # Apps Script manifest (APIs, runtime, access)
└── .clasp.json       # clasp deployment configuration
```

---

## 🚀 Three-Step Workflow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  1. Campaign    │     │  2. Audience      │     │  3. Preview & Send  │
│     Setup       │────▶│     Selection     │────▶│                     │
│                 │     │                  │     │                     │
│ • Choose alias  │     │ • Paste Sheet URL│     │ • Set subject line  │
│ • Pick template │     │ • Select tab     │     │ • Browse previews   │
│ • Set folder    │     │ • Validate cols  │     │ • Send campaign     │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

**Step 1 — Campaign Setup:** Choose which Gmail alias to send from and select a Google Docs email template from your configured Drive folder.

**Step 2 — Audience Selection:** Paste the URL of your Google Sheet, choose the target tab, and validate that the sheet columns match the template's merge fields.

**Step 3 — Preview & Send:** Set (and optionally personalize) the subject line, preview individual rows, then launch the full send. Results show sent, skipped, and failed counts.

---

## 📋 Google Sheet Format

Your recipient sheet must contain an **`Email`** column. All other columns map directly to `{{placeholder}}` fields in your template.

| `Name` | `Email` | `Role` | `CC` | `Attachments` | `Timestamp` | `Template` |
|---|---|---|---|---|---|---|
| Jane Doe | jane@example.com | Engineer | manager@example.com | `1BxiMV...` | *(auto-filled)* | *(auto-filled)* |
| John Smith | john@example.com | Designer | | | | |

**Reserved / Auto-managed Columns**

| Column | Behavior |
|---|---|
| `Timestamp` | Written by AirPost when the email is sent. Rows with a value here are **skipped** on re-runs. |
| `Template` | Name of the template used, written automatically after send. |
| `Attachments` | Optional. Comma- or semicolon-separated Google Drive file IDs or sharing URLs. |
| `CC` | Optional. A single email address to CC on the outgoing message. |

> **Tip:** `Name` values are automatically formatted to title-case first name (e.g. `JANE DOE` → `Jane`).

---

## 📄 Template Format

Create your template as a **Google Doc** inside your configured template folder. Use double-brace placeholders matching your sheet's column headers exactly:

```
Hi {{Name}},

We're excited to share this update with you, {{Role}}.
...
```

Placeholders also work in the **subject line** field — e.g. `Your invite, {{Name}}!`

---

## 🛠️ Setup & Deployment

### Prerequisites

- A Google Workspace account (domain access is enforced by the manifest)
- [Node.js](https://nodejs.org/) and [clasp](https://github.com/google/clasp) installed

```bash
npm install -g @google/clasp
clasp login
```

### Deploy

```bash
# Clone this repo
git clone <your-repo-url>
cd AirPost

# Push to your Apps Script project
clasp push

# Open the project in the Apps Script editor
clasp open
```

Then in the Apps Script editor, go to **Deploy → New deployment**, choose **Web app**, set:
- **Execute as:** User accessing the web app
- **Who has access:** Anyone in your domain (or your desired scope)

Copy the deployment URL and share it with your team.

---

## ⚙️ Configuration

### Template Folder
The app reads templates from a Google Drive folder. The default folder ID is set in `Code.js`:

```js
const DEFAULT_TEMPLATE_FOLDER_ID = "your-drive-folder-id";
```

Each user can override this from within the app's UI — the custom ID is persisted via `PropertiesService` and is private to that user.

### History Sheet
Campaign history is logged to a central Google Sheet. Set its ID in `Code.js`:

```js
const HISTORY_SHEET_ID = "your-history-spreadsheet-id";
```

The sheet and `Email History` tab are created automatically on first use with these columns:

`Timestamp` · `User Email` · `Template ID` · `Template Used` · `Emails Sent` · `Emails Skipped` · `Failed Emails`

---

## 🔑 Required Google APIs

These advanced services must be enabled in `appsscript.json` (already configured):

| Service | Version | Purpose |
|---|---|---|
| Gmail API | v1 | Send emails, fetch aliases & signatures |
| Google Sheets API | v4 | Read recipient data |
| Google Docs API | v1 | Extract template content |
| Google Drive | *(built-in)* | List templates, fetch attachments |

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Google Apps Script (V8) |
| **UI Framework** | React 18 (UMD, in-browser Babel transpilation) |
| **Styling** | Tailwind CSS (CDN) + custom CSS design tokens |
| **Icons** | Font Awesome 6 |
| **Typography** | Inter (Google Fonts) |
| **Deployment** | clasp (Google Apps Script CLI) |
| **Logging** | Stackdriver (Google Cloud Logging) |

---

## 📄 License

This project is for internal organizational use. All rights reserved.

---

<div align="center">
  Built with ❤️ by <strong>Red Panda Projects</strong>
</div>
