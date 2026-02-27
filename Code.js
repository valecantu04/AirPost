// Code.gs

// --- Constants & Global Properties Service Access ---
const DEFAULT_TEMPLATE_FOLDER_ID = "1e07GN69-11mEPu66A_LXJBflHSh7a19w";
// ID for the email history spreadsheet
const HISTORY_SHEET_ID = "1iRLTOkHQ0OdVJCaTVT2RrzGMlkkrcJ4OgEgdHCR02jA";
// Cache user properties service to reduce repeated calls
const userProperties = PropertiesService.getUserProperties();

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

function getSubjectLine() {
  return userProperties.getProperty("subjectLine") || '';
}

function setSubjectLine(subjectLine) {
  if (!subjectLine) {
    throw new Error("Invalid subject line. Please provide subject for the email.");
  }
  userProperties.setProperty("subjectLine", subjectLine);
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
    headers.push('Attachments', 'Timestamp', 'Template');
    
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

      let emailContent = templateText + userSignature;
      let personalizedSubject = subject;

      Object.keys(recipient).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        emailContent = emailContent.replace(regex, recipient[key] || '');
        personalizedSubject = personalizedSubject.replace(regex, recipient[key] || '');
      });
      emailContent = emailContent.replace(/<img/g, '<img style="max-width: 100%; height: auto;"');
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
    let html = UrlFetchApp.fetch(url, param).getContentText();

    // 1. Extract the <style> block from the <head>
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const cssContent = styleMatch ? styleMatch[1] : '';

    // 2. Parse CSS classes into a dictionary map
    const cssMap = {};
    const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
    let match;
    while ((match = ruleRegex.exec(cssContent)) !== null) {
      let rules = match[2].trim().replace(/\s+/g, ' '); 
      
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

    // 4. Extract just the <body> content
    const bodyHtmlMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyHtml = bodyHtmlMatch ? bodyHtmlMatch[1] : html;

    // 5. Process EVERY tag to handle classes AND restore native email formatting
    let inlinedHtml = bodyHtml.replace(/<([a-zA-Z0-9]+)([^>]*)>/gi, function(fullMatch, tag, attributes) {
      const lowerTag = tag.toLowerCase();
      
      const classMatch = attributes.match(/class="([^"]+)"/i);
      let combinedStyles = "";
      
      if (classMatch) {
        const classes = classMatch[1].split(/\s+/);
        classes.forEach(cls => {
          if (cssMap[cls]) {
            let styleRules = cssMap[cls];
            if (!styleRules.endsWith(';')) styleRules += ';';
            combinedStyles += styleRules;
          }
        });
      }

      // --- NATIVE EMAIL REFINEMENT 3: Element Overrides ---
      if (lowerTag === 'ul') {
        combinedStyles += " margin: 0 0 16px 40px !important; padding: 0 !important; list-style-type: disc !important; ";
      } else if (lowerTag === 'ol') {
        combinedStyles += " margin: 0 0 16px 40px !important; padding: 0 !important; list-style-type: decimal !important; ";
      } else if (lowerTag === 'li') {
        combinedStyles += " margin-bottom: 5px !important; list-style-position: outside !important; display: list-item !important; ";
      } else if (lowerTag === 'p') {
        // Force paragraphs to have standard web spacing rather than rigid Google line heights
        combinedStyles += " margin-top: 0 !important; margin-bottom: 1em !important; line-height: 1.5 !important; ";
      } else if (lowerTag === 'table') {
        // Ensure tables don't break the layout on mobile phones
        combinedStyles += " width: 100% !important; max-width: 600px !important; border-collapse: collapse !important; ";
      }

      // If no styles to add, just strip the class
      if (!combinedStyles) {
        return classMatch ? fullMatch.replace(/\s+class="[^"]+"/i, '') : fullMatch;
      }

      const styleAttrRegex = /style="([^"]*)"/i;
      const existingStyleMatch = attributes.match(styleAttrRegex);

      let newAttributes = attributes;
      if (existingStyleMatch) {
        let existingStyles = existingStyleMatch[1];
        // Clean existing inline styles of blinding white backgrounds
        existingStyles = existingStyles.replace(/background-color:\s*(?:#ffffff|rgb\(255,\s*255,\s*255\)|transparent)[^;]*;?/gi, '');
        if (!existingStyles.endsWith(';')) existingStyles += ';';
        newAttributes = attributes.replace(styleAttrRegex, `style="${existingStyles} ${combinedStyles}"`);
      } else {
        newAttributes = `${attributes} style="${combinedStyles}"`;
      }

      if (classMatch) {
        newAttributes = newAttributes.replace(/\s+class="[^"]+"/i, '');
      }

      return `<${tag}${newAttributes}>`;
    });

    // Wrap in a clean div with a standard color reset to ensure it looks native everywhere
    return `<div style="${bodyStyles} color: inherit; word-wrap: break-word; -webkit-font-smoothing: antialiased;">${inlinedHtml.trim()}</div>`;

  } catch (error) {
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
    let templateText = getTemplateContent(templateId);
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

function cleanup() {
  try {
    const subjectLine = userProperties.getProperty('subjectLine');
    
    if (!subjectLine) {
      Logger.log("No subject line found to reset.");
      return;
    }
    
    userProperties.deleteProperty('subjectLine');
    Logger.log("✅ Subject line reset AFTER emails were sent.");
    
  } catch (err) {
    Logger.log('❌ Failed to reset subject line with error: %s', err.message);
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
