## أحسنت — الخطوة الأولى تمت بنجاح

تم تحديث Nameservers إلى Cloudflare. الآن نحتاج إكمال الخطوات التالية لتفعيل وضع البروكسي.

## الخطوات التالية (بالترتيب)

### 1) التحقق من تفعيل النطاق على Cloudflare (خلال 1–24 ساعة)
- ادخل إلى حسابك على https://cloudflare.com
- ستظهر حالة النطاق `quboolye.com` كـ **Active** بعلامة خضراء عند اكتمال الانتشار
- يمكنك التحقق فوراً عبر: https://dnschecker.org/#NS/quboolye.com

### 2) ضبط سجلات DNS داخل Cloudflare
بعد التفعيل، افتح **DNS → Records** وتأكد من وجود:

```
Type  | Name | Content              | Proxy status
A     | @    | 185.158.133.1        | Proxied (سحابة برتقالية)
A     | www  | 185.158.133.1        | Proxied (سحابة برتقالية)
TXT   | _lovable | lovable_verify=... | DNS only
```

- إذا لم تُستورد السجلات تلقائياً، أضفها يدوياً
- **مهم جداً:** السحابة يجب أن تكون **برتقالية (Proxied)** لسجلات A — هذا هو سر الحل
- سجل TXT يبقى رمادياً (DNS only)

### 3) ضبط SSL/TLS في Cloudflare
- اذهب إلى **SSL/TLS → Overview**
- اختر وضع: **Full** (وليس Flexible ولا Full Strict)
- هذا ضروري لتفادي حلقة إعادة التوجيه مع شهادة Lovable

### 4) إعادة ربط النطاق في Lovable مع وضع Proxy
- في Lovable: **Project Settings → Domains**
- احذف الربط الحالي لـ `quboolye.com` و `www.quboolye.com`
- اضغط **Connect Domain** وأدخل `quboolye.com`
- وسّع قسم **Advanced** وفعّل:
  > ✅ **Domain uses Cloudflare or a similar proxy**
- كرر العملية لـ `www.quboolye.com`
- اتبع تعليمات Lovable لإضافة سجل CNAME الجديد للتحقق (سيعطيك قيمة مختلفة عن A record)

### 5) التحقق النهائي
- انتظر 5–15 دقيقة بعد إكمال الربط
- جرّب الفتح من جهازك: `https://quboolye.com`
- اطلب من العميد المحاولة — يجب أن يفتح الموقع الآن لأن الترافيك يمر عبر شبكة Cloudflare العالمية (IPs مختلفة غير محجوبة)

## ملاحظات مهمة

- **لا يوجد تعديل كود مطلوب** في هذه المرحلة
- رابط `saba-uni-portal.lovable.app` سيظل محجوباً عند العميد (لأنه على نطاق lovable.app مباشرة) — الحل يعمل فقط على `quboolye.com`
- إن واجهت مشكلة في خطوة معينة، أرسل لي صورة وسأرشدك

## بعد نجاح الوصول

أستطيع إضافة (اختياري):
- بانر صغير في صفحة الدخول للمستخدمين الذين يواجهون صعوبة في الوصول، مع نصائح سريعة (DNS، WARP)
- تثبيت رابط `quboolye.com` كرابط رسمي وحيد في كل المراسلات
