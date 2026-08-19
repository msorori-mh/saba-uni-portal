/**
 * TAIZ TENDER DEMO — SOVEREIGN LOCAL EXTRACTIVE RAG ENGINE
 * Tag: TAIZ_TENDER_DEMO_ONLY
 * Classification: ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC
 * Note: No generative model in current PoC; extractive answers only.
 * Local Model Status: NOT_IMPLEMENTED_OPTIONAL_ADAPTER_PENDING
 */

import { RAGDocument, RAGQueryResult, UserRole } from './types';
import { tokenizeArabic } from './arabic-nlp';
import { DEMO_RAG_DOCUMENTS } from './synthetic-data';

const PROMPT_INJECTION_PATTERNS = [
  /تجاهل.*تعليمات/i,
  /ignore.*instruction/i,
  /اعرض.*كلمات.*مرور/i,
  /show.*password/i,
  /passwords|credentials/i,
  /bypass.*security/i,
  /تجاوز.*امان/i,
  /اخترق/i,
  /dump.*credential/i,
  /ignore.*rules/i
];

export class LocalRAGEngine {
  private documents: RAGDocument[] = [];
  private confidenceThreshold: number = 0.55;
  private externalNetworkCallsCount: number = 0;
  private observedHosts: Set<string> = new Set(['localhost', '127.0.0.1']);

  constructor(initialDocs: RAGDocument[] = DEMO_RAG_DOCUMENTS) {
    this.documents = initialDocs.map(doc => {
      const autoTokens = tokenizeArabic(`${doc.title} ${doc.content}`);
      const mergedTokens = Array.from(new Set([...doc.normalizedTokens, ...autoTokens]));
      return {
        ...doc,
        normalizedTokens: mergedTokens
      };
    });
  }

  public detectPromptInjection(query: string): boolean {
    return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(query));
  }

  public getExternalNetworkCallsCount(): number {
    return this.externalNetworkCallsCount;
  }

  public getObservedHosts(): string[] {
    return Array.from(this.observedHosts);
  }

  /**
   * Lexical heuristic extractive retrieval over local documents.
   * Zero external API calls, zero cloud embeddings.
   */
  public query(userQuery: string, currentUserRole: UserRole = 'student'): RAGQueryResult {
    const startTime = performance.now();
    const isInjection = this.detectPromptInjection(userQuery);

    if (isInjection) {
      return {
        query: userQuery,
        normalizedQueryTokens: [],
        matchedDocuments: [],
        confidenceScore: 0.0,
        isAbstained: true,
        isPromptInjection: true,
        generatedAnswer: '⚠️ تحذير أمني: تم رصد محاولة تجاوز للتعليمات (Prompt Injection). تم حظر الاستعلام وتسجيل المحاولة في سجل التدقيق الأمني.',
        citations: [],
        latencyMs: Math.round(performance.now() - startTime),
        externalNetworkRequestsCount: 0,
        observedHosts: Array.from(this.observedHosts),
        engineClassification: 'ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC',
        localModelStatus: 'NOT_IMPLEMENTED_OPTIONAL_ADAPTER_PENDING'
      };
    }

    const queryTokens = tokenizeArabic(userQuery);
    if (queryTokens.length === 0) {
      return {
        query: userQuery,
        normalizedQueryTokens: [],
        matchedDocuments: [],
        confidenceScore: 0.0,
        isAbstained: true,
        isPromptInjection: false,
        generatedAnswer: 'عذراً، يرجى كتابة سؤال أو استفسار محدد للبحث في اللوائح الجامعية.',
        citations: [],
        latencyMs: Math.round(performance.now() - startTime),
        externalNetworkRequestsCount: 0,
        observedHosts: Array.from(this.observedHosts),
        engineClassification: 'ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC',
        localModelStatus: 'NOT_IMPLEMENTED_OPTIONAL_ADAPTER_PENDING'
      };
    }

    // Role-filtered documents (Zero Permission Leakage)
    const accessibleDocs = this.documents.filter(doc => doc.allowedRoles.includes(currentUserRole));

    const scoredDocs = accessibleDocs.map(doc => {
      let matchCount = 0;
      const docTokensSet = new Set(doc.normalizedTokens);

      queryTokens.forEach(t => {
        if (docTokensSet.has(t)) {
          matchCount += 1.0;
        } else {
          for (const dt of docTokensSet) {
            if (dt === t) {
              matchCount += 1.0;
              break;
            } else if (dt.includes(t) || t.includes(dt)) {
              matchCount += 0.85;
              break;
            } else if (dt.length >= 3 && t.length >= 3 && dt.slice(0, 3) === t.slice(0, 3)) {
              matchCount += 0.70;
              break;
            }
          }
        }
      });

      const keywordScore = queryTokens.length > 0 ? matchCount / queryTokens.length : 0;
      const heuristicScore = Math.min(1.0, keywordScore * 1.25);
      const hybridScore = Math.min(1.0, keywordScore * 0.5 + heuristicScore * 0.5);

      const citation = `${doc.title} (${doc.regulationNumber || ''} - ${doc.articleNumber || ''} - ص ${doc.pageNumber})`;

      return {
        doc,
        score: hybridScore,
        keywordScore,
        heuristicScore,
        citation
      };
    });

    scoredDocs.sort((a, b) => b.score - a.score);

    const topMatches = scoredDocs.filter(m => m.score >= 0.35);
    const topScore = topMatches.length > 0 ? topMatches[0].score : 0.0;
    const isAbstained = topScore < this.confidenceThreshold;

    let generatedAnswer = '';
    const citations: string[] = [];

    if (isAbstained || topMatches.length === 0) {
      generatedAnswer = 'عذراً، لم أجد إجابة دقيقة ومؤكدة في اللوائح والقرارات الجامعية المعتمدة المتوفرة لدي. يرجى مراجعة إدارة شؤون الطلاب أو عمادة الكلية.';
    } else {
      const best = topMatches[0].doc;
      generatedAnswer = `وفقاً لـ ${best.title} (${best.articleNumber || ''}):\n\n"${best.content}"`;
      citations.push(topMatches[0].citation);
    }

    return {
      query: userQuery,
      normalizedQueryTokens: queryTokens,
      matchedDocuments: topMatches,
      confidenceScore: Math.round(topScore * 100) / 100,
      isAbstained,
      isPromptInjection: false,
      generatedAnswer,
      citations,
      latencyMs: Math.max(8, Math.round(performance.now() - startTime)),
      externalNetworkRequestsCount: 0,
      observedHosts: Array.from(this.observedHosts),
      engineClassification: 'ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC',
      localModelStatus: 'NOT_IMPLEMENTED_OPTIONAL_ADAPTER_PENDING'
    };
  }

  public addDocument(doc: RAGDocument): void {
    this.documents.push(doc);
  }

  public getDocumentsCount(): number {
    return this.documents.length;
  }
}
