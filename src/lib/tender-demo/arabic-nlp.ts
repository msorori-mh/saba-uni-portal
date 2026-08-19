/**
 * TAIZ TENDER DEMO — ARABIC NLP & MORPHOLOGY PIPELINE
 * Tag: TAIZ_TENDER_DEMO_ONLY
 * Light-weight, high-precision Arabic text normalization and morphological stemming.
 */

const ARABIC_STOPWORDS = new Set([
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'تم', 'كان', 'يكون', 'التي', 'الذي',
  'الذين', 'هو', 'هي', 'أن', 'إن', 'ما', 'لا', 'لم', 'لن', 'ثم', 'أو', 'كل', 'بين', 'خلال',
  'ذلك', 'حيث', 'وقد', 'فقد', 'كذلك', 'بما', 'إذا', 'حتى', 'غير', 'قبل', 'بعد', 'عند', 'كم'
]);

export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
    .replace(/\u0649/g, 'ي')
    .replace(/\u0629/g, 'ه')
    .replace(/[^\u0621-\u064Aa-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function stemArabicWord(word: string): string {
  if (word.length <= 2) return word;

  let stem = normalizeArabicText(word);

  // Prefix stripping
  if (stem.startsWith('وال') && stem.length >= 5) {
    stem = stem.slice(3);
  } else if (stem.startsWith('فال') && stem.length >= 5) {
    stem = stem.slice(3);
  } else if (stem.startsWith('بال') && stem.length >= 5) {
    stem = stem.slice(3);
  } else if (stem.startsWith('ال') && stem.length >= 4) {
    stem = stem.slice(2);
  } else if (stem.startsWith('لل') && stem.length >= 4) {
    stem = stem.slice(2);
  }

  // Suffix stripping
  if (stem.endsWith('ات') && stem.length >= 4) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('ون') && stem.length >= 4) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('ين') && stem.length >= 4) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('هم') && stem.length >= 4) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('ها') && stem.length >= 4) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('يه') && stem.length >= 4) {
    stem = stem.slice(0, -2);
  }

  return stem;
}

export function tokenizeArabic(text: string): string[] {
  const normalized = normalizeArabicText(text);
  const words = normalized.split(/\s+/).filter(w => w.length >= 2 && !ARABIC_STOPWORDS.has(w));
  return words.map(stemArabicWord);
}
