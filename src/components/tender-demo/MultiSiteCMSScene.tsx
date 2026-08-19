import React, { useState } from 'react';
import { TAIZ_COLLEGES } from '../../lib/tender-demo/synthetic-data';
import { DemoCollege, ContentStatus, DemoArticle } from '../../lib/tender-demo/types';

export const MultiSiteCMSScene: React.FC = () => {
  const [selectedCollege, setSelectedCollege] = useState<DemoCollege>(TAIZ_COLLEGES[0]);
  const [activeTab, setActiveTab] = useState<'sites' | 'editor' | 'seo'>('sites');

  const [article, setArticle] = useState<DemoArticle>({
    id: 'art-01',
    titleAr: 'افتتاح المؤتمر العلمي الدولي الثاني للعلوم الطبية والسريرية',
    titleEn: 'Opening of the 2nd International Medical & Clinical Conference',
    slug: 'international-medical-conference-2026',
    collegeId: selectedCollege.id,
    summaryAr: 'دشنت كلية الطب بجامعة تعز فعاليات المؤتمر العلمي بمشاركة 40 باحثاً دولياً.',
    contentAr: 'شهدت قاعة المؤتمرات الكبرى بجامعة تعز اليوم انطلاق أعمال المؤتمر الطبي الثاني، بحضور رئيس الجامعة وعمداء الكليات ونخبة من الأطباء والاستشاريين...',
    status: 'published',
    authorId: 'usr-faculty-01',
    authorName: 'د. صادق محمد الشميري',
    publishedAt: '2026-08-15T09:00:00Z',
    viewsCount: 1420,
    tags: ['مؤتمرات', 'طب', 'بحث علمي'],
    featuredImageAltAr: 'صورة منصة المؤتمر الطبي الثاني بجامعة تعز',
    seoTitleAr: 'المؤتمر الطبي الدولي بجامعة تعز 2026 | كلية الطب',
    seoDescriptionAr: 'تغطية شاملة لافتتاح المؤتمر العلمي الدولي الثاني بكلية الطب والعلوم الصحية بجامعة تعز.'
  });

  const handleStatusChange = (newStatus: ContentStatus) => {
    setArticle(prev => ({ ...prev, status: newStatus }));
  };

  return (
    <div className="space-y-6 text-slate-800" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-slate-900">1. منصة المواقع المتعددة (25 موقعاً فرعياً) — Multi-Site CMS</h2>
          <p className="text-sm text-slate-600">نواة برمجية موحدة تدير الموقع المؤسسي و 25 نطاقاً فرعياً للكليات والمراكز عبر Subdomain Router.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('sites')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'sites' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 border'}`}
          >
            مستكشف المواقع الـ 25
          </button>
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'editor' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 border'}`}
          >
            محرر دورة حياة المحتوى
          </button>
          <button
            onClick={() => setActiveTab('seo')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'seo' ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 border'}`}
          >
            معاينة محرك الـ SEO و Schema.org
          </button>
        </div>
      </div>

      {activeTab === 'sites' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 border rounded-xl p-4 bg-white shadow-sm max-h-[500px] overflow-y-auto">
            <h3 className="font-bold text-sm text-slate-700 mb-3">اختر الكلية أو المركز (25 موقعاً):</h3>
            <div className="space-y-2">
              {TAIZ_COLLEGES.map(col => (
                <button
                  key={col.id}
                  onClick={() => setSelectedCollege(col)}
                  className={`w-full text-right p-2.5 rounded-lg text-xs font-medium transition border flex items-center justify-between ${
                    selectedCollege.id === col.id ? 'bg-sky-50 border-sky-500 text-sky-950 font-bold' : 'hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <span>{col.nameAr}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{col.code}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 border rounded-xl p-6 bg-white shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: selectedCollege.themeColor }}>
                  {selectedCollege.code}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-2">{selectedCollege.nameAr}</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedCollege.nameEn}</p>
              </div>
              <div className="text-left">
                <span className="text-xs font-semibold text-slate-500 block">النطاق الفرعي المستقل:</span>
                <span className="text-sm font-bold text-sky-700 font-mono underline bg-sky-50 px-2.5 py-1 rounded border border-sky-200">
                  https://{selectedCollege.subdomain}
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">{selectedCollege.descriptionAr}</p>

            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-lg border">
                <span className="text-xs text-slate-500 block">البرامج الأكاديمية</span>
                <span className="text-lg font-bold text-slate-900">{selectedCollege.programsCount}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border">
                <span className="text-xs text-slate-500 block">الطلاب المسجلون</span>
                <span className="text-lg font-bold text-slate-900">{selectedCollege.studentsCount.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border">
                <span className="text-xs text-slate-500 block">هيئة التدريس</span>
                <span className="text-lg font-bold text-slate-900">{selectedCollege.facultyCount}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border">
                <span className="text-xs text-slate-500 block">سنة التأسيس</span>
                <span className="text-lg font-bold text-slate-900">{selectedCollege.establishedYear}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'editor' && (
        <div className="border rounded-xl p-6 bg-white shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-base text-slate-900">محرر دورة حياة المحتوى لـ ({selectedCollege.nameAr})</h3>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">حالة النشر:</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                article.status === 'published' ? 'bg-emerald-100 text-emerald-800' :
                article.status === 'review' ? 'bg-amber-100 text-amber-800' :
                article.status === 'approved' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
              }`}>
                {article.status}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">عنوان الخبر (عربي):</label>
              <input
                type="text"
                value={article.titleAr}
                onChange={e => setArticle({ ...article, titleAr: e.target.value })}
                className="w-full p-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">الملخص التنفيذي:</label>
              <textarea
                rows={2}
                value={article.summaryAr}
                onChange={e => setArticle({ ...article, summaryAr: e.target.value })}
                className="w-full p-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <span className="text-xs text-slate-500">انتقالات آلة الحالات (State Machine Actions):</span>
            <div className="flex gap-2">
              <button onClick={() => handleStatusChange('draft')} className="px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded hover:bg-slate-200">
                حفظ كمسودة (Draft)
              </button>
              <button onClick={() => handleStatusChange('review')} className="px-3 py-1.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded hover:bg-amber-200">
                إرسال للمراجعة (Review)
              </button>
              <button onClick={() => handleStatusChange('approved')} className="px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded hover:bg-blue-200">
                اعتماد رئيس القسم (Approved)
              </button>
              <button onClick={() => handleStatusChange('published')} className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700">
                نشر رسمي على النطاق (Publish)
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'seo' && (
        <div className="border rounded-xl p-6 bg-white shadow-sm space-y-4">
          <h3 className="font-bold text-base text-slate-900">محرك توليد بيانات Schema.org و JSON-LD التلقائي</h3>
          <p className="text-xs text-slate-600">يولد النظام تلقائياً بيانات وصفية هيكلية لتعزيز ترتيب جامعة تعز في تصنيف Webometrics ومحركات البحث العالمية.</p>
          <pre className="p-4 bg-slate-900 text-emerald-400 text-xs font-mono rounded-lg overflow-x-auto" dir="ltr">
{JSON.stringify({
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": article.titleAr,
  "inLanguage": "ar-YE",
  "publisher": {
    "@type": "CollegeOrUniversity",
    "name": "Taiz University - " + selectedCollege.nameEn,
    "url": "https://" + selectedCollege.subdomain
  },
  "author": {
    "@type": "Person",
    "name": article.authorName
  },
  "datePublished": article.publishedAt,
  "description": article.seoDescriptionAr,
  "mainEntityOfPage": "https://" + selectedCollege.subdomain + "/news/" + article.slug
}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
