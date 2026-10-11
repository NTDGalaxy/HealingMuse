import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFile, readdir } from "node:fs/promises";

/** Portable synthetic services, applying the authored application SQL unchanged except pg_cron installation. */
export async function databaseFixture() {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema realtime; create schema cron;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,updated_at timestamptz not null default now());
    alter table storage.objects enable row level security;
    create table realtime.messages(id bigserial,payload jsonb,event text,topic text,extension text);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
    create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.messages(payload,event,topic,extension) values($1,$2,$3,'broadcast')$$;
    create table cron.jobs(name text primary key,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.jobs values($1,$2,$3) on conflict(name) do update set schedule=$2,command=$3;return 1;end;$$;
    grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
    grant select on realtime.messages to authenticated;
    grant select,insert on storage.objects to authenticated;
    -- Supabase's API-role defaults must be represented, including direct function grants.
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  `);
  for (const name of (await readdir("supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile(`supabase/migrations/${name}`, "utf8")).replace(
        "create extension if not exists pg_cron;",
        "",
      ),
    );
  return db;
}
