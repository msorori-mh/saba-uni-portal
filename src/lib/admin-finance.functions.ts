import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FINANCE_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "finance_officer",
] as const;

const discountStatusSchema = z.enum(["active", "inactive", "cancelled"]);
const paymentMethodSchema = z.enum(["cash", "bank_transfer", "other"]);
const receiptStatusFilterSchema = z.enum([
  "all", "submitted", "under_review", "approved", "rejected",
]);

async function assertFinanceAdmin(userId: string) {
  await assertAnyRole(
    userId,
    FINANCE_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة الشؤون المالية",
  );
}

export const getFinanceLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceAdmin(context.userId);
    const [yearsRes, semsRes, progsRes] = await Promise.all([
      supabaseAdmin.from("academic_years").select("id, name, is_current").order("name", { ascending: false }),
      supabaseAdmin.from("semesters").select("id, name, academic_year_id, is_current"),
      supabaseAdmin.from("programs").select("id, name_ar").eq("is_active", true),
    ]);
    if (yearsRes.error) throw new Error(yearsRes.error.message);
    if (semsRes.error) throw new Error(semsRes.error.message);
    if (progsRes.error) throw new Error(progsRes.error.message);
    return {
      years: yearsRes.data ?? [],
      semesters: semsRes.data ?? [],
      programs: progsRes.data ?? [],
    };
  });

export const searchStudentsForFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(2).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const t = `%${data.query}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("student_profiles")
      .select("id, academic_number, full_name_ar, program_id")
      .or(`academic_number.ilike.${t},full_name_ar.ilike.${t}`)
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── Fee types ──────────────────────────────────────────────────────────────

export const listFeeTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("fee_types")
      .select("*")
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listActiveFeeTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("fee_types")
      .select("*")
      .eq("is_active", true)
      .order("name_ar");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const feeTypePayloadSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name_ar: z.string().trim().min(1).max(200),
  description_ar: z.string().trim().max(2000).nullable(),
  amount: z.number().min(0),
  is_active: z.boolean(),
});

export const upsertFeeType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      ...feeTypePayloadSchema.shape,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const payload = {
      code: data.code,
      name_ar: data.name_ar,
      description_ar: data.description_ar,
      amount: data.amount,
      is_active: data.is_active,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("fee_types").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("fee_types").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteFeeType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin.from("fee_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Student fees ───────────────────────────────────────────────────────────

export const listStudentFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      academicYearId: z.string().uuid().optional(),
      semesterId: z.string().uuid().optional(),
      programId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    let q = supabaseAdmin
      .from("student_fees")
      .select(
        "id, amount, status, notes, student_profile_id, fee_type_id, academic_year_id, semester_id, fee_type:fee_types(name_ar, code), student:student_profiles(academic_number, full_name_ar, program_id), academic_year:academic_years(name), semester:semesters(name)",
      )
      .order("created_at", { ascending: false });
    if (data.academicYearId) q = q.eq("academic_year_id", data.academicYearId);
    if (data.semesterId) q = q.eq("semester_id", data.semesterId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let result = rows ?? [];
    if (data.programId) {
      result = result.filter(
        (r) => (r.student as { program_id?: string } | null)?.program_id === data.programId,
      );
    }

    if (result.length > 0) {
      const ids = result.map((r) => r.id as string);
      const { data: pays, error: payErr } = await supabaseAdmin
        .from("student_payments")
        .select("student_fee_id, amount")
        .in("student_fee_id", ids);
      if (payErr) throw new Error(payErr.message);
      const sum = new Map<string, number>();
      for (const p of pays ?? []) {
        const feeId = p.student_fee_id as string;
        sum.set(feeId, (sum.get(feeId) ?? 0) + Number(p.amount));
      }
      result = result.map((r) => ({ ...r, paid: sum.get(r.id as string) ?? 0 }));
    }

    return result;
  });

export const cancelStudentFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("student_fees")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const createStudentFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      studentProfileId: z.string().uuid(),
      feeTypeId: z.string().uuid(),
      academicYearId: z.string().uuid(),
      semesterId: z.string().uuid(),
      amount: z.number().min(0),
      notes: z.string().trim().max(2000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin.from("student_fees").insert({
      student_profile_id: data.studentProfileId,
      fee_type_id: data.feeTypeId,
      academic_year_id: data.academicYearId,
      semester_id: data.semesterId,
      amount: data.amount,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listOpenStudentFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ studentProfileId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("student_fees")
      .select(
        "id, amount, status, student_profile_id, fee_type_id, academic_year_id, semester_id, fee_type:fee_types(name_ar, code), academic_year:academic_years(name), semester:semesters(name)",
      )
      .eq("student_profile_id", data.studentProfileId)
      .in("status", ["pending", "partially_paid"]);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── Payments ───────────────────────────────────────────────────────────────

export const listStudentPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("student_payments")
      .select(
        "id, student_fee_id, receipt_number, amount, payment_date, payment_method, notes, fee:student_fees(amount, student:student_profiles(academic_number, full_name_ar), fee_type:fee_types(name_ar))",
      )
      .order("payment_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createStudentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      studentFeeId: z.string().uuid(),
      receiptNumber: z.string().trim().min(1).max(100),
      amount: z.number().positive(),
      paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      paymentMethod: paymentMethodSchema,
      notes: z.string().trim().max(2000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin.from("student_payments").insert({
      student_fee_id: data.studentFeeId,
      receipt_number: data.receiptNumber,
      amount: data.amount,
      payment_date: data.paymentDate,
      payment_method: data.paymentMethod,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Discount types ─────────────────────────────────────────────────────────

export const listDiscountTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("discount_types")
      .select("*")
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listActiveDiscountTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("discount_types")
      .select("*")
      .eq("is_active", true)
      .order("name_ar");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const discountTypePayloadSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name_ar: z.string().trim().min(1).max(200),
  description_ar: z.string().trim().max(2000).nullable(),
  discount_type: z.enum(["percentage", "fixed_amount"]),
  default_value: z.number().min(0),
  is_active: z.boolean(),
});

export const upsertDiscountType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      ...discountTypePayloadSchema.shape,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const payload = {
      code: data.code,
      name_ar: data.name_ar,
      description_ar: data.description_ar,
      discount_type: data.discount_type,
      default_value: data.default_value,
      is_active: data.is_active,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("discount_types").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("discount_types").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteDiscountType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin.from("discount_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Student discounts ──────────────────────────────────────────────────────

export const listStudentDiscounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinanceAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("student_discounts")
      .select(
        "id, student_profile_id, discount_type_id, academic_year_id, semester_id, value, status, notes, approved_at, discount_type:discount_types(name_ar, discount_type, code), student:student_profiles(academic_number, full_name_ar), academic_year:academic_years(name), semester:semesters(name)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    if (rows.length === 0) return rows;

    const { data: adjs, error: adjErr } = await supabaseAdmin
      .from("student_fee_adjustments")
      .select("id, student_discount_id, original_amount, discount_amount, final_amount")
      .in("student_discount_id", rows.map((r) => r.id as string));
    if (adjErr) throw new Error(adjErr.message);

    const m = new Map<string, { id: string; original_amount: number; discount_amount: number; final_amount: number }[]>();
    for (const a of adjs ?? []) {
      const discountId = a.student_discount_id as string;
      const arr = m.get(discountId) ?? [];
      arr.push({
        id: a.id as string,
        original_amount: Number(a.original_amount),
        discount_amount: Number(a.discount_amount),
        final_amount: Number(a.final_amount),
      });
      m.set(discountId, arr);
    }

    return rows.map((r) => ({
      ...r,
      adjustments: m.get(r.id as string) ?? [],
    }));
  });

export const updateStudentDiscountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: discountStatusSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("student_discounts")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const createStudentDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      studentProfileId: z.string().uuid(),
      discountTypeId: z.string().uuid(),
      academicYearId: z.string().uuid(),
      semesterId: z.string().uuid(),
      value: z.number().min(0),
      notes: z.string().trim().max(2000).nullable().optional(),
      activate: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin.from("student_discounts").insert({
      student_profile_id: data.studentProfileId,
      discount_type_id: data.discountTypeId,
      academic_year_id: data.academicYearId,
      semester_id: data.semesterId,
      value: data.value,
      notes: data.notes ?? null,
      status: data.activate ? "active" : "inactive",
      approved_at: data.activate ? new Date().toISOString() : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Payment receipts ─────────────────────────────────────────────────────────

export const listPaymentReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ statusFilter: receiptStatusFilterSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    let q = supabaseAdmin
      .from("payment_receipts")
      .select(
        "id, student_profile_id, student_fee_id, amount, payment_date, payment_method, receipt_reference, file_url, file_name, status, rejection_reason, created_at, reviewed_at, student_payment_id, student:student_profiles(academic_number, full_name_ar), fee:student_fees(amount, fee_type:fee_types(name_ar))",
      )
      .order("created_at", { ascending: false });
    if (data.statusFilter !== "all") q = q.eq("status", data.statusFilter);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getPaymentReceiptFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-receipts")
      .createSignedUrl(data.path, 300);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "تعذر فتح المرفق");
    return { signedUrl: signed.signedUrl };
  });

export const approvePaymentReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("payment_receipts")
      .update({ status: "approved" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: receipt } = await supabaseAdmin
      .from("payment_receipts")
      .select("amount, payment_date, student_profile_id, fee:student_fees(fee_type:fee_types(name_ar))")
      .eq("id", data.id)
      .maybeSingle();

    let email: string | null = null;
    let full_name_ar: string | null = null;
    if (receipt?.student_profile_id) {
      const { data: student } = await supabaseAdmin
        .from("student_profiles")
        .select("email, full_name_ar")
        .eq("id", receipt.student_profile_id)
        .maybeSingle();
      email = student?.email ?? null;
      full_name_ar = student?.full_name_ar ?? null;
    }

    const fee = receipt?.fee as { fee_type?: { name_ar?: string } } | null;
    return {
      ok: true as const,
      email,
      full_name_ar,
      amount: Number(receipt?.amount ?? 0),
      payment_date: receipt?.payment_date ?? null,
      fee_type: fee?.fee_type?.name_ar ?? null,
    };
  });

export const rejectPaymentReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      rejectionReason: z.string().trim().min(1).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("payment_receipts")
      .update({ status: "rejected", rejection_reason: data.rejectionReason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: receipt } = await supabaseAdmin
      .from("payment_receipts")
      .select("amount, student_profile_id")
      .eq("id", data.id)
      .maybeSingle();

    let email: string | null = null;
    let full_name_ar: string | null = null;
    if (receipt?.student_profile_id) {
      const { data: student } = await supabaseAdmin
        .from("student_profiles")
        .select("email, full_name_ar")
        .eq("id", receipt.student_profile_id)
        .maybeSingle();
      email = student?.email ?? null;
      full_name_ar = student?.full_name_ar ?? null;
    }

    return {
      ok: true as const,
      email,
      full_name_ar,
      amount: Number(receipt?.amount ?? 0),
      rejection_reason: data.rejectionReason,
    };
  });
