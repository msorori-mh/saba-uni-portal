import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface CreateProjectFormInput {
  title: string;
  abstract: string;
}

export interface CreateProjectFormProps {
  departmentId: string;
  busy?: boolean;
  onSubmit(input: CreateProjectFormInput): void;
}

export function CreateProjectForm({ departmentId, busy = false, onSubmit }: CreateProjectFormProps) {
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const trimmed = title.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 300;
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle>إنشاء مشروع تخرج</CardTitle>
        <CardDescription>
          الإنشاء مفوَّض للمنسقين ورؤساء الأقسام المعيَّنين في القسم ({departmentId}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gp-title">عنوان المقترح</Label>
          <Input
            id="gp-title"
            value={title}
            onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTitle(event.target.value)}
            placeholder="عنوان مشروع التخرج"
          />
          {!valid && trimmed.length > 0 ? (
            <p className="text-sm text-destructive">العنوان يجب أن يكون بين 3 و300 حرف.</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="gp-abstract">ملخص المقترح</Label>
          <Textarea
            id="gp-abstract"
            value={abstract}
            onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setAbstract(event.target.value)}
            placeholder="ملخص فكرة المشروع وأهدافه"
            rows={5}
          />
        </div>
        <Button
          type="button"
          disabled={busy || !valid}
          onClick={() => onSubmit({ title: trimmed, abstract })}
        >
          إنشاء المشروع
        </Button>
      </CardContent>
    </Card>
  );
}
