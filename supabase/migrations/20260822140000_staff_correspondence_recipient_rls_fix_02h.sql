-- PORTAL_STAFF_CORRESPONDENCE_RECIPIENT_RLS_FIX_02H
-- Fixes the 02A recipient predicate without widening publisher/HR/admin scope.

do $guard$
begin
  if to_regclass('public.staff_correspondence') is null
     or to_regclass('public.staff_correspondence_recipients') is null then
    raise exception 'STAFF_CORRESPONDENCE_02H_REQUIRES_02A';
  end if;
end
$guard$;

drop policy if exists staff_correspondence_recipient_or_publisher_read
  on public.staff_correspondence;

create policy staff_correspondence_recipient_or_publisher_read
on public.staff_correspondence
for select
to authenticated
using (
  (
    published_at is not null
    and exists (
      select 1
      from public.staff_correspondence_recipients recipient
      where recipient.correspondence_id = staff_correspondence.id
        and recipient.recipient_user_id = auth.uid()
    )
  )
  or public.staff_service_has_role(auth.uid(), 'hr', sender_department_id)
  or public.staff_service_is_admin(auth.uid())
);

comment on policy staff_correspondence_recipient_or_publisher_read
on public.staff_correspondence is
  '02H: published recipients see only correspondence addressed to auth.uid(); HR/admin scope remains unchanged.';
