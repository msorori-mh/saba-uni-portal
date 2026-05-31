import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});

type SettingRow = { setting_key: string; setting_value: string | null; setting_group: string };

type FieldDef = {
  key: string;
  group: string;
  label: string;
  type?: "text" | "textarea" | "email";
  placeholder?: string;
  dir?: "ltr" | "rtl";
};

const FIELDS: FieldDef[] = [
  // general
  { key: "site_name_ar", group: "general", label: "اسم الكلية (عربي)" },
  { key: "site_name_en", group: "general", label: "اسم الكلية (إنجليزي)", dir: "ltr" },
  { key: "university_name_ar", group: "general", label: "اسم الجامعة (عربي)" },
  { key: "university_name_en", group: "general", label: "اسم الجامعة (إنجليزي)", dir: "ltr" },
  { key: "portal_link", group: "general", label: "رابط البوابة", dir: "ltr" },
  // contact
  { key: "contact_email", group: "contact", label: "البريد الرسمي", type: "email", dir: "ltr" },
  { key: "contact_phone", group: "contact", label: "رقم الهاتف", dir: "ltr" },
  { key: "contact_address", group: "contact", label: "العنوان", type: "textarea" },
  { key: "map_embed_url", group: "contact", label: "رابط الخريطة (Embed)", dir: "ltr" },
  // social
  { key: "facebook_url", group: "social", label: "فيسبوك", dir: "ltr" },
  { key: "twitter_url", group: "social", label: "تويتر / X", dir: "ltr" },
  { key: "linkedin_url", group: "social", label: "لينكدإن", dir: "ltr" },
  { key: "youtube_url", group: "social", label: "يوتيوب", dir: "ltr" },
  // about
  { key: "dean_name", group: "about", label: "اسم العميد" },
  { key: "dean_title", group: "about", label: "صفة العميد" },
  { key: "dean_message", group: "about", label: "كلمة العميد", type: "textarea" },
  { key: "vision", group: "about", label: "الرؤية", type: "textarea" },
  { key: "mission", group: "about", label: "الرسالة", type: "textarea" },
];

const GROUPS: { value: string; label: string }[] = [
  { value: "general", label: "عام" },
  { value: "contact", label: "التواصل" },
  { value: "social", label: "روابط التواصل" },
  { value: "about", label: "عن الكلية" },
];

function AdminSettingsPage() {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("setting_key, setting_value, setting_group");
      if (error) throw error;
      return data as SettingRow[];
    },
  });

  useEffect(() => {
    if (!data) return;
    const map: Record<string, string> = {};
    for (const f of FIELDS) map[f.key] = "";
    for (const r of data) map[r.setting_key] = r.setting_value ?? "";
    setValues(map);
  }, [data]);

  const onChange = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = FIELDS.map((f) => ({
        setting_key: f.key,
        setting_group: f.group,
        setting_value: values[f.key] ?? "",
      }));
      const { error } = await supabase
        .from("site_settings")
        .upsert(rows, { onConflict: "setting_key" });
      if (error) throw error;
      toast.success("تم حفظ الإعدادات بنجاح");
      qc.invalidateQueries({ queryKey: ["admin", "site-settings"] });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    } catch (e: any) {
      toast.error(e?.message || "تعذر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary flex items-center gap-2">
            <SettingsIcon className="h-7 w-7" /> إعدادات الموقع
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة المعلومات العامة للكلية، التواصل، وروابط التواصل الاجتماعي.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || isLoading}
          className="bg-gold-gradient text-primary font-bold hover:opacity-90"
        >
          {saving ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Save className="h-4 w-4 ml-1" />}
          حفظ التغييرات
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-xl bg-card border border-border p-12 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue="general" dir="rtl">
          <TabsList className="bg-card border border-border">
            {GROUPS.map((g) => (
              <TabsTrigger key={g.value} value={g.value}>{g.label}</TabsTrigger>
            ))}
          </TabsList>
          {GROUPS.map((g) => (
            <TabsContent key={g.value} value={g.value} className="mt-4">
              <div className="rounded-xl bg-card border border-border p-6 shadow-card grid gap-5 md:grid-cols-2">
                {FIELDS.filter((f) => f.group === g.value).map((f) => (
                  <div
                    key={f.key}
                    className={f.type === "textarea" ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}
                  >
                    <Label htmlFor={f.key}>{f.label}</Label>
                    {f.type === "textarea" ? (
                      <Textarea
                        id={f.key}
                        rows={4}
                        dir={f.dir}
                        value={values[f.key] ?? ""}
                        onChange={(e) => onChange(f.key, e.target.value)}
                      />
                    ) : (
                      <Input
                        id={f.key}
                        type={f.type === "email" ? "email" : "text"}
                        dir={f.dir}
                        value={values[f.key] ?? ""}
                        placeholder={f.placeholder}
                        onChange={(e) => onChange(f.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
