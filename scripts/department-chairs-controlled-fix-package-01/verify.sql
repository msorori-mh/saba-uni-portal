do $$declare n int; begin
 if (select department_id from faculty_profiles where id='d08a8509-4c04-472e-885f-053a80be12ec')<>'11111111-1111-4111-8111-111111111111' then raise exception 'profile not moved'; end if;
 if (select is_active from request_processing_assignments where id='7ab0b14f-9007-40d6-9aaf-f1cba454ac8f') then raise exception 'wrong row active'; end if;
 select count(*) into n from request_processing_assignments where faculty_profile_id='d08a8509-4c04-472e-885f-053a80be12ec' and department_id='11111111-1111-4111-8111-111111111111' and is_active;
 if n<>1 then raise exception 'active CS count %',n; end if;
end$$;
