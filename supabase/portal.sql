-- Applied 2026-11-19 as Supabase migration "portal_client_builds" (project cgrqejsigmzvlhlmvjbx). Re-running needs the tables/policies gone first.
-- Client build portal (Saltwater Building Co: /portal/ for homeowners, /admin/builds/ for the builder).
-- Shared Supabase project "Lead-tracker". Applied as migration "portal_client_builds". Kept here for reference.
--
-- Who sees what (row level security):
--   * Owners of the business (business_members.role = 'owner') read and change that business's builds.
--   * A homeowner reads only the builds whose client list (portal_members) has their email, and only once that
--     email is confirmed (they signed in with an emailed code, or the account was made confirmed).
--   * Not signed in: only the build marked is_demo (the sample build). Nothing else, ever.
--   * Clients never write anything. Other businesses in this database see nothing of it.
-- Photos: private bucket "portal-photos", path "<business slug>/<project id>/<file>". Owners upload; clients get
-- short-lived signed links, only for photos that belong to their build.


create table if not exists public.portal_projects (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 160),
  address       text,
  stages        text[] not null default array['Foundation','Framing','Weather-tight','Finished'],
  current_stage int  not null default 1 check (current_stage >= 1),
  cover_url     text check (cover_url is null or cover_url ~ '^https://'),
  cover_path    text,
  is_demo       boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (cardinality(stages) between 1 and 12),
  check (current_stage <= cardinality(stages))
);
create index if not exists portal_projects_business_idx on public.portal_projects (business_id);

create table if not exists public.portal_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.portal_projects (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name        text,
  created_at  timestamptz not null default now(),
  unique (project_id, email)
);
create index if not exists portal_members_email_idx on public.portal_members (email);

create table if not exists public.portal_updates (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.portal_projects (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  title       text,
  body        text not null default '',
  stage       int,
  posted_on   date not null default current_date,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists portal_updates_project_idx on public.portal_updates (project_id, posted_on desc);

create table if not exists public.portal_photos (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.portal_projects (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  update_id   uuid references public.portal_updates (id) on delete cascade,
  path        text,
  url         text check (url is null or url ~ '^https://'),
  caption     text,
  sort        int not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  check (path is not null or url is not null)
);
create index if not exists portal_photos_project_idx on public.portal_photos (project_id);
create index if not exists portal_photos_update_idx on public.portal_photos (update_id);

-- Child rows always carry their build's business, and uploaded files must sit in that build's folder.
create or replace function public.portal_child_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare biz uuid; slug text;
begin
  select p.business_id, b.slug into biz, slug from portal_projects p join businesses b on b.id = p.business_id where p.id = new.project_id;
  if biz is null then raise exception 'No such build'; end if;
  new.business_id := biz;
  if tg_table_name = 'portal_photos' then
    if new.path is not null and new.path not like slug || '/' || new.project_id::text || '/%' then
      raise exception 'Photo is not in this build''s folder';
    end if;
    if new.update_id is not null and not exists (select 1 from portal_updates u where u.id = new.update_id and u.project_id = new.project_id) then
      raise exception 'Update belongs to another build';
    end if;
  end if;
  return new;
end $$;

create or replace function public.portal_project_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare slug text;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.business_id := old.business_id;          -- a build can't be moved to another business
  end if;
  -- Only the database admin (no signed-in user) can mark the public sample build. Owners never can.
  if auth.uid() is not null then
    new.is_demo := case when tg_op = 'UPDATE' then old.is_demo else false end;
  end if;
  if new.cover_path is not null then
    select b.slug into slug from businesses b where b.id = new.business_id;
    if new.cover_path not like slug || '/' || new.id::text || '/%' then raise exception 'Cover is not in this build''s folder'; end if;
  end if;
  return new;
end $$;

create trigger portal_projects_guard before insert or update on public.portal_projects
  for each row execute function public.portal_project_guard();
create trigger portal_members_fill before insert or update on public.portal_members
  for each row execute function public.portal_child_fill();
create trigger portal_updates_fill before insert or update on public.portal_updates
  for each row execute function public.portal_child_fill();
create trigger portal_photos_fill before insert or update on public.portal_photos
  for each row execute function public.portal_child_fill();

-- Builds the signed-in person is a client on (confirmed email only).
create or replace function public.portal_my_project_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.project_id from portal_members m
  join auth.users u on u.id = auth.uid()
  where u.email_confirmed_at is not null and m.email = lower(u.email)
$$;
grant execute on function public.portal_my_project_ids() to authenticated;

-- Builds the signed-in person can manage (owner of the business).
create or replace function public.portal_owner_project_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from portal_projects p
  join business_members m on m.business_id = p.business_id and m.user_id = auth.uid() and m.role = 'owner'
$$;
grant execute on function public.portal_owner_project_ids() to authenticated;

-- Sign-in page: is this email on any build of this website? (Only then is a sign-in code sent.)
create or replace function public.portal_is_client(p_site text, p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from portal_members m join businesses b on b.id = m.business_id
                 where b.slug = p_site and m.email = lower(btrim(p_email)))
$$;
grant execute on function public.portal_is_client(text, text) to anon, authenticated;

alter table public.portal_projects enable row level security;
alter table public.portal_members  enable row level security;
alter table public.portal_updates  enable row level security;
alter table public.portal_photos   enable row level security;

grant select on public.portal_projects, public.portal_updates, public.portal_photos to anon;
grant select, insert, update, delete on public.portal_projects, public.portal_members, public.portal_updates, public.portal_photos to authenticated;

-- projects
create policy portal_projects_read on public.portal_projects for select to authenticated
  using (business_id in (select public.my_owner_business_ids()) or id in (select public.portal_my_project_ids()));
create policy portal_projects_demo on public.portal_projects for select to anon using (is_demo);
create policy portal_projects_insert on public.portal_projects for insert to authenticated
  with check (business_id in (select public.my_owner_business_ids()));
create policy portal_projects_update on public.portal_projects for update to authenticated
  using (business_id in (select public.my_owner_business_ids())) with check (business_id in (select public.my_owner_business_ids()));
create policy portal_projects_delete on public.portal_projects for delete to authenticated
  using (business_id in (select public.my_owner_business_ids()));

-- client list: owners only
create policy portal_members_owner on public.portal_members for all to authenticated
  using (project_id in (select public.portal_owner_project_ids())) with check (project_id in (select public.portal_owner_project_ids()));

-- updates
create policy portal_updates_read on public.portal_updates for select to authenticated
  using (project_id in (select public.portal_owner_project_ids()) or project_id in (select public.portal_my_project_ids()));
create policy portal_updates_demo on public.portal_updates for select to anon
  using (project_id in (select id from public.portal_projects where is_demo));
create policy portal_updates_write on public.portal_updates for all to authenticated
  using (project_id in (select public.portal_owner_project_ids())) with check (project_id in (select public.portal_owner_project_ids()));
-- (for all + a separate select policy: select is the OR of both, which is what we want)

-- photos
create policy portal_photos_read on public.portal_photos for select to authenticated
  using (project_id in (select public.portal_owner_project_ids()) or project_id in (select public.portal_my_project_ids()));
create policy portal_photos_demo on public.portal_photos for select to anon
  using (project_id in (select id from public.portal_projects where is_demo));
create policy portal_photos_write on public.portal_photos for all to authenticated
  using (project_id in (select public.portal_owner_project_ids())) with check (project_id in (select public.portal_owner_project_ids()));

-- Storage: private bucket; owners write in their business folder; clients read only their build's photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-photos', 'portal-photos', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function public.portal_can_read_object(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from portal_photos ph where ph.path = p_name
                   and (ph.project_id in (select portal_my_project_ids()) or ph.project_id in (select portal_owner_project_ids())))
      or exists (select 1 from portal_projects p where p.cover_path = p_name
                   and (p.id in (select portal_my_project_ids()) or p.id in (select portal_owner_project_ids())))
$$;
grant execute on function public.portal_can_read_object(text) to authenticated;

create policy portal_photos_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'portal-photos' and ((storage.foldername(name))[1] in (select public.my_owner_business_slugs()) or public.portal_can_read_object(name)));
create policy portal_photos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-photos' and (storage.foldername(name))[1] in (select public.my_owner_business_slugs()));
create policy portal_photos_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'portal-photos' and (storage.foldername(name))[1] in (select public.my_owner_business_slugs()))
  with check (bucket_id = 'portal-photos' and (storage.foldername(name))[1] in (select public.my_owner_business_slugs()));
create policy portal_photos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portal-photos' and (storage.foldername(name))[1] in (select public.my_owner_business_slugs()));



notify pgrst, 'reload schema';
