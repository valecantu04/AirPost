// Code.gs

// --- Constants & Global Properties Service Access ---
const DEFAULT_TEMPLATE_FOLDER_ID = "1e07GN69-11mEPu66A_LXJBflHSh7a19w";
// ID for the email history spreadsheet
const HISTORY_SHEET_ID = "1iRLTOkHQ0OdVJCaTVT2RrzGMlkkrcJ4OgEgdHCR02jA";
// Cache user properties service to reduce repeated calls
const userProperties = PropertiesService.getUserProperties();

// Replaces any font-family declaration with the native Gmail default.
// Ensures consistent rendering across all email clients and devices.
function normalizeFontFamily(css) {
  return css.replace(/font-family\s*:[^;]+/gi, 'font-family: Arial, Helvetica, sans-serif');
}

function doGet() {
  const userEmail = Session.getActiveUser().getEmail();
  if (!userEmail) {
    return HtmlService.createHtmlOutput("Unauthorized access. Please log in with a valid Google account.");
  }
  const folderId = getTemplateFolderId();
  const template = HtmlService.createTemplateFromFile('Index');
  template.userEmail = userEmail;
  template.templateFolderId = folderId;
  return template.evaluate().setTitle("AirPost");
}

function getUserEmail() {
  return Session.getActiveUser().getEmail();
}

function getTemplateFolderId() {
  return userProperties.getProperty("templateFolderId") || DEFAULT_TEMPLATE_FOLDER_ID;
}

function setTemplateFolderId(newFolderId) {
  // Regex moved to the client-side for immediate feedback, but kept here for server-side validation.
  if (!/^[a-zA-Z0-9_-]+$/.test(newFolderId)) {
    throw new Error("Invalid folder ID. Please provide a valid Google Drive folder ID.");
  }
  userProperties.setProperty("templateFolderId", newFolderId);
}


function getTemplateFolderName() {
  try {
    // Get folder ID once and cache the folder object if needed for other operations
    const folderId = getTemplateFolderId();
    const templateFolder = DriveApp.getFolderById(folderId);
    return templateFolder.getName();
  } catch (error) {
    Logger.log(`Error retrieving folder name: ${error.message}\nStack: ${error.stack}`);
    return "Error retrieving folder name";
  }
}

function getTemplates() {
  try {
    const templateFolderId = getTemplateFolderId(); // Get ID
    const templateFolder = DriveApp.getFolderById(templateFolderId); // Get folder object once
    const files = templateFolder.getFilesByType(MimeType.GOOGLE_DOCS);
    const templates = [];
    while (files.hasNext()) {
      const file = files.next();
      templates.push({ id: file.getId(), name: file.getName() });
    }
    return templates; // Return empty array if no templates found, as already handled by displayTemplates
  } catch (error) {
    Logger.log(`Error retrieving templates: ${error.message}\nStack: ${error.stack}`);
    return [];
  }
}

function getSheetTabs(sheetId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId); // Open spreadsheet once
    const sheets = spreadsheet.getSheets();
    return sheets.map(sheet => sheet.getName());
  } catch (error) {
    Logger.log(`Error retrieving sheet tabs: ${error.message}`);
    return [];
  }
}

function validateSheetColumns(sheetId, templateId, tabName) {
  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId); // Open spreadsheet once
    const sheet = spreadsheet.getSheetByName(tabName);
    if (!sheet) throw new Error(`Sheet tab '${tabName}' not found.`);

    const headers = sheet.getDataRange().getValues()[0];
    const templateKeywords = extractKeywordsFromTemplate(templateId);

    const missingKeywords = templateKeywords.filter(keyword => !headers.includes(keyword));

    return {
      valid: missingKeywords.length === 0,
      missingKeywords,
      sheetHeaders: headers,
      templateHeaders: templateKeywords,
      message: missingKeywords.length === 0
        ? "Sheet is valid. You can now send emails."
        : `Missing required columns: ${missingKeywords.join(", ")}. Ensure these fields exist in the Google Sheet.`
    };
  } catch (error) {
    Logger.log(`Error validating sheet columns: ${error.message}\nStack: ${error.stack}`);
    return { valid: false, missingKeywords: [], message: "Error validating sheet. Please check the sheet ID and try again." };
  }
}

function getSheetData(sheetId, tabName) {
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(tabName);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => Object.fromEntries(row.map((value, index) => [headers[index], value])));
}

function getSendAsAliases() {
  try {
    const userId = 'me'; // 'me' refers to the authenticated user running the script
    const sendAsAliases = Gmail.Users.Settings.SendAs.list(userId).sendAs;
    Logger.log(sendAsAliases)
    // Filter out disabled or non-existent aliases if desired, though Gmail API usually returns valid ones.
    const activeAliases = sendAsAliases
        .filter(alias => alias.sendAsEmail && alias.isPrimary || alias.isDefault || alias.verificationStatus === 'accepted')
        .map(alias => ({
            email: alias.sendAsEmail,
            displayName: alias.displayName || alias.sendAsEmail,
            isPrimary: alias.isPrimary
        }));

    // Sort to put the primary email first, or ensure a consistent order
    activeAliases.sort((a, b) => {
        if (a.isPrimary) return -1;
        if (b.isPrimary) return 1;
        return a.email.localeCompare(b.email);
    });

    return activeAliases;
  } catch (error) {
    Logger.log(`Error retrieving send-as aliases: ${error.message}\nStack: ${error.stack}`);
    return [];
  }
}

function extractInlineImages(htmlContent) {
  let inlineImages = {};
  let cidIndex = 0;
  
  // Regex to find base64 image sources. Captures the full src attribute, mime type, and data.
  const regex = /src="(data:(image\/[^;]+);base64,([^"]+))"/g;
  
  let modifiedHtml = htmlContent.replace(regex, function(fullMatch, fullDataUri, mimeType, base64Data) {
    let cid = "img_" + cidIndex++;
    try {
      // Convert the massive text string back into a binary file (Blob)
      let blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, cid);
      inlineImages[cid] = blob;
      // Replace the massive text in the HTML with a lightweight Content-ID reference
      return `src="cid:${cid}"`;
    } catch(e) {
      Logger.log("Failed decoding base64 image: " + e.message);
      return fullMatch; // Fallback to original if it fails
    }
  });
  
  return {
    html: modifiedHtml,
    images: inlineImages
  };
}

// --- NEW FEATURE: AUTO-GENERATE AUDIENCE SHEET ---
function generateAudienceSheet(templateId, folderId) {
  try {
    // 1. Extract required keywords from the template
    const templateKeywords = extractKeywordsFromTemplate(templateId);
    
    // 2. Build the header array. Always start with Email and Name.
    let headers = ['Email', 'Name'];
    
    // Add all custom template variables that aren't already included
    templateKeywords.forEach(keyword => {
      if (!headers.includes(keyword)) headers.push(keyword);
    });
    
    // Add system tracking columns to the end
    headers.push('CC', 'Attachments', 'Timestamp', 'Template');
    
    // 3. Extract and format the user's name from their email address
    const userEmail = Session.getActiveUser().getEmail();
    // Turns "first.last@company.com" into "First Last"
    const userName = userEmail.split('@')[0]
      .split(/[.\-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');

    // 4. Create the new Spreadsheet with the User Name Prefix
    const templateName = DriveApp.getFileById(templateId).getName();
    const sheetName = `${userName} - Audience Data: ${templateName}`;
    const newSheet = SpreadsheetApp.create(sheetName);
    const sheet = newSheet.getActiveSheet();
    
    // 5. Inject headers into Row 1
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // 6. Apply premium formatting
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f3f4f6");
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 120);

    
    // 7. Move the new sheet to the designated AirPost Drive folder
    if (folderId) {
      const file = DriveApp.getFileById(newSheet.getId());
      const folder = DriveApp.getFolderById(folderId);
      file.moveTo(folder);
    }
    
    return newSheet.getUrl();
  } catch (error) {
    Logger.log(`Error generating sheet: ${error.message}\nStack: ${error.stack}`);
    throw new Error("Failed to auto-generate Google Sheet.");
  }
}

function sendEmailsWithSheet(sheetId, templateId, subject, tabName, fromEmail, fromName){
  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId); // Open spreadsheet once
    const sheet = spreadsheet.getSheetByName(tabName);
    if (!sheet) throw new Error(`Sheet tab '${tabName}' not found.`);

    let dataRange = sheet.getDataRange();
    let allData = dataRange.getValues();
    let headers = allData.shift(); // Remove headers from data array

    // Identify or create 'Timestamp', 'Template', and 'Attachment IDs' columns
    let timestampColumnIndex = headers.indexOf("Timestamp");
    let templateNameColumnIndex = headers.indexOf("Template");
    let attachmentIdsColumnIndex = headers.indexOf("Attachments"); // NEW: Attachment column index

    let headerUpdated = false;

    if (timestampColumnIndex === -1) {
      timestampColumnIndex = headers.length;
      headers.push("Timestamp");
      headerUpdated = true;
    }
    if (templateNameColumnIndex === -1) {
      templateNameColumnIndex = headers.length;
      headers.push("Template");
      headerUpdated = true;
    }
    // NEW: Add "Attachments" header if it doesn't exist
    if (attachmentIdsColumnIndex === -1) {
      attachmentIdsColumnIndex = headers.length;
      headers.push("Attachments");
      headerUpdated = true;
    }

    // If headers were modified, write them back to the sheet
    if (headerUpdated) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      allData = sheet.getDataRange().getValues(); // Re-fetch all data to get updated structure
      headers = allData.shift(); // Re-extract headers
    }


    const templateText = getTemplateContent(templateId);
    const userSignature = getGmailSignature(fromEmail);
    const userEmail = Session.getActiveUser().getEmail();

    let emailsSent = 0;
    let emailsSkipped = 0;
    let failedEmails = [];

    const timestampUpdates = allData.map(row => row[timestampColumnIndex] || null);
    const templateUpdates = allData.map(row => row[templateNameColumnIndex] || null);

    const templateName = DriveApp.getFileById(templateId).getName();

    allData.forEach((row, rowIndex) => {
      let recipient = {};
      headers.forEach((header, index) => {
        recipient[header] = row[index];
      });

      // --- Skip completely empty rows or missing emails ---
      if (!recipient["Email"] || recipient["Email"].toString().trim() === "") {
        return; 
      }

      // Check if already processed (has a timestamp)
      if (row[timestampColumnIndex]) {
        emailsSkipped++;
        return;
      }

      if (recipient['Name']) {
        recipient['Name'] = formatName(recipient['Name']);
      }

      let emailContent = userSignature
        ? templateText.replace(/<\/body>/, userSignature + '</body>')
        : templateText;
      let personalizedSubject = subject;

      Object.keys(recipient).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        emailContent = emailContent.replace(regex, recipient[key] || '');
        personalizedSubject = personalizedSubject.replace(regex, recipient[key] || '');
      });
      // --- NEW ATTACHMENT LOGIC ---
      let attachments = [];
      const attachmentIdsString = recipient["Attachments"]; // Get value from "Attachments" column

      if (attachmentIdsString) {
        // Split by comma or semicolon, trim whitespace for each ID
        const attachmentIdArray = attachmentIdsString.split(/[,;]/).map(id => id.trim()).filter(id => id);

        attachmentIdArray.forEach(id => {
          try {
            const file = DriveApp.getFileById(extractId(id));
            attachments.push(file.getBlob());
            Logger.log(`Added attachment: ${file.getName()} (ID: ${id})`);
          } catch (attachmentError) {
            Logger.log(`Warning: Could not add attachment (ID: ${id}) for email to ${recipient["Email"] || 'unknown'}. Error: ${attachmentError.message}`);
          }
        });
      }
      // --- END NEW ATTACHMENT LOGIC ---
      const processedEmail = extractInlineImages(emailContent);
      
      try {
        const mailOptions = {
          cc: recipient["CC"] || "",
          htmlBody: processedEmail.html,
          attachments: attachments,
          inlineImages: processedEmail.images,
          from: fromEmail, 
          name: fromName
        };

        const plainTextFallback = "Please view this email in an HTML-compatible client.";

        // Send the email using the lightweight fallback and the robust mailOptions
        GmailApp.sendEmail(recipient["Email"], personalizedSubject, plainTextFallback, mailOptions);

        timestampUpdates[rowIndex] = new Date();
        templateUpdates[rowIndex] = templateName;
        emailsSent++;
      } catch (error) {
        failedEmails.push({ email: recipient["Email"], error: error.message });
      }
    });

    if (allData.length > 0) {
      const timestampRange = sheet.getRange(2, timestampColumnIndex + 1, timestampUpdates.length, 1);
      timestampRange.setValues(timestampUpdates.map(val => [val]));

      const templateNameRange = sheet.getRange(2, templateNameColumnIndex + 1, templateUpdates.length, 1);
      templateNameRange.setValues(templateUpdates.map(val => [val]));
    }

    logEmailHistory(userEmail, templateId, emailsSent, emailsSkipped, failedEmails);

    return {
      success: true,
      message: `${emailsSent} emails sent successfully.`,
      details: {
        sent: emailsSent,
        skipped: emailsSkipped,
        failed: failedEmails
      }
    };

  } catch (error) {
    Logger.log(`Error sending emails: ${error.message}\nStack: ${error.stack}`);
    return { success: false, message: "Error sending emails. Please check logs.", details: {} };
  }
}

function logEmailHistory(userEmail, templateId, emailsSent, emailsSkipped, failedEmails) {
  // Use HISTORY_SHEET_ID constant
  const ss = SpreadsheetApp.openById(HISTORY_SHEET_ID);
  let historySheet = ss.getSheetByName("Email History");

  if (!historySheet) {
    historySheet = ss.insertSheet("Email History");
    historySheet.appendRow(["Timestamp", "User Email", "Template ID", "Template Used", "Emails Sent", "Emails Skipped", "Failed Emails"]);
  }

  // Get template name once
  // Important: templateId here is a file ID, not a folder ID, so use getFileById
  let templateName;
  try {
    templateName = DriveApp.getFileById(templateId).getName();
  } catch (e) {
    Logger.log(`Could not get template name for ID ${templateId}: ${e.message}`);
    templateName = "Unknown Template (ID: " + templateId + ")";
  }

  const failedEmailsText = failedEmails.length > 0
    ? failedEmails.map(entry => `${entry.email} - ${entry.error}`).join("\n")
    : "None";

  historySheet.appendRow([
    new Date(),
    userEmail,
    templateId,
    templateName,
    emailsSent,
    emailsSkipped,
    failedEmailsText
  ]);
}

function extractKeywordsFromTemplate(templateId) {
  const templateText = getTemplateContent(templateId);
  return [...new Set([...templateText.matchAll(/{{(.*?)}}/g)].map(match => match[1]))];
}

function getTemplateContent(templateId) {
  try {
    const url = `https://docs.google.com/feeds/download/documents/export/Export?id=${templateId}&exportFormat=html`;
    const param = {
      method: 'get',
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      muteHttpExceptions: true,
    };

    // --- Smart Retry Logic & Error Handling ---
    let response;
    let retries = 3;
    let success = false;
    
    while (retries > 0) {
      response = UrlFetchApp.fetch(url, param);
      
      // Check if Google returned our document successfully (HTTP 200)
      if (response.getResponseCode() === 200) {
        success = true;
        break; 
      }
      
      // If it failed, wait 1.5 seconds and try again (Google APIs often recover quickly)
      retries--;
      Utilities.sleep(1500); 
    }
    
    // If we failed all 3 attempts, abort the entire process so we don't send an error page
    if (!success) {
      throw new Error(`Google Docs API is temporarily unavailable (Error ${response.getResponseCode()}). Please wait a few minutes and try again.`);
    }

    let html = response.getContentText();

    // 1. Extract the <style> block from the <head>
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const cssContent = styleMatch ? styleMatch[1] : '';

    // 2. Parse CSS classes into a dictionary map
    const cssMap = {};
    const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
    let match;
    while ((match = ruleRegex.exec(cssContent)) !== null) {
      let rules = match[2].trim().replace(/\s+/g, ' '); 
      rules = rules.replace(/"/g, "'");
      rules = normalizeFontFamily(rules);


      // NATIVE REFINEMENT 1: Strip hardcoded white/transparent backgrounds. 
      // This allows the email to seamlessly adapt to the recipient's Dark Mode.
      // (Note: It leaves custom highlight colors intact!)
      rules = rules.replace(/background-color:\s*(?:#ffffff|rgb\(255,\s*255,\s*255\)|transparent)[^;]*;?/gi, '');
      
      cssMap[match[1]] = rules;
    }

    // 3. Extract global body styles
    const bodyRuleMatch = cssContent.match(/body\s*\{([^}]+)\}/i);
    let bodyStyles = bodyRuleMatch ? bodyRuleMatch[1].trim() : "font-family: Arial, sans-serif; font-size: 11pt;";
    
    // NATIVE REFINEMENT 2: Strip Google's massive 72pt (1-inch) page margins and hardcoded widths.
    // This allows the text to flow naturally to the edges of the email app.
    bodyStyles = bodyStyles.replace(/padding:[^;]+;?/gi, '')
                           .replace(/max-width:[^;]+;?/gi, '')
                           .replace(/background-color:\s*(?:#ffffff|rgb\(255,\s*255,\s*255\)|transparent)[^;]*;?/gi, '');
    bodyStyles = normalizeFontFamily(bodyStyles);

    // 4. Extract just the <body> content
    const bodyHtmlMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyHtml = bodyHtmlMatch ? bodyHtmlMatch[1] : html;

    // --- GRACEFUL EMPTY PARAGRAPH HANDLING ---
    // Convert empty paragraphs (or paragraphs containing only spaces/spans/brs) into standard HTML line breaks.
    // This perfectly preserves the user's intended visual break without compounding the 12pt paragraph margins.
    bodyHtml = bodyHtml.replace(/<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>|<\/?span[^>]*>)*<\/p>/gi, '');

    // --- DOCUMENT TABS ARTIFACT REMOVAL ---
    // When a Google Doc uses the Document Tabs feature, the export API inserts
    // each tab's title as a heading element in the HTML. These are structural
    // artifacts, not template content — strip the first element (heading or
    // paragraph) whose full text matches a tab title.
    //
    // Note: Docs.Documents.get() does not populate doc.tabs unless
    // includeTabsContent=true is passed. We call the REST API directly with a
    // field mask so we get only tab titles without fetching full body content.
    try {
      const docsApiUrl = `https://docs.googleapis.com/v1/documents/${templateId}?fields=tabs(tabProperties%2Ftitle)&includeTabsContent=true`;
      const docsApiResponse = UrlFetchApp.fetch(docsApiUrl, {
        headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
        muteHttpExceptions: true,
      });
      if (docsApiResponse.getResponseCode() === 200) {
        const doc = JSON.parse(docsApiResponse.getContentText());
        if (doc.tabs && doc.tabs.length > 0) {
          const tabTitles = doc.tabs
            .map(t => t.tabProperties && t.tabProperties.title)
            .filter(Boolean);
          // Strip the first occurrence of any block element (h1-h6 or p) whose
          // full text content exactly equals a tab title. Using "first only" to
          // avoid accidentally removing legitimate content elsewhere in the template.
          tabTitles.forEach(title => {
            let found = false;
            bodyHtml = bodyHtml.replace(/<(h[1-6]|p)[^>]*>[\s\S]*?<\/(h[1-6]|p)>/gi, fullMatch => {
              if (found) return fullMatch;
              const text = fullMatch.replace(/<[^>]*>/g, '').trim();
              if (text === title) { found = true; return ''; }
              return fullMatch;
            });
          });
        }
      }
    } catch (e) {
      // Fail-open: if the Docs API call fails, proceed with unmodified HTML.
    }

    // 5. Process EVERY tag to handle classes AND restore native email formatting
    let inlinedHtml = bodyHtml.replace(/<([a-zA-Z0-9]+)([^>]*)>/gi, function(fullMatch, tag, attributes) { 
      const lowerTag = tag.toLowerCase();
      
      let baseResets = "";
      let googleClassStyles = "";
      let forcedOverrides = "";

      // --- LAYER 1: Base Email Resets (Sourced from Native Gmail Output) ---
      if (lowerTag === 'table') {
        baseResets = "border-collapse: collapse; border-spacing: 0; ";
      } else if (lowerTag === 'td' || lowerTag === 'th') {
        baseResets = "padding: 0; vertical-align: top; "; 
      } else if (lowerTag === 'img') {
        baseResets = "display: block; max-width: 100%; height: auto; border: 0; text-decoration: none; ";
      } else if (lowerTag === 'a') {
        baseResets = "text-decoration: underline; color: #1155cc; "; 
        
        // --- NEW: URL SANITIZER ---
        // Strip Google Docs redirect wrappers to preserve UTMs and avoid spam filters
        const hrefMatch = attributes.match(/href="([^"]+)"/i);
        if (hrefMatch) {
          const rawHref = hrefMatch[1];
          if (rawHref.includes('google.com/url?q=')) {
            const qMatch = rawHref.match(/[?&]q=([^&]+)/);
            if (qMatch) {
              // Extract the true URL and decode the UTM parameters
              const cleanUrl = decodeURIComponent(qMatch[1]);
              // Replace the dirty redirect link with the clean URL
              attributes = attributes.replace(`href="${rawHref}"`, `href="${cleanUrl}"`);
            }
          }
        }
      } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(lowerTag)) {
        // FIX 1: Explicitly added padding: 0 to override any client/Google defaults
        baseResets = "margin: 14pt 0 4pt 0; padding: 0; line-height: 1.38; ";
      } else if (lowerTag === 'p') {
        // FIX 1: Explicitly added padding: 0 to override any client/Google defaults
        baseResets = "margin: 12pt 0 12pt 0; padding: 0; line-height: 1.38; "; 
      } else if (lowerTag === 'span') {
        baseResets = "white-space: pre-wrap; vertical-align: baseline; ";
      }

      // --- LAYER 2: Google Docs User Styles ---
      const classMatch = attributes.match(/class="([^"]+)"/i);
      if (classMatch) {
        const classes = classMatch[1].split(/\s+/);
        classes.forEach(cls => {
          if (cssMap[cls]) {
            let styleRules = cssMap[cls];
            if (!styleRules.endsWith(';')) styleRules += ';';
            googleClassStyles += styleRules;
          }
        });
      }

      // --- LAYER 3: Forced Overrides (Fixing Google Docs Quirks) ---
      if (lowerTag === 'ul') {
        forcedOverrides = "margin: 0 !important; padding: 0 0 0 40px !important; list-style-type: disc !important; ";
      } else if (lowerTag === 'ol') {
        forcedOverrides = "margin: 0 !important; padding: 0 0 0 40px !important; list-style-type: decimal !important; ";
      } else if (lowerTag === 'li') {
        forcedOverrides = "margin-left: 0 !important; padding-left: 0 !important; margin-bottom: 0 !important; list-style-position: outside !important; display: list-item !important; ";
      }

      // --- NEW: THE SANITIZER ENGINE ---
      // 1. Line-Height Sanitizer
      if (lowerTag === 'span') {
        googleClassStyles = googleClassStyles.replace(/line-height:[^;]+;?/gi, '');
      } else {
        googleClassStyles = googleClassStyles.replace(/line-height:\s*1(?:\.0*)?[^;]*;?/gi, '');
      }

      // 2. Vertical Padding Sanitizer
      // Strip Google's rigid top/bottom padding from text blocks so our native margins control the rhythm
      if (['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(lowerTag)) {
        const paddingRegex = /\b(?:padding|padding-top|padding-bottom)\s*:[^;]+;?/gi;
        googleClassStyles = googleClassStyles.replace(paddingRegex, '');
      }

      // Combine layers in strict hierarchy
      let finalCombinedStyles = (baseResets + googleClassStyles + forcedOverrides).trim();

      if (!finalCombinedStyles) {
        return classMatch ? fullMatch.replace(/\s+class="[^"]+"/i, '') : fullMatch;
      }

      // Check for existing inline styles and merge them
      const styleAttrRegex = /style="([^"]*)"/i;
      const existingStyleMatch = attributes.match(styleAttrRegex);
      let newAttributes = attributes;

      if (existingStyleMatch) {
        let existingStyles = existingStyleMatch[1];
        
        // NATIVE DARK MODE OPTIMIZATION
        existingStyles = existingStyles.replace(/background-color:\s*(?:#ffffff|rgb\(255,\s*255,\s*255\)|transparent)[^;]*;?/gi, '');
        existingStyles = existingStyles.replace(/color:\s*(?:#000000|#000|rgb\(0,\s*0,\s*0\))[^;]*;?/gi, '');
        
        // Apply Sanitizers to existing inline styles as well
        if (lowerTag === 'span') {
          existingStyles = existingStyles.replace(/line-height:[^;]+;?/gi, '');
        } else {
          existingStyles = existingStyles.replace(/line-height:\s*1(?:\.0*)?[^;]*;?/gi, '');
        }

        if (['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(lowerTag)) {
          const paddingRegex = /\b(?:padding|padding-top|padding-bottom)\s*:[^;]+;?/gi;
          existingStyles = existingStyles.replace(paddingRegex, '');
        }

        existingStyles = normalizeFontFamily(existingStyles);

        if (!existingStyles.endsWith(';')) existingStyles += ';';
        
        newAttributes = attributes.replace(styleAttrRegex, `style="${existingStyles} ${finalCombinedStyles}"`);
      } else {
        newAttributes = `${attributes} style="${finalCombinedStyles}"`;
      }

      if (classMatch) {
        newAttributes = newAttributes.replace(/\s+class="[^"]+"/i, '');
      }

      return `<${tag}${newAttributes}>`;
    });

    // Wrap in a clean div with a standard color reset to ensure it looks native everywhere
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
  </head>
  <body style="margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: transparent;">
    <div style="${bodyStyles.replace(/"/g, "'")} color: inherit; word-wrap: break-word; -webkit-font-smoothing: antialiased;">
      ${inlinedHtml.trim()}
    </div>
  </body>
</html>`;  } catch (error) {
    Logger.log(`Error retrieving template content: ${error.message}\nStack: ${error.stack}`);
    return "";
  }
}

function formatName(name) {
  return name ? name.split(' ')[0].charAt(0).toUpperCase() + name.split(' ')[0].slice(1).toLowerCase() : '';
}

function getGmailSignature(fromEmail) {
  try {
    const userId = 'me';
    const sendAs = Gmail.Users.Settings.SendAs.list(userId).sendAs;
    const alias = sendAs.find(entry => entry.sendAsEmail === fromEmail);
    return alias ? alias.signature || '' : '';
  } catch (error) {
    Logger.log(`Error retrieving Gmail signature: ${error.message}\nStack: ${error.stack}`);
    return '';
  }
}

function generateEmailPreview(sheetId, templateId, tabName, rowIndex = 0) {
  try {
    const cache = CacheService.getUserCache();
    const cacheKey = 'preview_' + templateId;
    let templateText = cache.get(cacheKey);
    if (!templateText) {
      templateText = getTemplateContent(templateId);
      try { cache.put(cacheKey, templateText, 600); } catch (e) { /* payload too large to cache, fetch live each time */ }
    }
    const recipientData = getSheetData(sheetId, tabName);
    
    const totalRows = recipientData.length;
    if (totalRows === 0) {
        throw new Error("No data found in the sheet for preview.");
    }

    // Ensure the index doesn't go out of bounds
    const safeIndex = Math.max(0, Math.min(rowIndex, totalRows - 1));
    const recipient = recipientData[safeIndex];

    if (recipient['Name']) {
      recipient['Name'] = formatName(recipient['Name']);
    }
    
    Object.keys(recipient).forEach(key => {
      templateText = templateText.replace(new RegExp(`{{${key}}}`, 'g'), recipient[key] || '');
    });
    
    return {
      html: templateText,
      totalRows: totalRows,
      toEmail: recipient['Email'] || 'Unknown',
      currentRow: safeIndex + 1
    };
    
  } catch (error) {
    Logger.log(`Error generating email preview: ${error.message}\nStack: ${error.stack}`);
    throw new Error("Error generating preview.");
  }
}


function extractId(link) {
    let match = link.match(/[-\w]{25,}/);
    return match ? match[0] : null;
}

function getTotalSentEmailCount() {
  try {
    const ss = SpreadsheetApp.openById(HISTORY_SHEET_ID); // Use the defined HISTORY_SHEET_ID
    const historySheet = ss.getSheetByName("Email History");

    if (!historySheet) {
      // If the history sheet doesn't exist yet, no emails have been recorded.
      return 0;
    }

    const data = historySheet.getDataRange().getValues();
    if (data.length <= 1) { // Only headers or no data
      return 0;
    }

    const headers = data[0];
    const emailsSentColumnIndex = headers.indexOf("Emails Sent");

    if (emailsSentColumnIndex === -1) {
      Logger.log("Error: 'Emails Sent' column not found in Email History sheet.");
      return 0;
    }

    let totalSent = 0;
    // Start from 1 to skip headers row
    for (let i = 1; i < data.length; i++) {
      const sentCount = parseInt(data[i][emailsSentColumnIndex], 10);
      if (!isNaN(sentCount)) { // Ensure it's a valid number
        totalSent += sentCount;
      }
    }
    return totalSent;
  } catch (error) {
    Logger.log(`Error retrieving total sent email count: ${error.message}\nStack: ${error.stack}`);
    return 0; // Return 0 on error
  }
}

function getDrafts(afterDate, beforeDate) {
  try {
    // Gmail search query uses YYYY/MM/DD format
    const afterQuery = afterDate.replace(/-/g, '/');
    const beforeQuery = beforeDate.replace(/-/g, '/');
    const query = `after:${afterQuery} before:${beforeQuery}`;

    const listResult = Gmail.Users.Drafts.list('me', { q: query, maxResults: 50 });
    const draftItems = listResult.drafts || [];

    return draftItems.map(item => {
      try {
        const draft = Gmail.Users.Drafts.get('me', item.id, { format: 'metadata' });
        const headers = draft.message.payload.headers;
        const getHeader = (name) =>
          (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';

        return {
          id: item.id,
          subject: getHeader('Subject') || '(no subject)',
          to: getHeader('To'),
          cc: getHeader('Cc'),
          from: getHeader('From'),
          createdAt: new Date(parseInt(draft.message.internalDate)).toISOString()
        };
      } catch (e) {
        Logger.log(`Could not fetch draft metadata for ${item.id}: ${e.message}`);
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    Logger.log(`Error fetching drafts: ${error.message}\nStack: ${error.stack}`);
    throw new Error('Failed to load drafts. Please try again.');
  }
}

function getDraftContent(draftId) {
  try {
    const draft = Gmail.Users.Drafts.get('me', draftId, { format: 'full' });
    const payload = draft.message.payload;

    function findPart(part, mimeType) {
      if (!part) return null;
      if (part.mimeType === mimeType && part.body && part.body.data) {
        return part.body.data;
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          const found = findPart(subPart, mimeType);
          if (found) return found;
        }
      }
      return null;
    }

    const htmlData = findPart(payload, 'text/html');
    if (htmlData) {
      return Utilities.newBlob(Utilities.base64DecodeWebSafe(htmlData)).getDataAsString();
    }

    const plainData = findPart(payload, 'text/plain');
    if (plainData) {
      const text = Utilities.newBlob(Utilities.base64DecodeWebSafe(plainData)).getDataAsString();
      return '<pre style="font-family:inherit;white-space:pre-wrap;word-break:break-word;padding:12px">' + text + '</pre>';
    }

    return '<p style="color:#94a3b8;font-style:italic;padding:12px">(No readable content found)</p>';
  } catch (error) {
    Logger.log(`Error fetching draft content for ${draftId}: ${error.message}\nStack: ${error.stack}`);
    throw new Error('Could not load draft preview.');
  }
}

function sendDrafts(draftIds) {
  const userEmail = Session.getActiveUser().getEmail();
  const results = [];

  draftIds.forEach(function(draftId) {
    var subject = '(unknown)';
    var to = '';

    // Fetch metadata first so we can report it even after the draft is deleted
    try {
      var meta = Gmail.Users.Drafts.get('me', draftId, { format: 'metadata' });
      var headers = meta.message.payload.headers;
      subject = (headers.find(function(h) { return h.name.toLowerCase() === 'subject'; }) || {}).value || '(no subject)';
      to = (headers.find(function(h) { return h.name.toLowerCase() === 'to'; }) || {}).value || '';
    } catch (metaErr) {
      Logger.log('Could not fetch metadata for draft ' + draftId + ': ' + metaErr.message);
    }

    try {
      Gmail.Users.Drafts.send({ id: draftId }, 'me');
      results.push({ draftId: draftId, subject: subject, to: to, success: true, error: null });
    } catch (sendErr) {
      Logger.log('Failed to send draft ' + draftId + ': ' + sendErr.message);
      results.push({ draftId: draftId, subject: subject, to: to, success: false, error: sendErr.message });
    }
  });

  logDraftHistory(userEmail, results);
  return results;
}

function logDraftHistory(userEmail, results) {
  var ss = SpreadsheetApp.openById(HISTORY_SHEET_ID);
  var historySheet = ss.getSheetByName('Email History');

  if (!historySheet) {
    historySheet = ss.insertSheet('Email History');
    historySheet.appendRow(['Timestamp', 'User Email', 'Template ID', 'Template Used', 'Emails Sent', 'Emails Skipped', 'Failed Emails']);
  }

  var sent = results.filter(function(r) { return r.success; });
  var failed = results.filter(function(r) { return !r.success; });
  var templateUsed = sent.length > 0 ? sent.map(function(r) { return r.subject; }).join(', ') : '(none sent)';
  var failedText = failed.length > 0
    ? failed.map(function(r) { return r.to + ' - ' + r.error; }).join('\n')
    : 'None';

  historySheet.appendRow([
    new Date(),
    userEmail,
    'DRAFT',
    templateUsed,
    sent.length,
    0,
    failedText
  ]);
}
