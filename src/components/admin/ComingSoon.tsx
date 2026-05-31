import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-2xl border-2 border-dashed border-border bg-card p-16 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary">
          <Construction className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold text-primary">قيد التطوير</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          سيتم تفعيل أدوات الإدارة لهذا القسم قريباً.
        </p>
      </div>
    </div>
  );
}
