/**
 * SBYIM AI Assistant - Knowledge Base & Document Text Indexer
 * Strict Knowledge Source:
 * 1. AI Documents (DOC, DOCX, PDF files uploaded and approved)
 * 
 * Core Rule: The AI must answer users using ONLY information retrieved from the
 * documents uploaded and approved under "AI Documents".
 */

class SBYIMKnowledgeBase {
  constructor() {
    this.sections = []; // Array of { id, category, filename, docId, sectionTitle, content, keywords }
    this.approvedDocs = []; // Array of { id, category, name, type, size, uploadedAt, isApproved }
    this.isIndexed = false;
    this.extractedTextCache = new Map(); // Cache for extracted text from data URLs
  }

  /**
   * Seed Corpus placeholder (Empty: All knowledge is dynamically derived from uploaded AI Documents)
   */
  getSeedCorpus() {
    return [];
  }

  /**
   * Initializes and syncs knowledge base strictly from uploaded and approved AI Documents only.
   * Core Rule: The AI must answer users using ONLY information retrieved from uploaded AI Documents.
   */
  async syncKnowledgeBase() {
    this.sections = [];
    this.approvedDocs = [];
    this.extractedTextCache.clear();

    // Retrieve exclusively uploaded and approved AI Documents (DOC, DOCX, PDF)
    try {
      if (window.nocDB && window.nocDB.getAiDocs) {
        const aiDocs = await window.nocDB.getAiDocs();
        for (const aDoc of (aiDocs || [])) {
          this.approvedDocs.push({
            id: aDoc.id,
            category: 'AI Documents',
            name: aDoc.name,
            type: aDoc.type || 'application/pdf',
            size: aDoc.size,
            uploadedAt: aDoc.uploadedAt,
            isApproved: true,
            source: 'Approved AI Document'
          });

          // Extract text from custom AI document
          await this.extractAndIndexDocText(aDoc, 'AI Documents');
        }
      }
    } catch (e) {
      console.warn('Error reading AI docs for AI Knowledge Base:', e);
    }

    this.isIndexed = true;
    console.log(`SBYIM Knowledge Base synchronized. Total Indexed Sections: ${this.sections.length} across ${this.approvedDocs.length} approved AI Documents.`);
    return {
      totalSections: this.sections.length,
      approvedDocsCount: this.approvedDocs.length
    };
  }

  /**
   * Client-side Text Extraction for user-uploaded documents (PDF, DOCX, DOC, SVG, Text)
   */
  async extractAndIndexDocText(doc, category) {
    if (!doc || !doc.dataUrl) return;

    // Check cache
    if (this.extractedTextCache.has(doc.id)) {
      const cached = this.extractedTextCache.get(doc.id);
      this.addExtractedSections(doc, category, cached);
      return;
    }

    try {
      let extractedText = '';

      const nameLower = (doc.name || '').toLowerCase();
      const typeLower = (doc.type || '').toLowerCase();

      // A. PDF Extraction via PDF.js
      if (typeLower.includes('pdf') || nameLower.endsWith('.pdf')) {
        extractedText = await this.extractTextFromPDF(doc.dataUrl);
      }
      // B. DOCX Extraction via JSZip / XML parsing
      else if (typeLower.includes('wordprocessingml') || nameLower.endsWith('.docx')) {
        extractedText = await this.extractTextFromDocx(doc.dataUrl);
      }
      // C. Legacy DOC Extraction
      else if (typeLower.includes('msword') || nameLower.endsWith('.doc')) {
        extractedText = await this.extractTextFromDoc(doc.dataUrl);
      }
      // D. SVG / XML / Text Extraction
      else if (typeLower.includes('svg') || typeLower.includes('xml') || typeLower.includes('text') || 
               nameLower.match(/\.(svg|xml|txt|json)$/i)) {
        extractedText = this.extractTextFromSVGOrText(doc.dataUrl);
      }
      // E. Base64 fallback
      else {
        extractedText = this.extractTextFromGenericDataUrl(doc.dataUrl);
      }

      if (extractedText && extractedText.trim().length > 10) {
        this.extractedTextCache.set(doc.id, extractedText);
        this.addExtractedSections(doc, category, extractedText);
      }
    } catch (err) {
      console.warn(`Text extraction error for document ${doc.name}:`, err);
    }
  }

  /**
   * Extracts text from DOCX Data URL using JSZip & XML parsing preserving natural line structure
   */
  async extractTextFromDocx(dataUrl) {
    try {
      const base64Data = dataUrl.split(',')[1] || dataUrl;
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // If JSZip is available
      if (window.JSZip) {
        const zip = await window.JSZip.loadAsync(bytes);
        const docXmlFile = zip.file('word/document.xml');
        if (docXmlFile) {
          const xmlText = await docXmlFile.async('string');
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
          const paragraphs = xmlDoc.getElementsByTagName('w:p');
          const lines = [];

          for (let p of paragraphs) {
            let paragraphText = '';
            const textNodes = p.getElementsByTagName('w:t');
            for (let t of textNodes) {
              paragraphText += t.textContent;
            }
            if (paragraphText.trim()) {
              lines.push(paragraphText.trim());
            }
          }

          if (lines.length > 0) {
            return lines.join('\n');
          }
        }
      }

      // Regex fallback if JSZip not present
      const matches = binaryString.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
      if (matches && matches.length > 0) {
        return matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean).join('\n');
      }

      return this.extractTextFromGenericDataUrl(dataUrl);
    } catch (e) {
      console.warn('DOCX text extraction fallback:', e);
      return this.extractTextFromGenericDataUrl(dataUrl);
    }
  }

  /**
   * Extracts text from legacy DOC Data URL
   */
  async extractTextFromDoc(dataUrl) {
    try {
      const base64Data = dataUrl.split(',')[1] || dataUrl;
      const decoded = atob(base64Data);
      
      // Extract printable ascii sequences with word structure
      const chunks = decoded.match(/[\x20-\x7E\t\r\n]{4,}/g) || [];
      const cleanText = chunks
        .map(c => c.replace(/[\r\n\t]+/g, ' ').trim())
        .filter(c => c.length > 15 && !c.startsWith('<?') && !c.startsWith('<!'))
        .join('\n\n');

      return cleanText.length > 20 ? cleanText : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Extracts text from PDF Data URL using PDF.js
   */
  async extractTextFromPDF(dataUrl) {
    if (!window.pdfjsLib) return '';
    try {
      // Decode data URL to Uint8Array
      const base64Data = dataUrl.split(',')[1] || dataUrl;
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const loadingTask = window.pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Group items by line according to Y-coordinate with rounding tolerance
        const linesMap = new Map();
        for (const item of textContent.items) {
          if (!item.str || !item.str.trim()) continue;
          const y = item.transform ? Math.round(item.transform[5] / 4) * 4 : 0;
          const x = item.transform ? item.transform[4] : 0;
          if (!linesMap.has(y)) {
            linesMap.set(y, []);
          }
          linesMap.get(y).push({ x, str: item.str });
        }

        // Sort lines descending by Y (top of page to bottom)
        const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
        const pageLines = [];

        for (const y of sortedY) {
          const itemsInLine = linesMap.get(y).sort((a, b) => a.x - b.x);
          const lineStr = itemsInLine.map(it => it.str).join(' ').trim();
          if (lineStr) {
            pageLines.push(lineStr);
          }
        }

        if (pageLines.length > 0) {
          fullText += `\n\n` + pageLines.join('\n');
        }
      }
      return fullText.trim();
    } catch (e) {
      console.warn('PDF text extraction error:', e);
      return '';
    }
  }

  /**
   * Extracts text from SVG or plain text data URL
   */
  extractTextFromSVGOrText(dataUrl) {
    try {
      let raw = '';
      if (dataUrl.startsWith('data:')) {
        const parts = dataUrl.split(',');
        const isBase64 = parts[0].includes('base64');
        raw = isBase64 ? atob(parts[1]) : decodeURIComponent(parts[1]);
      } else {
        raw = dataUrl;
      }

      // Strip SVG/HTML tags to extract readable text
      const clean = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return clean;
    } catch (e) {
      return '';
    }
  }

  /**
   * Generic text extractor from encoded string
   */
  extractTextFromGenericDataUrl(dataUrl) {
    try {
      if (!dataUrl || !dataUrl.includes(',')) return '';
      const base64 = dataUrl.split(',')[1];
      const decoded = atob(base64);
      // Remove binary non-printables
      const clean = decoded.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
      return clean.length > 20 ? clean : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Splits extracted document text into semantic chunks by headers, schedule blocks, or paragraphs
   */
  addExtractedSections(doc, category, fullText) {
    if (!fullText || !fullText.trim()) return;

    const raw = fullText.trim();
    const lines = raw.split(/\r?\n/);
    const chunks = [];
    let currentChunk = [];
    let currentTitle = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect major header boundaries: lines starting with ≡, #, Section X, or specific schedule/topic titles
      const isHeader = /^[≡#]/.test(trimmed) || 
                       (/^section\s+\d+[:\.]/i.test(trimmed)) ||
                       (/^(passenger ferry|passenger boat|water taxi|ro-ro|roro|delma|cargo ferry|emergency contacts|dress code|speed limits?|drawing standards|wildlife protection|penalties|checklist|submission requirements|guidelines)\b/i.test(trimmed) && trimmed.length < 70 && !trimmed.startsWith('Trip') && !trimmed.startsWith('Operating') && !trimmed.startsWith('From'));

      if (isHeader && currentChunk.length > 0) {
        chunks.push({
          title: currentTitle || `Section ${chunks.length + 1}: ${doc.name.replace(/\.[^/.]+$/, '')}`,
          content: currentChunk.join('\n').trim()
        });
        currentChunk = [];
        currentTitle = trimmed.replace(/^[≡#]+\s*/, '');
      } else if (isHeader && currentChunk.length === 0) {
        currentTitle = trimmed.replace(/^[≡#]+\s*/, '');
      }

      if (trimmed) {
        currentChunk.push(line);
      } else if (currentChunk.length > 0) {
        currentChunk.push('');
      }
    }

    if (currentChunk.length > 0) {
      chunks.push({
        title: currentTitle || `Section ${chunks.length + 1}: ${doc.name.replace(/\.[^/.]+$/, '')}`,
        content: currentChunk.join('\n').trim()
      });
    }

    // Fallback if no header chunks detected
    if (chunks.length === 0) {
      const paragraphs = raw.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
      paragraphs.forEach((p, idx) => {
        chunks.push({
          title: `Section ${idx + 1}: ${doc.name.replace(/\.[^/.]+$/, '')}`,
          content: p
        });
      });
    }

    chunks.forEach((chunk, idx) => {
      if (!chunk.content || chunk.content.length < 5) return;

      const words = chunk.content.toLowerCase().match(/\b[a-z0-9-]{3,}\b/g) || [];
      const uniqueKeywords = [...new Set(words)];

      this.sections.push({
        id: `${doc.id}_sec_${idx}`,
        category: category,
        filename: doc.name,
        docId: doc.id,
        sectionTitle: chunk.title,
        content: chunk.content,
        keywords: uniqueKeywords
      });
    });
  }

  /**
   * Get all active approved documents
   */
  getApprovedDocuments() {
    return this.approvedDocs;
  }

  /**
   * Get all indexed sections
   */
  getAllSections() {
    return this.sections;
  }
}

window.SBYIMKnowledgeBase = SBYIMKnowledgeBase;
window.sbyimKnowledgeBase = new SBYIMKnowledgeBase();
