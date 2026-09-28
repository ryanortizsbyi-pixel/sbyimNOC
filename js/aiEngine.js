/**
 * SBYIM AI Assistant - Core Grounded RAG & Inference Engine
 * 
 * Strict Core Rule:
 * The AI must answer users using ONLY information retrieved from the documents
 * uploaded and approved under the knowledge category:
 * 1. AI Documents
 * 
 * Do NOT use any file outside the uploaded and approved documents belonging to this category.
 */

class SBYIM_AI_Engine {
  constructor() {
    this.fallbackMessage = "I could not find this information in the approved AI Documents.";
    this.stopWords = new Set([
      'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
      'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
      'can', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
      'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
      'i', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'its', 'itself',
      'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself',
      'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
      'same', 'shan\'t', 'she', 'should', 'shouldn\'t', 'so', 'some', 'such',
      'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
      'under', 'until', 'up', 'very',
      'was', 'wasn\'t', 'we', 'were', 'weren\'t', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'won\'t', 'would', 'wouldn\'t',
      'you', 'your', 'yours', 'yourself', 'yourselves', 'please', 'tell', 'give', 'know'
    ]);
  }

  /**
   * Tokenizes and normalizes text into meaningful search terms
   */
  tokenize(text) {
    if (!text) return [];
    const normalized = text.toLowerCase()
      .replace(/[\.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized.split(' ').filter(w => w.length > 1 && !this.stopWords.has(w));
  }

  /**
   * Main Query Execution Pipeline
   * @param {string} userQuery - The user question
   * @param {string} categoryFilter - 'all' or 'AI Documents'
   * @returns {Promise<Object>} - Formatted response with answerText, isFound, sources
   */
  async ask(userQuery, categoryFilter = 'AI Documents') {
    if (!userQuery || !userQuery.trim()) {
      return {
        answerText: this.fallbackMessage,
        isFound: false,
        sources: []
      };
    }

    const trimmedQuery = userQuery.trim();

    // Ensure knowledge base is synced
    if (!window.sbyimKnowledgeBase || !window.sbyimKnowledgeBase.isIndexed) {
      if (window.sbyimKnowledgeBase) {
        await window.sbyimKnowledgeBase.syncKnowledgeBase();
      }
    }

    const allSections = window.sbyimKnowledgeBase ? window.sbyimKnowledgeBase.getAllSections() : [];
    if (!allSections || allSections.length === 0) {
      return {
        answerText: this.fallbackMessage,
        isFound: false,
        sources: []
      };
    }

    // Core Rule: Retrieve strictly from approved "AI Documents" category
    let candidateSections = allSections.filter(s => 
      (s.category || '').toLowerCase() === 'ai documents'
    );

    if (candidateSections.length === 0) {
      return {
        answerText: this.fallbackMessage,
        isFound: false,
        sources: []
      };
    }

    // Perform strict multi-factor RAG scoring on AI Documents
    const scoredResults = this.scoreSections(trimmedQuery, candidateSections);

    // Filter by confidence threshold
    const topMatches = scoredResults.filter(r => r.score >= 10);

    if (topMatches.length === 0) {
      return {
        answerText: this.fallbackMessage,
        isFound: false,
        sources: []
      };
    }

    // Verify information sufficiency
    const bestMatch = topMatches[0];
    const isSufficient = this.verifyInformationSufficiency(trimmedQuery, bestMatch);

    if (!isSufficient) {
      return {
        answerText: this.fallbackMessage,
        isFound: false,
        sources: []
      };
    }

    // Synthesize structured, professional, grounded answer from AI Documents
    const synthesized = this.synthesizeAnswer(trimmedQuery, topMatches);

    return {
      answerText: synthesized.text,
      isFound: true,
      sources: synthesized.sources
    };
  }

  /**
   * Scores all document sections against the user's query
   */
  scoreSections(query, sections) {
    const queryLower = query.toLowerCase();
    const queryTokens = this.tokenize(query);
    const results = [];

    for (const sec of sections) {
      let score = 0;
      const contentLower = (sec.content || '').toLowerCase();
      const titleLower = (sec.sectionTitle || '').toLowerCase();
      const filenameLower = (sec.filename || '').toLowerCase();

      // 1. Exact query substring match in content (+50) or title (+35)
      if (contentLower.includes(queryLower)) {
        score += 50;
      }
      if (titleLower.includes(queryLower)) {
        score += 35;
      }

      // 2. Multi-word phrase matches (pairs of consecutive query tokens)
      for (let i = 0; i < queryTokens.length - 1; i++) {
        const phrase = `${queryTokens[i]} ${queryTokens[i + 1]}`;
        if (contentLower.includes(phrase)) {
          score += 25;
        }
      }

      // 3. Section Title and filename match bonus
      for (const token of queryTokens) {
        if (titleLower.includes(token)) {
          score += 20;
        }
        if (filenameLower.includes(token)) {
          score += 15;
        }
      }

      // 4. Keyword and Token Overlap (TF-IDF style)
      let matchedTokens = 0;
      for (const token of queryTokens) {
        if (sec.keywords && sec.keywords.some(k => k.includes(token) || token.includes(k))) {
          score += 15;
          matchedTokens++;
        } else if (contentLower.includes(token)) {
          score += 10;
          matchedTokens++;
        }
      }

      // Bonus if majority of significant query tokens are present
      const ratio = queryTokens.length > 0 ? (matchedTokens / queryTokens.length) : 0;
      if (ratio >= 0.5) {
        score += 20;
      }

      // Target-specific schedule boosting / penalization
      const isQueryRoRo = queryLower.includes('roro') || queryLower.includes('ro-ro') || queryLower.includes('ro ro') || queryLower.includes('delma') || queryLower.includes('cargo') || queryLower.includes('roll-on') || queryLower.includes('roll on');
      const isQueryWaterTaxi = queryLower.includes('water taxi') || (queryLower.includes('taxi') && !isQueryRoRo);
      const isQueryPassengerFerry = queryLower.includes('passenger') || (queryLower.includes('ferry') && !isQueryWaterTaxi && !isQueryRoRo) || (queryLower.includes('boat') && !isQueryWaterTaxi && !isQueryRoRo);

      if (isQueryRoRo) {
        if (titleLower.includes('roro') || titleLower.includes('ro-ro') || titleLower.includes('ro ro') || titleLower.includes('delma') || titleLower.includes('cargo') || contentLower.includes('roro') || contentLower.includes('ro-ro') || contentLower.includes('delma')) {
          score += 70;
        }
        if (titleLower.includes('water taxi') || titleLower.includes('passenger')) {
          score -= 50;
        }
      } else if (isQueryWaterTaxi) {
        if (titleLower.includes('water taxi') || contentLower.includes('water taxi')) {
          score += 70;
        }
        if (titleLower.includes('passenger') || titleLower.includes('roro') || titleLower.includes('ro-ro') || titleLower.includes('delma')) {
          score -= 50;
        }
      } else if (isQueryPassengerFerry) {
        if (titleLower.includes('passenger') || (titleLower.includes('ferry') && !titleLower.includes('water') && !titleLower.includes('ro-ro') && !titleLower.includes('roro')) || titleLower.includes('boat')) {
          score += 70;
        }
        if (titleLower.includes('water taxi') || titleLower.includes('roro') || titleLower.includes('ro-ro') || titleLower.includes('delma')) {
          score -= 50;
        }
      }

      if (score > 0) {
        results.push({
          section: sec,
          score: score,
          matchedTokensRatio: ratio
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Verifies if the matched context genuinely covers the question asked
   */
  verifyInformationSufficiency(query, topMatch) {
    if (!topMatch || !topMatch.section) return false;
    const queryLower = query.toLowerCase();
    const contentLower = (topMatch.section.content || '').toLowerCase();
    const titleLower = (topMatch.section.sectionTitle || '').toLowerCase();

    // Exact substring match
    if (contentLower.includes(queryLower) || titleLower.includes(queryLower)) {
      return true;
    }

    // High token overlap
    if (topMatch.matchedTokensRatio >= 0.4 && topMatch.score >= 18) {
      return true;
    }

    return topMatch.score >= 25;
  }

  /**
   * Synthesizes a factual answer directly preserving the exact text from the original uploaded document.
   * Isolates the specific requested topic/schedule without including other schedules.
   */
  synthesizeAnswer(query, matches) {
    const primaryMatch = matches[0];
    const sec = primaryMatch.section;

    // Collect relevant source document
    const sources = [{
      category: sec.category,
      filename: sec.filename,
      docId: sec.docId,
      sectionTitle: sec.sectionTitle,
      snippet: sec.content.length > 180 ? sec.content.substr(0, 180) + '...' : sec.content
    }];

    let rawContent = sec.content;

    // Isolate strictly the requested schedule if chunk has multiple schedules
    rawContent = this.isolateRequestedSchedule(rawContent, query);

    const cleanAnswer = this.cleanAnswerText(rawContent);

    return {
      text: cleanAnswer,
      sources: sources
    };
  }

  /**
   * If text contains multiple schedules (e.g. Ferry, Water Taxi, RORO), isolate only the queried schedule.
   */
  isolateRequestedSchedule(content, query) {
    if (!content) return '';
    const qLower = query.toLowerCase();

    const isRoRo = qLower.includes('roro') || qLower.includes('ro-ro') || qLower.includes('ro ro') || qLower.includes('delma') || qLower.includes('cargo') || qLower.includes('roll-on') || qLower.includes('roll on');
    const isWaterTaxi = qLower.includes('water taxi') || (qLower.includes('taxi') && !isRoRo);
    const isPassengerFerry = qLower.includes('passenger ferry') || qLower.includes('passenger boat') || (qLower.includes('passenger') && qLower.includes('schedule')) || (qLower.includes('ferry') && !isWaterTaxi && !isRoRo) || (qLower.includes('boat') && !isWaterTaxi && !isRoRo);

    if (!isWaterTaxi && !isPassengerFerry && !isRoRo) {
      return content;
    }

    // Split content by header lines starting with ≡ or # or schedule headers
    const lines = content.split(/\r?\n/);
    const sections = [];
    let currentSec = [];
    let currentHeader = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const isHeader = /^[≡#]/.test(trimmed) || 
                       (/schedule/i.test(trimmed) && trimmed.length < 60 && !trimmed.startsWith('Trip') && !trimmed.startsWith('Operating') && !trimmed.startsWith('From'));

      if (isHeader) {
        if (currentSec.length > 0) {
          sections.push({ header: currentHeader, text: currentSec.join('\n').trim() });
          currentSec = [];
        }
        currentHeader = trimmed;
      }
      currentSec.push(line);
    }

    if (currentSec.length > 0) {
      sections.push({ header: currentHeader, text: currentSec.join('\n').trim() });
    }

    if (sections.length > 1) {
      for (const s of sections) {
        const hLower = s.header.toLowerCase();
        const tLower = s.text.toLowerCase();

        if (isRoRo && (hLower.includes('roro') || hLower.includes('ro-ro') || hLower.includes('ro ro') || hLower.includes('delma') || hLower.includes('cargo') || tLower.includes('roro') || tLower.includes('ro-ro') || tLower.includes('delma'))) {
          return s.text;
        }
        if (isWaterTaxi && (hLower.includes('water taxi') || tLower.includes('water taxi') || hLower.includes('taxi'))) {
          return s.text;
        }
        if (isPassengerFerry && (hLower.includes('passenger') || (hLower.includes('ferry') && !hLower.includes('water') && !hLower.includes('ro-ro') && !hLower.includes('roro')) || hLower.includes('boat'))) {
          return s.text;
        }
      }
    }

    return content;
  }

  /**
   * Cleans text preserving original document structure, lines, and formatting without injecting artificial bullets
   */
  cleanAnswerText(content) {
    if (!content) return '';
    let text = content.trim();

    // 1. Clean up raw page markers
    text = text.replace(/\[Page\s*\d+\]/gi, '').trim();

    // 2. Normalize line breaks and remove excessive empty lines
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }
}

window.SBYIM_AI_Engine = SBYIM_AI_Engine;
window.sbyimAIEngine = new SBYIM_AI_Engine();

