import { describe, it, expect } from "bun:test";
import { normalizeArabicText, stemArabicWord, tokenizeArabic } from "@/lib/tender-demo/arabic-nlp";

describe("Taiz Tender Demo — Arabic NLP & Morphology Pipeline", () => {
  it("normalizes diverse Arabic character variants and diacritics", () => {
    const raw = "أَحْمَدُ إِبْرَاهِيم فِي كُلِّيَّةِ الْهَنْدَسَةِ وَتَقْنِيَّةِ الْمَعْلُومَاتِ";
    const normalized = normalizeArabicText(raw);
    expect(normalized).toBe("احمد ابراهيم في كليه الهندسه وتقنيه المعلومات");
  });

  it("stems common Arabic prefixes correctly", () => {
    expect(stemArabicWord("الجامعة")).toBe("جامعه");
    expect(stemArabicWord("واللوائح")).toBe("لوائح");
    expect(stemArabicWord("بالتظلمات")).toBe("تظلم");
  });

  it("stems common Arabic suffixes correctly", () => {
    expect(stemArabicWord("تظلمات")).toBe("تظلم");
    expect(stemArabicWord("معلمون")).toBe("معلم");
    expect(stemArabicWord("مهندسين")).toBe("مهندس");
    expect(stemArabicWord("حقوقهم")).toBe("حقوق");
  });

  it("tokenizes and filters Arabic stopwords", () => {
    const query = "ما هي شروط إيقاف القيد في كلية الطب؟";
    const tokens = tokenizeArabic(query);
    expect(tokens).toContain("شروط");
    expect(tokens).toContain("ايقاف");
    expect(tokens).toContain("قيد");
    expect(tokens).toContain("طب");
    expect(tokens).not.toContain("في");
    expect(tokens).not.toContain("ما");
    expect(tokens).not.toContain("هي");
  });
});
