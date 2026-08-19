import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية | ITCS Portal" },
      {
        name: "description",
        content:
          "سياسة الخصوصية لتطبيق ITCS Portal والبوابة الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب بجامعة إقليم سبأ.",
      },
    ],
  }),
  component: PrivacyPage,
});

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="border-r-4 border-gold pr-3 font-display text-xl font-extrabold text-primary">
      {title}
    </h2>
    <div className="mt-3 leading-8 text-foreground/80">{children}</div>
  </section>
);

function PrivacyPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-muted/30 py-10">
      <article className="container mx-auto max-w-4xl rounded-2xl border border-border bg-card px-5 py-8 shadow-card sm:px-10">
        <header className="border-b border-border pb-6">
          <p className="text-sm font-bold text-gold">ITCS Portal</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-primary sm:text-4xl">سياسة الخصوصية</h1>
          <p className="mt-2 text-muted-foreground">كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ</p>
          <p className="mt-3 text-sm text-muted-foreground">تاريخ النفاذ وآخر تحديث: 19 أغسطس 2026</p>
        </header>

        <p className="mt-6 rounded-xl border border-gold/30 bg-gold/10 p-4 leading-8">
          توضح هذه السياسة كيفية جمع بيانات مستخدمي تطبيق ITCS Portal والبوابة الإلكترونية واستخدامها وحمايتها.
        </p>

        <Section title="1. الجهة المسؤولة">
          <p>كلية تكنولوجيا المعلومات وعلوم الحاسوب بجامعة إقليم سبأ هي الجهة المسؤولة عن تشغيل التطبيق ومعالجة البيانات الأكاديمية والإدارية المرتبطة به وفق الأنظمة والسياسات الجامعية المعتمدة.</p>
        </Section>

        <Section title="2. البيانات التي نعالجها">
          <ul className="list-disc space-y-2 pr-6">
            <li>بيانات الهوية الجامعية، ومنها الاسم والبريد الجامعي والرقم الأكاديمي والبرنامج والقسم والمستوى والحالة الأكاديمية.</li>
            <li>بيانات التواصل التي يقدمها المستخدم، مثل رقم الهاتف عند توفره.</li>
            <li>السجل والخدمات الأكاديمية، مثل الدرجات والخطة والجدول والمواد والتقارير.</li>
            <li>الطلبات والوثائق والمرفقات وحالات المعالجة والإشعارات المرتبطة بالخدمات الطلابية.</li>
            <li>بيانات تقنية وأمنية لازمة لتسجيل الدخول وحماية الجلسة وتشخيص الأخطاء ومنع الاستخدام غير المصرح.</li>
          </ul>
        </Section>

        <Section title="3. أغراض الاستخدام">
          <ul className="list-disc space-y-2 pr-6">
            <li>التحقق من هوية المستخدم وتمكينه من الوصول إلى حسابه الجامعي.</li>
            <li>تقديم الخدمات الأكاديمية والإدارية وعرض البيانات الخاصة بالطالب.</li>
            <li>إرسال الإشعارات المتعلقة بالطلبات والوثائق والخدمات الجامعية.</li>
            <li>حماية الحسابات ومنع إساءة الاستخدام وتحسين موثوقية التطبيق.</li>
            <li>الوفاء بالالتزامات النظامية والسجلات الأكاديمية المعتمدة لدى الجامعة.</li>
          </ul>
        </Section>

        <Section title="4. مشاركة البيانات">
          <p>لا نبيع البيانات الشخصية ولا نستخدمها للإعلانات. يقتصر الاطلاع عليها على المستخدم والموظفين وأعضاء هيئة التدريس المخولين بحسب الصلاحيات، ومزودي البنية التحتية التقنية اللازمين لتشغيل الخدمة وحمايتها، أو عند وجود التزام نظامي.</p>
        </Section>

        <Section title="5. الأمان والتخزين">
          <p>نستخدم اتصال HTTPS وضوابط وصول وصلاحيات مقيّدة لحماية البيانات أثناء النقل والتخزين. تُحفظ البيانات طوال المدة اللازمة لتقديم الخدمات والاحتفاظ بالسجلات الأكاديمية والامتثال للسياسات الجامعية، ثم تُحذف أو تُؤرشف وفق المتطلبات المعتمدة.</p>
        </Section>

        <Section title="6. البصمة والتحقق على الجهاز">
          <p>إذا فعّل المستخدم قفل التطبيق بالبصمة أو بوسيلة تحقق الجهاز، تتم عملية التحقق بواسطة نظام تشغيل الهاتف. لا يجمع التطبيق صورة البصمة أو قالبها الحيوي ولا يرسل البيانات الحيوية إلى خوادم البوابة.</p>
        </Section>

        <Section title="7. حقوق المستخدم وطلبات التصحيح أو الحذف">
          <p>يمكن للمستخدم طلب الاطلاع على بيانات التواصل أو تصحيحها، أو الاستفسار عن حذف البيانات غير الملزمة أكاديميًا أو نظاميًا. قد يتعذر حذف بعض بيانات الحساب أو السجلات الأكاديمية التي يجب على الجامعة الاحتفاظ بها.</p>
        </Section>

        <Section title="8. الأطفال">
          <p>التطبيق مخصص لطلاب التعليم الجامعي وأصحاب الحسابات الجامعية المعتمدة، وليس موجهًا للأطفال، ولا يتم إنشاء حسابات عامة من داخل التطبيق.</p>
        </Section>

        <Section title="9. التغييرات على السياسة">
          <p>قد نحدّث هذه السياسة عند تطوير الخدمات أو تغير المتطلبات. يُنشر تاريخ آخر تحديث في هذه الصفحة وتصبح التعديلات نافذة عند نشرها.</p>
        </Section>

        <Section title="10. التواصل">
          <p>
            للاستفسارات المتعلقة بالخصوصية أو الحساب، تواصل عبر البريد{" "}
            <a className="font-bold text-primary underline" href="mailto:support@it.saba.edu.ye">support@it.saba.edu.ye</a>
            {" "}أو عبر <a className="font-bold text-primary underline" href="/contact">صفحة التواصل</a>.
          </p>
        </Section>

        <a href="/" className="mt-10 inline-flex rounded-md bg-primary px-5 py-3 font-bold text-primary-foreground hover:bg-primary-deep">
          العودة إلى الموقع الرئيسي
        </a>
      </article>
    </main>
  );
}
