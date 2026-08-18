# معمارية C4 التفصيلية ومخططات تدفق البيانات
## TAIZ-TENDER-03 — C4 ARCHITECTURAL MODEL & INTERACTION FLOWS

> **المواصفة:** مخططات C4 Architecture كاملة بصيغة Mermaid متوافقة 100% مع معايير العرض على GitHub دون استخدام أي وسوم HTML داخل المخططات.

---

## 1. المستوى 1: مخطط سياق المنظومة (System Context Diagram)

```mermaid
graph TD
    subgraph Users["المستخدمون وأصحاب المصلحة"]
        U_Stu["الطلاب والباحثون"]
        U_Fac["أعضاء هيئة التدريس"]
        U_Stf["الكادر الإداري والموظفون"]
        U_Pub["الجمهور والزوار"]
        U_Adm["مدراء المنصة ومحررو الكليات"]
    end

    subgraph Portal_System["منظومة الموقع الرسمي والبوابات والذكاء الاصطناعي لجامعة تعز"]
        Main_Portal["الموقع المركزي والـ 25 موقعاً فرعياً للكليات"]
        Core_Portals["البوابات الرقمية الموحدة (طالب، أكاديمي، موظف)"]
        Local_RAG["محرك الذكاء الاصطناعي والبحث الدلالي السيادي"]
    end

    subgraph External_Systems["الأنظمة الجامعية القائمة والخدمات الخارجية"]
        SIS_Legacy["نظام شؤون الطلاب القائم SIS"]
        HR_Legacy["نظام الموارد البشرية القائم"]
        Finance_Legacy["النظام المالي الجامعي"]
        Search_Engines["محركات البحث العالمية Google/IndexNow"]
    end

    U_Stu -->|تصفح وتقديم الطلبات وتتبع المعاملات| Core_Portals
    U_Fac -->|رصد الدرجات وإدارة المجالس والمشاريع| Core_Portals
    U_Stf -->|الخدمات الإدارية والمراسلات والإجازات| Core_Portals
    U_Pub -->|استعراض الأخبار واللوائح والدليل الأكاديمي| Main_Portal
    U_Adm -->|إدارة ونشر المحتوى وإعدادات الكليات| Main_Portal

    Core_Portals -->|استفسار ذكي واسترجاع لوائح موثقة| Local_RAG
    Core_Portals -->|استرجاع بيانات أكاديمية آمنة للقراءة| SIS_Legacy
    Core_Portals -->|استرجاع بيانات الموظفين والرواتب| HR_Legacy
    Core_Portals -->|التحقق من الرسوم المالية الخارجية| Finance_Legacy
    Main_Portal -->|فهرسة آلية لحظية وتحديث الخرائط| Search_Engines
```

---

## 2. المستوى 2: معمارية الحاويات (Container Architecture Diagram)

```mermaid
graph TD
    subgraph Client_Tier["طبقة العملاء والواجهات"]
        Browser["متصفح الويب Modern Web Browsers"]
        Mobile_App["تطبيق الهاتف PWA / Hybrid Wrapper"]
    end

    subgraph Edge_Tier["طبقة الحماية والتوجيه"]
        WAF["جدار حماية الويب WAF / Reverse Proxy"]
        API_GW["بوابة الواجهات المركزية API Gateway"]
    end

    subgraph App_Tier["طبقة التطبيقات والمنطق المؤسسي (Modular Monolith)"]
        Frontend_App["خادم الواجهات Next.js SSR / ISR"]
        Core_Backend["خادم الخدمات الخلفية Modular Monolith Backend"]
        Keycloak_IAM["خادم الهويات الموحد Keycloak SSO / MFA"]
        RAG_Service["محرك الذكاء الاصطناعي المحلي Python RAG Core"]
    end

    subgraph Data_Tier["طبقة البيانات والتخزين المحلي On-Premises"]
        Postgres_DB["قاعدة البيانات المركزية PostgreSQL 16"]
        Redis_Cluster["كلاستر التخزين المؤقت Redis Cluster"]
        MinIO_Storage["خادم التخزين السحابي المحلي MinIO S3"]
        Vector_DB["قاعدة البيانات المتجهية Qdrant / Milvus"]
    end

    Browser -->|HTTPS TLS 1.3| WAF
    Mobile_App -->|HTTPS TLS 1.3| WAF
    WAF -->|Reverse Proxy| Frontend_App
    WAF -->|API Requests| API_GW

    Frontend_App -->|Internal API Calls| API_GW
    API_GW -->|OIDC Validation| Keycloak_IAM
    API_GW -->|Secure REST/GraphQL| Core_Backend
    API_GW -->|Internal AI Inquiries| RAG_Service

    Core_Backend -->|SQL / RLS Security| Postgres_DB
    Core_Backend -->|Cache Sessions / Entities| Redis_Cluster
    Core_Backend -->|Signed Object Storage| MinIO_Storage

    RAG_Service -->|Hybrid Vector Search| Vector_DB
    RAG_Service -->|Fetch Policy Documents| MinIO_Storage
```

---

## 3. المستوى 3: معمارية المكونات الداخلية (Component Architecture)

```mermaid
graph TD
    subgraph Monolith_Core["النواة البرمجية الموحدة (Modular Monolith Architecture)"]
        IAM_Comp["موديول الهوية والصلاحيات IAM Module"]
        CMS_Comp["محرك إدارة المحتوى والمواقع الـ 25 Multi-Site Engine"]
        Student_Comp["موديول بوابة الطالب والخدمات الأكاديمية"]
        Faculty_Comp["موديول الكادر التدريسي والمجالس الأكاديمية"]
        Staff_Comp["موديول الخدمات الإدارية والموظفين"]
        Workflow_Comp["محرك آلة الحالات وسير العمل State Machine Engine"]
        Audit_Comp["محرك سجلات التدقيق والمراقبة Audit & Event Logger"]
        Integration_Comp["محرك التكامل وموصلات الـ Adapters"]
        Event_Bus["ناقل الأحداث الداخلي In-Process Event Bus"]
    end

    IAM_Comp -->|Publish User Lifecycle Events| Event_Bus
    CMS_Comp -->|Publish Content Published Events| Event_Bus
    Student_Comp -->|Execute Workflow Transitions| Workflow_Comp
    Faculty_Comp -->|Execute Decision Lifecycle| Workflow_Comp
    Staff_Comp -->|Submit Workflow Requests| Workflow_Comp

    Workflow_Comp -->|Log State Change Events| Audit_Comp
    Workflow_Comp -->|Trigger Async Integration| Integration_Comp
    Event_Bus -->|Deliver Domain Events| Audit_Comp
```

---

## 4. المستوى 4: معمارية النشر والبنية التشغيلية (Deployment Diagram)

```mermaid
graph TD
    subgraph OnPrem_DMZ["منطقة الشبكة المعزولة DMZ"]
        NGINX_LB["موزع الأحمال NGINX / Envoy HA Pair"]
    end

    subgraph K8s_Cluster["بيئة حاويات Kubernetes On-Premises"]
        subgraph Master_Nodes["عقد الإدارة والتحكم"]
            K8s_Control["K8s Control Plane HA"]
        end

        subgraph Worker_App_Nodes["عقد تشغيل التطبيقات"]
            Pod_Next["Next.js SSR Pods (Autoscaled 4-16)"]
            Pod_Backend["Backend Modular Pods (Autoscaled 4-16)"]
            Pod_Keycloak["Keycloak IAM Pods (2 Replicas)"]
        end

        subgraph Worker_GPU_Nodes["عقد الذكاء الاصطناعي السيادي"]
            Pod_RAG["Local LLM & Embedding Service (GPU Node)"]
            Pod_Vector["Qdrant Vector Cluster (2 Nodes)"]
        end
    end

    subgraph Data_Cluster["منطقة قواعد البيانات والتخزين الآمن"]
        DB_Primary["PostgreSQL 16 Primary Node"]
        DB_Standby["PostgreSQL 16 Standby Replica (Streaming)"]
        Redis_HA["Redis Sentinel HA Cluster (3 Nodes)"]
        MinIO_HA["MinIO Distributed Cluster (4 Disks)"]
    end

    NGINX_LB --> Pod_Next
    NGINX_LB --> Pod_Backend
    Pod_Backend --> DB_Primary
    DB_Primary -->|WAL Streaming Async/Sync| DB_Standby
    Pod_Backend --> Redis_HA
    Pod_Backend --> MinIO_HA
    Pod_RAG --> Pod_Vector
```

---

## 5. حدود الثقة ونطاقات الأمان (Trust Boundaries)

```mermaid
graph TD
    subgraph Trust_Zone_0["المنطقة العامة Zone 0 (Untrusted Public Web)"]
        Internet_Users["مستخدمو الإنترنت والعموم"]
    end

    subgraph Trust_Zone_1["منطقة الحافة والمحيط Zone 1 (DMZ / Edge)"]
        Edge_WAF["WAF & SSL Termination (TLS 1.3 Strict)"]
    end

    subgraph Trust_Zone_2["منطقة التطبيقات المعتمدة Zone 2 (App Fabric)"]
        App_Fabric["Next.js, Backend Monolith, Keycloak"]
    end

    subgraph Trust_Zone_3["منطقة البيانات الحساسة Zone 3 (Secure Data Core)"]
        Secure_Data["PostgreSQL with RLS, Encrypted Storage, KMS"]
    end

    subgraph Trust_Zone_4["منطقة الذكاء الاصطناعي السيادية Zone 4 (AI Sovereign Enclave)"]
        Sovereign_AI["Local LLM, Vector DB, No-Internet Isolation"]
    end

    subgraph Trust_Zone_5["منطقة الأنظمة القائمة المعزولة Zone 5 (Legacy Isolated Net)"]
        Legacy_SIS_Net["Legacy SIS, HR, Finance via Read-Only Connectors"]
    end

    Internet_Users -->|HTTPS Inspection| Edge_WAF
    Edge_WAF -->|mTLS / Authenticated| App_Fabric
    App_Fabric -->|Encrypted DB Connections| Secure_Data
    App_Fabric -->|Internal Isolated gRPC| Sovereign_AI
    App_Fabric -->|Firewall Restricted Connector| Legacy_SIS_Net
```

---

## 6. مخططات تدفق العمليات الحساسة (Interaction Flows)

### 6.1 تدفق تسجيل الدخول الموحد والمصادقة الثنائية (SSO / MFA Login Flow)
```mermaid
sequenceDiagram
    autonumber
    actor User as المستخدم (طالب / أكاديمي / موظف)
    participant Client as متصفح الويب / البوابة
    participant GW as API Gateway
    participant IAM as خادم Keycloak IAM
    participant MFA as محرك التحقق MFA
    participant Monolith as النواة البرمجية Backend

    User->>Client: طلب تسجيل الدخول
    Client->>GW: توجيه الطلب إلى نقطة الدخول
    GW->>IAM: إعادة التوجيه لبروتوكول OIDC Authorization Flow
    IAM->>User: عرض شاشة إدخال اسم المستخدم وكلمة المرور
    User->>IAM: إرسال بيانات الدخول المشفرة
    IAM->>IAM: التحقق من صحة كلمة المرور وسياسات الحساب

    alt الحساب يتطلب مصادقة ثنائية MFA (أكاديمي / إداري / صلاحيات حساسة)
        IAM->>MFA: توليد رمز التحقق وإرساله / طلب TOTP
        MFA->>User: طلب إدخال رمز التحقق OTP
        User->>MFA: إدخال رمز التحقق
        MFA->>IAM: تأكيد اجتياز الـ MFA
    end

    IAM->>Client: إصدار Access Token (JWT) و Refresh Token المشفر
    Client->>GW: استدعاء الخدمة مع إرفاق Bearer JWT Token
    GW->>GW: التحقق من التوقيع الرقمي والصلاحيات وتحديد معدل الطلب
    GW->>Monolith: تمرير الطلب الموثق مع بيانات الهوية والصلاحيات
    Monolith->>Client: إرجاع لوحة المستخدم المخصصة وفق الدور المصرح
```

---

### 6.2 تدفق تقديم واعتماد خدمة أكاديمية عبر بوابة التكامل (Academic Workflow Flow)
```mermaid
sequenceDiagram
    autonumber
    actor Student as الطالب
    participant Portal as بوابة الطالب
    participant GW as API Gateway
    participant Backend as النواة البرمجية Backend
    participant ACL as طبقة موصلات الأنظمة القائمة ACL
    participant Legacy_SIS as نظام شؤون الطلاب SIS
    actor Advisor as المرشد الأكاديمي / العميد

    Student->>Portal: تقديم طلب إيقاف قيد / عذر غياب
    Portal->>GW: إرسال الطلب (POST /api/v1/requests) مع Idempotency-Key
    GW->>Backend: تمرير الطلب الموثق
    Backend->>Backend: التحقق من الأهلية وقواعد العمل (Business Rules)
    Backend->>ACL: استعلام بيانات القيد والرسوم الحالية من SIS
    ACL->>Legacy_SIS: استعلام آمن للقراءة فقط (Read-Only Query)
    Legacy_SIS-->>ACL: إرجاع السجل الأكاديمي وحالة القيد
    ACL-->>Backend: تحويل البيانات للنموذج الموحد (Canonical Model)
    Backend->>Backend: تسجيل الطلب بحالة (PENDING_REVIEW) وتوليد سجل التدقيق
    Backend-->>Portal: إشعار الطالب بنجاح التقديم ورقم التتبع

    Backend->>Advisor: إرسال إشعار للمرشد بالطلب المعلق
    Advisor->>Backend: مراجعة الطلب واعتماده (APPROVE) مع التوقيع الرقمي
    Backend->>Backend: انتقال الحالة إلى (APPROVED) وتوليد وثيقة إلكترونية بـ QR
    Backend->>Student: إشعار فوري عبر البريد/البوابة باعتماد الطلب
```

---

### 6.3 تدفق استعلام المساعد الذكي مع الاستشهاد ومنع الهلوسة (Sovereign RAG Flow)
```mermaid
sequenceDiagram
    autonumber
    actor User as المستخدم (طالب / مستفسر)
    participant Client as واجهة المساعد الذكي
    participant GW as API Gateway
    participant Guard as فلتر الأمان Guardrails
    participant NLP as موديول المعالجة الصرفية Farasa
    participant VectorDB as قاعدة البيانات المتجهية Qdrant
    participant Local_LLM as محرك التوليد المحلي Local LLM

    User->>Client: طرح سؤال: "ما هي شروط إيقاف القيد ورسومه في كلية الطب؟"
    Client->>GW: إرسال الاستفسار (POST /api/v1/ai/chat)
    GW->>Guard: فحص المدخلات ضد هجمات Prompt Injection وتطهير PII
    Guard->>NLP: تنقية وتجذير الكلمات العربية واستخراج المفاهيم الدلالية
    NLP->>VectorDB: تنفيذ بحث هجين (BM25 + Dense Vector عبر خوارزمية RRF)
    VectorDB-->>NLP: إرجاع أفضل الفقرات المطابقة مع درجة الثقة والـ Metadata

    alt درجة الثقة أقل من عتبة القبول (< 0.75) أو لا توجد مصادر مطابقة
        NLP-->>Client: الامتناع الصريح: "عذراً، المعلومة غير متوفرة باللوائح المعتمدة"
    else درجة الثقة مقبولة وتوجد مصادر مؤكدة
        NLP->>Local_LLM: بناء الـ Context المدعم بأرقام اللوائح والفقرات فقط
        Local_LLM->>Local_LLM: توليد الإجابة محلياً بالإسناد الحصري للمصدر
        Local_LLM->>Guard: فحص الإجابة ضد الهلوسة والتأكد من تطابق المصدر
        Guard-->>Client: إرجاع الإجابة مع رابط الفقرة والوثيقة الرسمية للاستشهاد
    end
```
