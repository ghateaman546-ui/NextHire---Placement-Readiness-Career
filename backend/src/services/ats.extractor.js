/**
 * ats.extractor.js — turns an uploaded resume file into clean plain text.
 *
 * Supports PDF (pdf-parse), DOCX (mammoth) and legacy DOC (word-extractor).
 * Nothing in here executes the uploaded file: it is only ever parsed as data, in memory.
 * File type is decided from the file's magic bytes, not from the (client-controlled) mimetype.
 */
const path = require('path');

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_CHARS = 60000;
const PARSE_TIMEOUT_MS = 20000;
const MIN_LETTERS_FOR_TEXT_RESUME = 120;

class AtsError extends Error {
  constructor(message, statusCode = 400, code = 'ATS_ERROR') {
    super(message);
    this.name = 'AtsError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc'];

function sniffType(buffer) {
  if (buffer.length >= 5 && buffer.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return 'docx'; // zip container
  if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'doc'; // OLE2
  return null;
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AtsError(message, 422, 'PARSE_TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * pdf-parse page renderer that keeps line breaks AND marks large horizontal gaps with extra
 * spaces, so the analyzer can tell when a page is laid out in columns / tables.
 */
function renderPdfPage(pageData) {
  return pageData
    .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
    .then((content) => {
      let text = '';
      let lastY = null;
      let lastEnd = null;
      for (const item of content.items) {
        const x = item.transform[4];
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          text += '\n';
          lastEnd = null;
        } else if (lastEnd !== null && x - lastEnd > 12) {
          text += '   ';
        } else if (lastEnd !== null && x - lastEnd > 2.5 && !/\s$/.test(text) && !/^\s/.test(item.str)) {
          text += ' ';
        }
        text += item.str;
        lastY = y;
        lastEnd = x + (item.width || 0);
      }
      return text;
    });
}

async function extractPdf(buffer) {
  // Import the library file directly: pdf-parse's index.js runs a debug routine when it has no parent module.
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const parseOnce = () =>
    withTimeout(
      pdfParse(buffer, { pagerender: renderPdfPage }),
      PARSE_TIMEOUT_MS,
      'Reading this PDF took too long. Please upload a simpler, text-based PDF or a DOCX file.'
    );
  try {
    let data;
    // The pdf.js build bundled with pdf-parse can throw a recoverable "bad XRef entry" error on the first reads of an
    // otherwise valid PDF (it rebuilds the cross-reference table and then succeeds). Allow up to 3 attempts; genuinely
    // corrupt files fail every time and are reported below. Password errors and timeouts are never retried.
    for (let attempt = 1; ; attempt += 1) {
      try {
        data = await parseOnce();
        break;
      } catch (e) {
        if (e instanceof AtsError || /password|encrypt/i.test(`${e?.name} ${e?.message}`) || attempt >= 3) throw e;
      }
    }
    return { text: data.text || '', pages: data.numpages || 0, tables: 0, images: 0 };
  } catch (err) {
    if (err instanceof AtsError) throw err;
    if (/password/i.test(err?.name || '') || /password|encrypt/i.test(err?.message || '')) {
      throw new AtsError('This PDF is password-protected. Please remove the password and upload it again.', 422, 'PDF_ENCRYPTED');
    }
    throw new AtsError('This PDF could not be read — it may be corrupted. Please re-export it and try again.', 422, 'PDF_UNREADABLE');
  }
}

function htmlToText(html) {
  return html
    .replace(/<\/(?:p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(?:td|th)>/gi, '   ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function extractDocx(buffer) {
  const mammoth = require('mammoth');
  try {
    // Converting to HTML (instead of raw text) keeps list bullets and lets us count tables / images,
    // which are common ATS problems. The HTML is only used to build plain text — it is never rendered.
    const html = await withTimeout(mammoth.convertToHtml({ buffer }), PARSE_TIMEOUT_MS, 'Reading this DOCX took too long.');
    const tables = (html.value.match(/<table[\s>]/gi) || []).length;
    const images = (html.value.match(/<img[\s>]/gi) || []).length;
    return { text: htmlToText(html.value), pages: 0, tables, images };
  } catch (err) {
    if (err instanceof AtsError) throw err;
    throw new AtsError('This DOCX file could not be read — it may be corrupted or not a real Word document.', 422, 'DOCX_UNREADABLE');
  }
}

async function extractDoc(buffer) {
  const WordExtractor = require('word-extractor');
  try {
    const extractor = new WordExtractor();
    const doc = await withTimeout(extractor.extract(buffer), PARSE_TIMEOUT_MS, 'Reading this DOC took too long.');
    return { text: doc.getBody() || '', pages: 0, tables: 0, images: 0 };
  } catch (err) {
    if (err instanceof AtsError) throw err;
    throw new AtsError('This DOC file could not be read — it may be corrupted. Try saving it as DOCX or PDF.', 422, 'DOC_UNREADABLE');
  }
}

/**
 * Normalises extracted text: strips control / zero-width characters, fixes ligatures and bullet glyphs,
 * collapses whitespace. The result is plain text only (it is never rendered as HTML anywhere).
 */
function sanitizeText(input) {
  let t = String(input || '');
  t = t.replace(/\r\n?/g, '\n');
  // Symbol-font bullets (private-use glyphs at the start of a line) -> a normal bullet
  t = t.replace(/^[ \t]*[\uE000-\uF8FF][ \t]*/gm, '• ');
  t = t
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\uFB00]/g, 'ff')
    .replace(/[\uFB01]/g, 'fi')
    .replace(/[\uFB02]/g, 'fl')
    .replace(/[\uFB03]/g, 'ffi')
    .replace(/[\uFB04]/g, 'ffl')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[▪■●◦◆➢➤►‣⁃∙]/g, '•');
  t = t
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, '').replace(/^\t+/g, ''))
    .join('\n');
  t = t.replace(/\n{4,}/g, '\n\n\n').trim();
  if (t.length > MAX_TEXT_CHARS) t = t.slice(0, MAX_TEXT_CHARS);
  return t;
}

/**
 * @param {{buffer:Buffer, originalname?:string, mimetype?:string, size?:number}} file  multer memory-storage file
 * @returns {Promise<{text:string, fileType:string, pages:number, tables:number, images:number}>}
 */
async function extractResumeText(file) {
  if (!file || !file.buffer) throw new AtsError('Please choose a resume file to upload.', 400, 'NO_FILE');
  const { buffer } = file;
  if (buffer.length === 0) throw new AtsError('The uploaded file is empty.', 400, 'EMPTY_FILE');
  if (buffer.length > MAX_FILE_BYTES) throw new AtsError('File is too large. Maximum size is 5 MB.', 413, 'FILE_TOO_LARGE');

  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AtsError('Unsupported file type. Please upload a PDF, DOCX or DOC file.', 415, 'UNSUPPORTED_TYPE');
  }
  const detected = sniffType(buffer);
  if (!detected) {
    throw new AtsError('This file does not look like a valid PDF, DOCX or DOC document.', 415, 'UNSUPPORTED_TYPE');
  }
  // A ".pdf" whose bytes are a Word file (or vice versa) is parsed as what it really is.

  let out;
  if (detected === 'pdf') out = await extractPdf(buffer);
  else if (detected === 'docx') out = await extractDocx(buffer);
  else out = await extractDoc(buffer);

  const text = sanitizeText(out.text);
  const letters = (text.match(/\p{L}/gu) || []).length;

  if (letters < MIN_LETTERS_FOR_TEXT_RESUME) {
    if (detected === 'pdf') {
      throw new AtsError(
        'Unable to extract selectable text from this resume. Please upload a text-based PDF or DOCX.',
        422,
        'NO_SELECTABLE_TEXT'
      );
    }
    throw new AtsError(
      'Not enough readable text was found in this document. Please check the file and upload a complete resume.',
      422,
      'NO_TEXT'
    );
  }

  return { text, fileType: detected, pages: out.pages, tables: out.tables, images: out.images };
}

module.exports = { extractResumeText, sanitizeText, AtsError, MAX_FILE_BYTES, ALLOWED_EXTENSIONS };
