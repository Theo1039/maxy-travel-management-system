-- Maxy Travel Management System database schema
-- Run this in Supabase SQL Editor before starting the application.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'traveller' check (role in ('traveller', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  destination varchar(100) not null,
  description varchar(2000) not null,
  price_per_person numeric(12,2) not null check (price_per_person > 0),
  duration_days integer not null check (duration_days between 1 and 365),
  image_url text not null,
  image_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  traveller_id uuid not null references public.profiles(id) on delete restrict,
  package_id uuid not null references public.packages(id) on delete restrict,
  travel_date date not null check (travel_date >= current_date),
  passenger_count integer not null check (passenger_count between 1 and 20),
  contact_email varchar(254) not null,
  total_price numeric(14,2) not null check (total_price > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists packages_destination_active_idx on public.packages using btree (lower(destination)) where is_active = true;
create index if not exists bookings_traveller_created_idx on public.bookings (traveller_id, created_at desc);
create index if not exists bookings_package_idx on public.bookings (package_id);
create index if not exists bookings_travel_date_idx on public.bookings (travel_date);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists packages_updated_at on public.packages;
create trigger packages_updated_at before update on public.packages for each row execute function public.set_updated_at();
drop trigger if exists bookings_updated_at on public.bookings;
create trigger bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();

-- Automatically create a Traveller profile after Supabase Auth registration.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'traveller');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();


-- Optional starter catalogue so the public homepage is not empty after setup.
-- Replace these sample prices/descriptions with the travel company's real offers.
insert into public.packages (destination, description, price_per_person, duration_days, image_url, image_path)
select v.destination, v.description, v.price_per_person, v.duration_days, v.image_url, v.image_path
from (values
  ('Cape Town', 'Explore Table Mountain, coastal views and the vibrant waterfront.', 850000.00, 5, 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=1200&q=85', 'seed/cape-town'),
  ('Dubai', 'Enjoy modern architecture, desert experiences and beautiful beaches.', 1200000.00, 7, 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=85', 'seed/dubai'),
  ('London', 'Discover historic landmarks, museums and iconic city neighbourhoods.', 2500000.00, 8, 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=85', 'seed/london')
) as v(destination, description, price_per_person, duration_days, image_url, image_path)
where not exists (select 1 from public.packages p where lower(p.destination) = lower(v.destination));

-- Enable row-level security. The Express server uses the service-role key only
-- on the server and performs authorization checks before every protected query.
alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles for select to authenticated using (auth.uid() = id);

-- Public/anonymous users do not query tables directly; catalogue reads go through Express.
-- No anon policies are created for packages or bookings.

-- Create a public bucket for package photos. Images are publicly viewable by URL;
-- uploads and changes are performed by the authenticated Admin-only Express API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('package-images', 'package-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Promote your own account to Admin only after registering and confirming its email.
-- Replace the email address before running this statement:
-- update public.profiles p set role = 'admin'
-- from auth.users u where p.id = u.id and u.email = 'YOUR_ADMIN_EMAIL@example.com';
