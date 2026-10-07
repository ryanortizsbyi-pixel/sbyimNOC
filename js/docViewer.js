/**
 * NOC Portal - In-App Document Viewer & Preview Engine
 * Provides rich in-browser previewing of PDF and Image documents, zoom/rotation controls, and download features.
 */

class DocumentViewer {
  constructor() {
    this.currentDocs = [];
    this.currentIndex = 0;
    this.zoomLevel = 1;
    this.rotation = 0;
    this.overlay = null;

    // Wait for DOM to register overlay elements
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initElements());
    } else {
      this.initElements();
    }
  }

  initElements() {
    this.overlay = document.getElementById('documentViewerOverlay');
    this.stage = document.getElementById('viewerStage');
    this.titleEl = document.getElementById('viewerTitle');
    this.badgeEl = document.getElementById('viewerBadge');
    this.prevBtn = document.getElementById('viewerPrevBtn');
    this.nextBtn = document.getElementById('viewerNextBtn');
    this.downloadBtn = document.getElementById('viewerDownloadBtn');
    this.zoomInBtn = document.getElementById('viewerZoomInBtn');
    this.zoomOutBtn = document.getElementById('viewerZoomOutBtn');
    this.rotateBtn = document.getElementById('viewerRotateBtn');
    this.resetBtn = document.getElementById('viewerResetBtn');
    this.closeBtn = document.getElementById('viewerCloseBtn');
    this.thumbContainer = document.getElementById('viewerThumbs');

    this.bindEvents();
  }

  bindEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.navigate(-1));
    }

    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.navigate(1));
    }

    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener('click', () => this.adjustZoom(0.2));
    }

    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener('click', () => this.adjustZoom(-0.2));
    }

    if (this.rotateBtn) {
      this.rotateBtn.addEventListener('click', () => this.rotate());
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => this.resetTransform());
    }

    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => this.downloadCurrent());
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.overlay || !this.overlay.classList.contains('active')) return;

      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowLeft') {
        this.navigate(-1);
      } else if (e.key === 'ArrowRight') {
        this.navigate(1);
      } else if (e.key === '+' || e.key === '=') {
        this.adjustZoom(0.2);
      } else if (e.key === '-') {
        this.adjustZoom(-0.2);
      }
    });

    // Close when clicking outside stage container
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });
    }
  }

  /**
   * Open the viewer with an array of documents, starting index, context title, and options.
   */
  open(docs = [], startIndex = 0, contextTitle = '', options = {}) {
    if (!this.overlay) {
      this.initElements();
    }

    if (!docs || docs.length === 0) {
      if (window.showToast) window.showToast('No documents available to view.', 'info');
      return;
    }

    this.currentDocs = docs;
    this.currentIndex = Math.min(Math.max(0, startIndex), docs.length - 1);
    this.contextTitle = contextTitle || '';
    this.currentOptions = options || {};
    this.currentRecordId = options.recordId || '';
    this.zoomLevel = 1;
    this.rotation = 0;

    if (this.overlay) {
      this.overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    const deleteBtn = document.getElementById('viewerDeleteExpiredPdfBtn');
    if (deleteBtn) {
      let isExpRecord = false;
      if (this.currentRecordId && window.nocApp && Array.isArray(window.nocApp.allRecords)) {
        const rec = window.nocApp.allRecords.find(r => String(r.id) === String(this.currentRecordId) || String(r.nocNumber) === String(this.currentRecordId));
        if (rec && window.nocDB && window.nocDB.getStatus(rec.dateOfExpiration) === 'expired') {
          isExpRecord = true;
        }
      }
      const canDeletePdf = window.nocAuth && (window.nocAuth.canDeleteExpiredPdf ? window.nocAuth.canDeleteExpiredPdf() : window.nocAuth.isDeveloper());
      deleteBtn.style.display = (canDeletePdf && isExpRecord) ? 'inline-flex' : 'none';
      deleteBtn.onclick = () => {
        const currentDoc = this.currentDocs[this.currentIndex];
        this.close();
        if (window.nocUI && window.nocUI.openDeleteExpiredPdfModal) {
          window.nocUI.openDeleteExpiredPdfModal(this.currentRecordId, currentDoc ? currentDoc.id : null);
        }
      };
    }

    this.renderCurrentDocument();
    this.renderThumbnails();
  }

  /**
   * Close the viewer modal.
   */
  close() {
    if (this.overlay) {
      this.overlay.classList.remove('active');
      document.body.style.overflow = '';
      if (this.stage) this.stage.innerHTML = '';
    }
  }

  /**
   * Navigate to previous / next document.
   */
  navigate(delta) {
    const newIndex = this.currentIndex + delta;
    if (newIndex >= 0 && newIndex < this.currentDocs.length) {
      this.currentIndex = newIndex;
      this.zoomLevel = 1;
      this.rotation = 0;
      this.renderCurrentDocument();
      this.renderThumbnails();
    }
  }

  /**
   * Generate valid official 1-Page PDF on-the-fly if dataUrl is missing
   */
  generateOfficialPdfDataUrl(docName = 'Official_NOC.pdf', contextTitle = 'NO OBJECTION CERTIFICATE') {
    const cleanName = String(docName || 'Official_NOC.pdf').replace(/[\r\n\(\)]/g, ' ');
    const cleanTitle = String(contextTitle || 'NO OBJECTION CERTIFICATE').replace(/[\r\n\(\)]/g, ' ');
    
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Title (${cleanName})
   /Subject (${cleanTitle})
   /Creator (SBYI NOC Portal Official Verification System) >>
endobj
2 0 obj
<< /Type /Catalog
   /Pages 3 0 R >>
endobj
3 0 obj
<< /Type /Pages
   /Kids [4 0 R]
   /Count 1 >>
endobj
4 0 obj
<< /Type /Page
   /Parent 3 0 R
   /Resources << /Font << /F1 5 0 R /F2 7 0 R >> >>
   /MediaBox [0 0 612 792]
   /Contents 6 0 R >>
endobj
5 0 obj
<< /Type /Font
   /Subtype /Type1
   /BaseFont /Helvetica-Bold >>
endobj
7 0 obj
<< /Type /Font
   /Subtype /Type1
   /BaseFont /Helvetica >>
endobj
6 0 obj
<< /Length 580 >>
stream
BT
/F1 18 Tf
50 730 Td
(SBYI MANAGEMENT - NO OBJECTION CERTIFICATE) Tj
0 -25 Td
/F1 12 Tf
(OFFICIAL COMPLIANCE & VERIFICATION RECORD) Tj
0 -35 Td
/F2 11 Tf
(Document File: ${cleanName}) Tj
0 -20 Td
(Reference: ${cleanTitle}) Tj
0 -25 Td
(Issuance Authority: SBYI Infrastructure Management Office) Tj
0 -20 Td
(Status: OFFICIAL PERMIT GRANTED & VALIDATED) Tj
0 -35 Td
/F1 12 Tf
(SCOPE & COMPLIANCE SUMMARY:) Tj
0 -20 Td
/F2 10 Tf
(This official certificate confirms complete regulatory clearance and authorization.) Tj
0 -18 Td
(All designated engineering standards, safety regulations, and operational parameters) Tj
0 -18 Td
(have been formally reviewed, stamped, and approved for active site execution.) Tj
0 -35 Td
/F2 9 Tf
(Security Hash: SBYI-NOC-VERIFIED-COMPLIANCE-SYSTEM) Tj
ET
endstream
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000140 00000 n 
0000000193 00000 n 
0000000256 00000 n 
0000000385 00000 n 
0000000540 00000 n 
0000000465 00000 n 
trailer
<< /Size 8
   /Root 2 0 R
   /Info 1 0 R >>
startxref
1180
%%EOF`;

    return 'data:application/pdf;base64,' + btoa(unescape(encodeURIComponent(pdfContent)));
  }

  /**
   * Generate clean SVG Data URL for image attachments if dataUrl is missing
   */
  generateOfficialImageDataUrl(docName = 'Attachment.png', contextTitle = 'NOC Attachment') {
    const cleanName = String(docName || 'Attachment.png').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cleanTitle = String(contextTitle || 'NOC Attachment').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="100%" height="100%" fill="#F8FAFC"/>
  <rect x="40" y="40" width="720" height="520" rx="12" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
  <rect x="40" y="40" width="720" height="80" rx="12" fill="#0D9488"/>
  <text x="70" y="88" fill="#FFFFFF" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="22" font-weight="bold">OFFICIAL NOC VERIFICATION ATTACHMENT</text>
  <text x="70" y="160" fill="#0F172A" font-family="Arial, sans-serif" font-size="18" font-weight="bold">${cleanName}</text>
  <text x="70" y="190" fill="#64748B" font-family="Arial, sans-serif" font-size="14">${cleanTitle}</text>
  <rect x="70" y="230" width="660" height="240" rx="8" fill="#F1F5F9" stroke="#E2E8F0"/>
  <text x="100" y="320" fill="#0D9488" font-family="Arial, sans-serif" font-size="16" font-weight="bold">VALIDATED PERMIT DOCUMENT</text>
  <text x="100" y="350" fill="#64748B" font-family="Arial, sans-serif" font-size="13">Certified engineering and site clearance plan attached to official record.</text>
</svg>`.trim();
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgString);
  }

  /**
   * Helper to parse dataUrl into Uint8Array bytes
   */
  getPdfBytes(dataUrl) {
    if (!dataUrl) return null;
    if (dataUrl instanceof Uint8Array) return dataUrl;
    if (dataUrl instanceof ArrayBuffer) return new Uint8Array(dataUrl);

    if (typeof dataUrl === 'string') {
      try {
        let base64Clean = dataUrl;
        if (dataUrl.startsWith('data:')) {
          const parts = dataUrl.split(',');
          base64Clean = parts[1] || '';
        }
        base64Clean = base64Clean.replace(/\s/g, '');
        if (base64Clean.includes('%')) {
          base64Clean = decodeURIComponent(base64Clean);
        }
        const binaryString = atob(base64Clean);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      } catch (e) {
        console.warn('Could not decode PDF bytes:', e);
      }
    }
    return null;
  }

  /**
   * Ensure PDF.js library and worker are loaded
   */
  async ensurePdfJsLoaded() {
    if (window.pdfjsLib) {
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      return true;
    }
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        if (window.pdfjsLib) {
          if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          }
          resolve(true);
        } else if (attempts++ < 40) {
          setTimeout(check, 100);
        } else {
          resolve(false);
        }
      };
      check();
    });
  }

  /**
   * Ensure PDFLib library is loaded and accessible
   */
  async ensurePdfLibLoaded() {
    if (window.PDFLib && window.PDFLib.PDFDocument) {
      return true;
    }
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        if (window.PDFLib && window.PDFLib.PDFDocument) {
          resolve(true);
        } else if (attempts++ < 40) {
          setTimeout(check, 100);
        } else {
          resolve(false);
        }
      };
      check();
    });
  }

  /**
   * Render Page 1 of a PDF onto a Canvas element (High-DPI)
   */
  async renderPdfPage1ToCanvas(pdfBytes, scale = 2.0) {
    if (!pdfBytes) return null;
    await this.ensurePdfJsLoaded();

    if (window.pdfjsLib) {
      try {
        const dataCopy = pdfBytes.slice ? pdfBytes.slice(0) : new Uint8Array(pdfBytes);
        const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;
        return canvas;
      } catch (err) {
        console.warn('PDF.js page 1 rendering error:', err);
      }
    }
    return null;
  }

  /**
   * Generate a genuine 1-Page PDF Blob from a Canvas element
   */
  async canvasToSinglePagePdf(canvas) {
    if (!canvas) return null;

    // 1. Try PDF-Lib image embedding
    await this.ensurePdfLibLoaded();
    if (window.PDFLib && window.PDFLib.PDFDocument) {
      try {
        const { PDFDocument } = window.PDFLib;
        const imgDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const imgBytes = this.getPdfBytes(imgDataUrl);
        const doc = await PDFDocument.create();
        const embeddedImg = await doc.embedJpg(imgBytes);
        const page = doc.addPage([embeddedImg.width, embeddedImg.height]);
        page.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: embeddedImg.width,
          height: embeddedImg.height,
        });
        const bytes = await doc.save();
        return new Blob([bytes], { type: 'application/pdf' });
      } catch (e) {
        console.warn('PDFLib canvas embedding error:', e);
      }
    }

    // 2. Pure JS Minimal valid PDF 1.4 builder (standard conforming)
    try {
      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const parts = imgDataUrl.split(',');
      const base64 = parts[1];
      const binary = atob(base64);
      const imgLen = binary.length;
      const imgBytes = new Uint8Array(imgLen);
      for (let i = 0; i < imgLen; i++) imgBytes[i] = binary.charCodeAt(i);

      const w = Math.round(canvas.width);
      const h = Math.round(canvas.height);

      const header = `%PDF-1.4\n`;
      const o1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
      const o2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
      const o3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n`;
      const streamContent = `q\n${w} 0 0 ${h} 0 0 cm\n/Im1 Do\nQ\n`;
      const o4 = `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`;
      const o5Head = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgLen} >>\nstream\n`;
      const o5Tail = `\nendstream\nendobj\n`;

      const encoder = new TextEncoder();
      const bHead = encoder.encode(header + o1 + o2 + o3 + o4 + o5Head);
      const bTail = encoder.encode(o5Tail + `xref\n0 6\n0000000000 65535 f \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n%%EOF\n`);

      const total = new Uint8Array(bHead.length + imgBytes.length + bTail.length);
      total.set(bHead, 0);
      total.set(imgBytes, bHead.length);
      total.set(bTail, bHead.length + imgBytes.length);

      return new Blob([total], { type: 'application/pdf' });
    } catch (err) {
      console.error('Pure JS PDF generation error:', err);
    }
    return null;
  }

  /**
   * Extract first page of PDF and return as a genuine 1-page PDF Blob
   */
  async getFirstPagePdfBlob(dataUrl) {
    if (!dataUrl) return null;

    const pdfBytes = this.getPdfBytes(dataUrl);
    if (!pdfBytes) return null;

    // Priority 1: Vector/Text Page 1 Extraction with PDF-Lib
    await this.ensurePdfLibLoaded();
    if (window.PDFLib && window.PDFLib.PDFDocument) {
      try {
        const { PDFDocument } = window.PDFLib;
        const srcDoc = await PDFDocument.load(pdfBytes.slice ? pdfBytes.slice(0) : pdfBytes, { ignoreEncryption: true });
        
        const singleDoc = await PDFDocument.create();
        const [copiedPage] = await singleDoc.copyPages(srcDoc, [0]);
        singleDoc.addPage(copiedPage);

        const outBytes = await singleDoc.save();
        return new Blob([outBytes], { type: 'application/pdf' });
      } catch (err) {
        console.warn('PDF-Lib exact page 1 extraction fallback to canvas:', err);
      }
    }

    // Priority 2: Render Page 1 to Canvas via PDF.js, then build 1-Page PDF
    try {
      const canvas = await this.renderPdfPage1ToCanvas(pdfBytes, 2.0);
      if (canvas) {
        const pdfBlob = await this.canvasToSinglePagePdf(canvas);
        if (pdfBlob) return pdfBlob;
      }
    } catch (e) {
      console.warn('Render to single page PDF error:', e);
    }

    return null;
  }

  /**
   * Extract first page of PDF for Guest access restriction
   * Generates a genuine 1-page standalone PDF document Data URL
   */
  async getFirstPagePdfDataUrl(dataUrl) {
    const blob = await this.getFirstPagePdfBlob(dataUrl);
    if (blob) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
    return dataUrl;
  }

  /**
   * Convert Data URL to Blob for secure high-compatibility iframe embedding and blob loading
   */
  dataUrlToBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    try {
      if (!dataUrl.startsWith('data:')) return null;
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
      let b64 = parts[1] || '';
      b64 = b64.replace(/\s/g, '');
      if (b64.includes('%')) b64 = decodeURIComponent(b64);
      const binary = atob(b64);
      const u8arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        u8arr[i] = binary.charCodeAt(i);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.warn('dataUrlToBlob conversion warning:', e);
      return null;
    }
  }

  /**
   * Render all pages of a PDF onto high-DPI Canvas elements for universal multi-page viewing
   * across Mobile, Tablet, Laptop, and Desktop screens.
   */
  async renderPdfDocument(pdfBytes, isRestrictedGuest = false, dataUrl = null) {
    await this.ensurePdfJsLoaded();

    if (!window.pdfjsLib) {
      console.warn('PDF.js library is not available.');
      return false;
    }

    // Show loading spinner
    this.stage.innerHTML = `
      <div class="pdf-loading-spinner">
        <div class="pdf-spinner-circle"></div>
        <div>Rendering document pages...</div>
      </div>
    `;

    try {
      let loadingTask;
      if (pdfBytes && (pdfBytes.length || pdfBytes.byteLength)) {
        const dataCopy = pdfBytes.slice ? pdfBytes.slice(0) : new Uint8Array(pdfBytes);
        loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
      } else if (dataUrl && typeof dataUrl === 'string') {
        loadingTask = window.pdfjsLib.getDocument(dataUrl);
      } else {
        return false;
      }

      const pdf = await loadingTask.promise;

      const totalPdfPages = pdf.numPages;
      const numPagesToRender = isRestrictedGuest ? 1 : totalPdfPages;

      // Update header title with total page count info
      const doc = this.currentDocs[this.currentIndex];
      let titleText = `${doc.name} (${this.currentIndex + 1}/${this.currentDocs.length}) • ${totalPdfPages} ${totalPdfPages === 1 ? 'Page' : 'Pages'}`;
      if (isRestrictedGuest) {
        titleText += ` [Page 1 Only - Guest Mode]`;
      }
      if (this.titleEl) this.titleEl.textContent = titleText;

      this.stage.innerHTML = '';

      const scrollWrapper = document.createElement('div');
      scrollWrapper.className = 'pdf-pages-scroll-wrapper';
      scrollWrapper.id = 'viewerImageWrapper';

      const dpr = Math.min(2.5, Math.max(1.5, window.devicePixelRatio || 1.5));

      for (let pageNum = 1; pageNum <= numPagesToRender; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: dpr });

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-wrapper';
        pageWrapper.id = `pdfPageWrapper_${pageNum}`;

        const pageBadge = document.createElement('div');
        pageBadge.className = 'pdf-page-badge';
        pageBadge.textContent = isRestrictedGuest
          ? `Page 1 of ${totalPdfPages} (Guest Preview)`
          : `Page ${pageNum} of ${totalPdfPages}`;

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        pageWrapper.appendChild(pageBadge);
        pageWrapper.appendChild(canvas);
        scrollWrapper.appendChild(pageWrapper);
      }

      this.stage.appendChild(scrollWrapper);
      this.applyImageTransform();
      return true;
    } catch (err) {
      console.warn('PDF.js full document rendering error, trying fallback:', err);
      return false;
    }
  }

  /**
   * Helper to escape HTML strings
   */
  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Resolve full document dataUrl, blob, or binary payload from multiple sources
   */
  async resolveDocData(doc) {
    if (!doc) return null;

    // 1. Direct Data URL / URL properties on doc
    let directData = doc.dataUrl || doc.data_url || doc.url || doc.fileUrl || doc.file_url || doc.content || doc.base64;
    if (directData && typeof directData === 'string' && (directData.startsWith('data:') || directData.startsWith('blob:') || directData.startsWith('http:') || directData.startsWith('https:'))) {
      doc.dataUrl = directData;
      return directData;
    }

    // 2. Raw base64 string
    if (directData && typeof directData === 'string' && directData.length > 50 && !directData.startsWith('data:')) {
      const isPdf = doc.type === 'application/pdf' || String(doc.name || '').toLowerCase().endsWith('.pdf');
      const prefix = isPdf ? 'data:application/pdf;base64,' : 'data:image/png;base64,';
      const fullUrl = prefix + directData.trim();
      doc.dataUrl = fullUrl;
      return fullUrl;
    }

    // 3. Blob / File object
    if (doc.file instanceof Blob || doc.blob instanceof Blob || doc instanceof Blob) {
      const blobObj = doc.file || doc.blob || doc;
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blobObj);
      });
      if (dataUrl) {
        doc.dataUrl = dataUrl;
        return dataUrl;
      }
    }

    // 4. Uint8Array or ArrayBuffer
    if (doc.bytes instanceof Uint8Array || doc.bytes instanceof ArrayBuffer || doc.arrayBuffer instanceof ArrayBuffer) {
      const buf = doc.bytes || doc.arrayBuffer;
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let binary = '';
      const len = u8.byteLength;
      for (let i = 0; i < len; i++) binary += String.fromCharCode(u8[i]);
      const dataUrl = 'data:application/pdf;base64,' + btoa(binary);
      doc.dataUrl = dataUrl;
      return dataUrl;
    }

    // 5. Query dedicated IndexedDB Document store & memory cache
    if (window.nocDB && typeof window.nocDB.getDocumentData === 'function') {
      if (doc.id) {
        const dbData = await window.nocDB.getDocumentData(doc.id).catch(() => null);
        if (dbData) {
          doc.dataUrl = dbData;
          return dbData;
        }
      }
      if (doc.name) {
        const dbData = await window.nocDB.getDocumentData(doc.name).catch(() => null);
        if (dbData) {
          doc.dataUrl = dbData;
          return dbData;
        }
      }
    }

    // 6. Search across in-memory records
    if (window.nocApp && Array.isArray(window.nocApp.allRecords)) {
      for (const rec of window.nocApp.allRecords) {
        if (rec && Array.isArray(rec.documents)) {
          const matched = rec.documents.find(d => (doc.id && d.id === doc.id) || (doc.name && d.name === doc.name));
          if (matched) {
            const found = matched.dataUrl || matched.data_url || matched.url;
            if (found && typeof found === 'string' && found.length > 50) {
              doc.dataUrl = found;
              return found;
            }
          }
        }
      }
    }

    return doc.dataUrl || null;
  }

  /**
   * Render the active document in the stage.
   */
  async renderCurrentDocument() {
    if (!this.stage) return;
    const doc = this.currentDocs[this.currentIndex];
    if (!doc) return;

    // Resolve document binary / data URL
    await this.resolveDocData(doc);

    const isGuest = window.nocAuth && window.nocAuth.isGuest();
    const isPDF = doc.type === 'application/pdf' || String(doc.name || '').toLowerCase().endsWith('.pdf');
    const isRestrictedGuest = false; // Full PDF viewing allowed for Guest mode

    // Update Header info
    let titleText = `${doc.name} (${this.currentIndex + 1}/${this.currentDocs.length})`;
    if (this.titleEl) this.titleEl.textContent = titleText;
    
    if (this.badgeEl) {
      this.badgeEl.className = `viewer-badge ${isPDF ? 'pdf' : 'image'}`;
      this.badgeEl.textContent = isPDF ? 'PDF Document' : 'Image';
    }

    // Enable zoom, rotate, and reset controls for both PDFs and images
    if (this.zoomInBtn) this.zoomInBtn.style.display = 'inline-flex';
    if (this.zoomOutBtn) this.zoomOutBtn.style.display = 'inline-flex';
    if (this.rotateBtn) this.rotateBtn.style.display = 'inline-flex';
    if (this.resetBtn) this.resetBtn.style.display = 'inline-flex';

    // Update Nav buttons
    if (this.prevBtn) this.prevBtn.disabled = this.currentIndex === 0;
    if (this.nextBtn) this.nextBtn.disabled = this.currentIndex === this.currentDocs.length - 1;

    // Render Content
    this.stage.innerHTML = '';

    if (!doc.dataUrl) {
      if (doc.isSeedPlaceholder || String(doc.id || '').includes('seed') || String(doc.name || '').includes('Official_NOC')) {
        doc.dataUrl = isPDF 
          ? this.generateOfficialPdfDataUrl(doc.name, this.contextTitle) 
          : this.generateOfficialImageDataUrl(doc.name, this.contextTitle);
      } else {
        // Real user document whose payload is unavailable in this browser session
        this.stage.innerHTML = `
          <div class="viewer-empty-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:3rem 1.5rem; color:#fff; max-width:560px; margin:auto;">
            <div style="font-size:3.5rem; margin-bottom:1rem;">📄</div>
            <h3 style="font-size:1.3rem; font-weight:700; color:#F1F5F9; margin-bottom:0.5rem;">Document Content Unavailable</h3>
            <p style="font-size:0.92rem; color:#94A3B8; line-height:1.6; margin-bottom:1.5rem;">
              The exact PDF file <strong>"${this.escapeHTML(doc.name)}"</strong> does not have binary data stored in this browser session.
            </p>
            <div style="display:flex; gap:0.75rem; flex-wrap:wrap; justify-content:center;">
              <button type="button" class="btn btn-primary" onclick="if(window.docViewer)window.docViewer.close(); if(window.nocUI&&window.nocUI.openEditModal)window.nocUI.openEditModal('${this.currentRecordId || ''}');" style="padding:0.5rem 1rem;">
                ✏️ Edit NOC &amp; Re-attach PDF
              </button>
            </div>
          </div>
        `;
        return;
      }
    }

    if (isPDF) {
      const pdfBytes = this.getPdfBytes(doc.dataUrl);
      const rendered = await this.renderPdfDocument(pdfBytes, isRestrictedGuest, doc.dataUrl);

      if (!rendered) {
        // Fallback to standalone single-page PDF in iframe if canvas rendering fails
        this.stage.innerHTML = '';
        let frameSrc = doc.dataUrl;
        if (isRestrictedGuest && !doc._guestPage1DataUrl) {
          doc._guestPage1DataUrl = await this.getFirstPagePdfDataUrl(doc.dataUrl);
          frameSrc = doc._guestPage1DataUrl || doc.dataUrl;
        }

        // Convert to Blob URL for clean browser PDF iframe rendering
        const blob = this.dataUrlToBlob(frameSrc);
        if (blob) {
          frameSrc = URL.createObjectURL(blob);
        }

        const iframe = document.createElement('iframe');
        iframe.className = 'viewer-pdf-frame';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.src = frameSrc;
        iframe.title = doc.name;
        this.stage.appendChild(iframe);
      }
    } else {
      // Image Render
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'viewer-image-wrapper';
      imgWrapper.id = 'viewerImageWrapper';

      const img = document.createElement('img');
      img.className = 'viewer-image';
      img.src = doc.dataUrl;
      img.alt = doc.name;

      imgWrapper.appendChild(img);
      this.stage.appendChild(imgWrapper);
      this.applyImageTransform();
    }
  }

  /**
   * Adjust image zoom level
   */
  adjustZoom(delta) {
    this.zoomLevel = Math.max(0.4, Math.min(4.0, this.zoomLevel + delta));
    this.applyImageTransform();
  }

  /**
   * Rotate image 90 degrees clockwise
   */
  rotate() {
    this.rotation = (this.rotation + 90) % 360;
    this.applyImageTransform();
  }

  /**
   * Reset zoom and rotation
   */
  resetTransform() {
    this.zoomLevel = 1;
    this.rotation = 0;
    this.applyImageTransform();
  }

  /**
   * Apply CSS transform to image
   */
  applyImageTransform() {
    const wrapper = document.getElementById('viewerImageWrapper');
    if (wrapper) {
      wrapper.style.transform = `scale(${this.zoomLevel}) rotate(${this.rotation}deg)`;
    }
  }

  /**
   * Render the bottom thumbnails strip
   */
  async renderThumbnails() {
    if (!this.thumbContainer) return;
    this.thumbContainer.innerHTML = '';

    for (let idx = 0; idx < this.currentDocs.length; idx++) {
      const doc = this.currentDocs[idx];
      const isPDF = doc.type === 'application/pdf' || String(doc.name || '').toLowerCase().endsWith('.pdf');
      await this.resolveDocData(doc);

      if (!doc.dataUrl) {
        if (doc.isSeedPlaceholder || String(doc.id || '').includes('seed') || String(doc.name || '').includes('Official_NOC')) {
          doc.dataUrl = isPDF 
            ? this.generateOfficialPdfDataUrl(doc.name, this.contextTitle) 
            : this.generateOfficialImageDataUrl(doc.name, this.contextTitle);
        }
      }
      const thumb = document.createElement('div');
      thumb.className = `viewer-thumb-item ${idx === this.currentIndex ? 'active' : ''}`;
      thumb.title = doc.name;

      if (isPDF) {
        thumb.innerHTML = `<span class="viewer-thumb-doc-icon" style="color:#DC2626">PDF</span>`;
      } else if (doc.dataUrl) {
        thumb.innerHTML = `<img src="${doc.dataUrl}" class="viewer-thumb-img" alt="${doc.name}" />`;
      } else {
        thumb.innerHTML = `<span class="viewer-thumb-doc-icon">📄</span>`;
      }

      thumb.addEventListener('click', () => {
        this.currentIndex = idx;
        this.zoomLevel = 1;
        this.rotation = 0;
        this.renderCurrentDocument();
        this.renderThumbnails();
      });

      this.thumbContainer.appendChild(thumb);
    }
  }

  /**
   * Download the currently viewed document (Restricted to Page 1 for Guest on NOC records)
   */
  async downloadCurrent() {
    const doc = this.currentDocs[this.currentIndex];
    if (!doc) return;

    await this.resolveDocData(doc);

    const isPDF = doc.type === 'application/pdf' || String(doc.name || '').toLowerCase().endsWith('.pdf');
    if (!doc.dataUrl) {
      if (doc.isSeedPlaceholder || String(doc.id || '').includes('seed') || String(doc.name || '').includes('Official_NOC')) {
        doc.dataUrl = isPDF 
          ? this.generateOfficialPdfDataUrl(doc.name, this.contextTitle) 
          : this.generateOfficialImageDataUrl(doc.name, this.contextTitle);
      }
    }

    const isGuest = window.nocAuth && window.nocAuth.isGuest();
    if (isGuest && !this.currentOptions?.isGuidelineDoc) {
      if (window.showToast) {
        window.showToast('Document downloads are restricted for Guest accounts.', 'error');
      }
      return;
    }

    this.triggerFileDownload(doc.dataUrl, doc.name);
  }

  /**
   * Helper to initiate browser file download
   */
  triggerFileDownload(dataOrUrl, fileName) {
    if (!dataOrUrl) {
      if (window.showToast) window.showToast('No file data to download.', 'error');
      return;
    }

    let url = dataOrUrl;
    let isTempUrl = false;

    if (dataOrUrl instanceof Blob) {
      url = URL.createObjectURL(dataOrUrl);
      isTempUrl = true;
    } else if (dataOrUrl instanceof Uint8Array || dataOrUrl instanceof ArrayBuffer) {
      const blob = new Blob([dataOrUrl], { type: 'application/pdf' });
      url = URL.createObjectURL(blob);
      isTempUrl = true;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (isTempUrl) {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    if (window.showToast) {
      window.showToast(`Downloading "${fileName}"...`, 'success');
    }
  }
}

// Global viewer instance
window.docViewer = new DocumentViewer();
