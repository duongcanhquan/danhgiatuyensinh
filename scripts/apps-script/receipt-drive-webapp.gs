const ROOT_FOLDER_ID = '1GLfOI4XJG4X1I9TnENrVX0aCVYIyqCf7'
const TOKEN_PROP_KEY = 'RECEIPT_WEBHOOK_TOKEN'

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    const tokenExpected = String(PropertiesService.getScriptProperties().getProperty(TOKEN_PROP_KEY) || '').trim()
    if (tokenExpected && String(body.token || '').trim() !== tokenExpected) {
      return jsonOut({ ok: false, error: 'Unauthorized token.' })
    }

    const fileName = safeName(body.fileName || 'bill')
    const contentType = String(body.contentType || 'application/octet-stream').trim()
    const base64 = String(body.base64 || '').trim()
    if (!base64) return jsonOut({ ok: false, error: 'Missing base64.' })

    const leadName = String(body.fullName || 'HoSo').trim()
    const profileCode = String(body.systemCode || body.customerId || body.leadId || '').trim() || 'NO_CODE'
    const folderName = safeFolderName(body.folderName || `${leadName}_${profileCode}`)
    const slot = String(body.slot || '').trim()

    const root = DriveApp.getFolderById(ROOT_FOLDER_ID)
    const studentFolder = getOrCreateSubFolder(root, folderName)

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss')
    const storedFileName = `${timestamp}_${slot || 'receipt'}_${fileName}`
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), contentType, storedFileName)
    const storedFile = studentFolder.createFile(blob)

    const info = {
      leadId: String(body.leadId || '').trim(),
      fullName: leadName,
      systemCode: String(body.systemCode || '').trim(),
      customerId: String(body.customerId || '').trim(),
      slot: slot,
      originalFileName: fileName,
      storedFileName: storedFileName,
      uploadedAt: new Date().toISOString(),
      fileUrl: storedFile.getUrl(),
      folderUrl: studentFolder.getUrl(),
    }
    studentFolder.createFile(
      `INFO_${timestamp}_${slot || 'receipt'}.json`,
      JSON.stringify(info, null, 2),
      MimeType.PLAIN_TEXT,
    )

    return jsonOut({
      ok: true,
      folderUrl: studentFolder.getUrl(),
      fileUrl: storedFile.getUrl(),
      fileId: storedFile.getId(),
    })
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) })
  }
}

function getOrCreateSubFolder(parent, folderName) {
  const iter = parent.getFoldersByName(folderName)
  if (iter.hasNext()) return iter.next()
  return parent.createFolder(folderName)
}

function safeFolderName(input) {
  return String(input || 'HoSo')
    .replace(/[^\w.\-()À-ỹ\s]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120)
}

function safeName(input) {
  return String(input || 'bill')
    .replace(/[^\w.\-()À-ỹ]/g, '_')
    .slice(0, 140)
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
