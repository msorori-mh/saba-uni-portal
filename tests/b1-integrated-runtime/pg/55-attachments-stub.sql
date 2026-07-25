-- Attachment authorize-before-sign stub assertions (no public URL / no getPublicUrl).

do $$
declare
  u_student uuid := '11111111-1111-4111-8111-111111111101';
  u_other uuid := '11111111-1111-4111-8111-111111111102';
  u_sa_spec uuid := '22222222-2222-4222-8222-222222222201';
  att uuid;
  req uuid;
  v jsonb;
  src text;
begin
  select a.id, a.student_request_id into att, req
  from public.student_request_attachment_uploads a
  where a.upload_status = 'attached'
  order by a.created_at desc
  limit 1;

  if att is null then
    perform b1_e2e.note('attach/no_fixture', 'attachment', false, 'no attached row');
    return;
  end if;

  -- owner metadata via secure-read list (no storage coordinates)
  perform b1_e2e.set_uid(u_student);
  begin
    v := public.list_b1_request_attachments_for_viewer(req);
    perform b1_e2e.bump('attachment_assertions');
    perform b1_e2e.bump('read_allows');
    perform b1_e2e.note(
      'attach/owner_meta_no_path',
      'attachment',
      v::text like '%att:%'
        and v::text not ilike '%storage_bucket%'
        and v::text not ilike '%storage_object_path%'
        and v::text not ilike '%object_key%',
      left(v::text, 240)
    );
  exception when others then
    perform b1_e2e.note('attach/owner_meta_no_path', 'attachment', false, sqlerrm);
  end;

  -- cross-student deny
  perform b1_e2e.expect_deny(
    'attach/cross_student', 'attachment', u_other,
    format('select public.list_b1_request_attachments_for_viewer(%L::uuid)', req),
    '%B1_READ_ACCESS_DENIED%', req);

  -- unassigned staff deny on viewer list when not assignee/owner
  perform b1_e2e.expect_deny(
    'attach/unassigned_staff', 'attachment', u_sa_spec,
    format('select public.list_b1_request_attachments_for_viewer(%L::uuid)', req),
    '%B1_READ_ACCESS_DENIED%', req);

  -- authorize download returns coordinates only to authorized caller; prove ordering in source
  src := pg_get_functiondef('public.authorize_student_request_attachment_download(uuid)'::regprocedure);
  perform b1_e2e.bump('attachment_assertions');
  perform b1_e2e.note(
    'attach/authorize_before_sign_source',
    'attachment',
    position('ATTACHMENT_ACCESS_DENIED' in src) > 0
      and position('storage_object_path' in src) > position('ATTACHMENT_ACCESS_DENIED' in src),
    'authorize gate precedes coordinate return'
  );

  -- no getPublicUrl / public bucket URL in attachment SQL source track
  perform b1_e2e.note(
    'attach/no_public_url_helpers',
    'attachment',
    src not ilike '%getPublicUrl%' and src not ilike '%public-url%',
    'authorize fn source'
  );
end $$;
