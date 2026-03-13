grant usage on schema public to authenticated;
grant usage on schema app to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.user_permissions(uuid) to authenticated;

grant execute on function app.has_active_membership(uuid) to authenticated;
grant execute on function app.has_permission(uuid, text) to authenticated;
grant execute on function app.current_contact_id(uuid) to authenticated;
