-- شغّل هذا الملف مرة واحدة في Supabase > SQL Editor، بعد استبدال OWNER@EMAIL ببريدك
create table if not exists kv (key text primary key, value jsonb);
alter table kv enable row level security;
-- أي شخص يقرأ إعدادات المنصة، وكل مستخدم يقرأ بياناته فقط
create policy kv_read on kv for select using (key = 'cfg' or key = 'u:' || auth.uid());
-- كل مستخدم يكتب تقدمه وملاحظاته فقط
create policy kv_user on kv for all using (key = 'u:' || auth.uid()) with check (key = 'u:' || auth.uid());
-- المالك فقط يعدّل محتوى المنصة
create policy kv_cfg_ins on kv for insert with check (key = 'cfg' and auth.jwt() ->> 'email' = 'OWNER@EMAIL');
create policy kv_cfg_upd on kv for update using (key = 'cfg' and auth.jwt() ->> 'email' = 'OWNER@EMAIL');
-- مخزن الملفات: قراءة عامة، ورفع للمالك فقط
insert into storage.buckets (id, name, public) values ('content', 'content', true) on conflict do nothing;
create policy content_up on storage.objects for insert with check (bucket_id = 'content' and auth.jwt() ->> 'email' = 'OWNER@EMAIL');

-- ===== جدول بيانات المستخدمين (للوحة الأدمن). لو شغّلت الملف سابقاً شغّل هذا الجزء فقط =====
create table if not exists profiles (id uuid primary key references auth.users(id) on delete cascade, name text, email text, phone text, levels int default 0, last_seen timestamptz default now());
alter table profiles enable row level security;
create policy p_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy p_owner on profiles for select using (auth.jwt() ->> 'email' = 'OWNER@EMAIL');
