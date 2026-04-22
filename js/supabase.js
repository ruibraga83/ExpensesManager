/* ============================================
   EXPENSETRACKER — Supabase Backend Layer
   ============================================

   SETUP (one-time):
   1. Create a free project at https://supabase.com
   2. Go to Project Settings → API
   3. Paste your Project URL and anon key below
   4. Open the SQL Editor in your Supabase dashboard
      and run ALL the SQL in the comment block below.

   ── SQL SCHEMA ────────────────────────────────
   Run this entire block in Supabase SQL Editor.
   ORDER MATTERS — tables must exist before the function.

   -- 1. Tables first
   create table if not exists profiles (
     id            uuid references auth.users(id) on delete cascade primary key,
     name          text not null default '',
     employee_id   text default '',
     department    text default '',
     role          text not null default 'user'
                   check (role in ('user','finance','admin')),
     company       text default '',
     manager_email text default '',
     monthly_budget numeric default 2000,
     currency      text default 'USD',
     dark_mode     boolean default false,
     admin_pin     text default '',
     created_at    timestamptz default now(),
     updated_at    timestamptz default now()
   );

   create table if not exists receipts (
     id          uuid default gen_random_uuid() primary key,
     user_id     uuid references auth.users(id) on delete cascade not null,
     amount      numeric not null default 0,
     currency    text default 'USD',
     merchant    text not null default '',
     category    text default 'other',
     date        date,
     description text default '',
     location    text default '',
     status      text default 'pending'
                 check (status in ('pending','approved','rejected')),
     image_data  text default '',
     created_at  timestamptz default now(),
     updated_at  timestamptz default now()
   );

   -- 2. Helper function — reads caller's role bypassing RLS (tables must exist first)
   create or replace function get_my_role()
   returns text language sql security definer
   set search_path = public as $$
     select role from profiles where id = auth.uid()
   $$;

   -- 3. Auto-create profile on sign-up (runs server-side, bypasses RLS)
   create or replace function handle_new_user()
   returns trigger language plpgsql security definer
   set search_path = public as $$
   begin
     insert into public.profiles (id, name)
     values (
       new.id,
       coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
     )
     on conflict (id) do nothing;
     return new;
   end;
   $$;

   drop trigger if exists on_auth_user_created on auth.users;
   create trigger on_auth_user_created
     after insert on auth.users
     for each row execute procedure handle_new_user();

   -- 4. Enable RLS
   alter table profiles enable row level security;
   alter table receipts  enable row level security;

   -- 5. Policies
   -- Profiles: anyone authenticated can read all; own insert handled by trigger
   create policy "auth_read_profiles"   on profiles for select to authenticated using (true);
   create policy "own_update_profile"   on profiles for update to authenticated using (id = auth.uid());
   create policy "admin_update_profile" on profiles for update to authenticated using (get_my_role() = 'admin');
   create policy "admin_delete_profile" on profiles for delete to authenticated using (get_my_role() = 'admin');

   -- Receipts: own CRUD + admin/finance read all + admin write all
   create policy "own_receipts"               on receipts for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
   create policy "elevated_read_all_receipts" on receipts for select to authenticated using (get_my_role() in ('admin','finance'));
   create policy "admin_manage_all_receipts"  on receipts for all    to authenticated using (get_my_role() = 'admin');

   ──────────────────────────────────────────── */

const SUPABASE_URL      = 'https://cmikwbutzypaoshgkpsz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtaWt3YnV0enlwYW9zaGdrcHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDY0OTMsImV4cCI6MjA5MjQyMjQ5M30.emTDmmWjOO6wSjrNIHIRqENq2rnUFEPAy4FTkbXxuGw';

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── field mapping helpers ── */
function _toReceipt(row) {
  if (!row) return null;
  return {
    id:          row.id,
    userId:      row.user_id,
    amount:      Number(row.amount),
    currency:    row.currency    || 'USD',
    merchant:    row.merchant    || '',
    category:    row.category    || 'other',
    date:        row.date        || '',
    description: row.description || '',
    location:    row.location    || '',
    status:      row.status      || 'pending',
    imageData:   row.image_data  || null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at
  };
}

function _toProfile(row) {
  if (!row) return null;
  return {
    id:           row.id,
    name:         row.name          || '',
    employeeId:   row.employee_id   || '',
    department:   row.department    || '',
    role:         row.role          || 'user',
    company:      row.company       || '',
    managerEmail: row.manager_email || '',
    monthlyBudget:Number(row.monthly_budget) || 2000,
    currency:     row.currency      || 'USD',
    darkMode:     row.dark_mode     || false,
    adminPin:     row.admin_pin     || '',
    createdAt:    row.created_at
  };
}

function _err(error) { console.error('[SB]', error?.message || error); throw new Error(error?.message || 'Supabase error'); }

const SB = (() => {

  /* ── AUTH ── */
  const auth = _sb.auth;

  async function signIn(email, password) {
    const { data, error } = await auth.signInWithPassword({ email, password });
    if (error) _err(error);
    return data.session;
  }

  async function signUp(email, password, name) {
    /* Pass name in user_metadata — the handle_new_user trigger reads it
       and inserts the profile server-side (bypasses RLS). */
    const { data, error } = await auth.signUp({
      email, password,
      options: { data: { name: name || email.split('@')[0] } }
    });
    if (error) _err(error);
    return data.session;
  }

  async function signOut() {
    const { error } = await auth.signOut();
    if (error) _err(error);
  }

  async function getSession() {
    const { data: { session } } = await auth.getSession();
    return session;
  }

  function onAuthChange(cb) {
    return auth.onAuthStateChange((_event, session) => cb(session));
  }

  /* ── PROFILES ── */
  async function getProfile(userId) {
    const { data, error } = await _sb.from('profiles').select('*').eq('id', userId).single();
    if (error && error.code !== 'PGRST116') _err(error);
    return _toProfile(data);
  }

  async function getAllUsers() {
    const { data, error } = await _sb.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) _err(error);
    return (data || []).map(_toProfile);
  }

  async function getUserById(id) {
    return getProfile(id);
  }

  async function addUser(user) {
    /* addUser is only used for creating profiles for existing auth users in team management.
       For new auth accounts use signUp(). This upserts a profile row. */
    const row = {
      id:           user.id,
      name:         user.name         || '',
      employee_id:  user.employeeId   || '',
      department:   user.department   || '',
      role:         user.role         || 'user',
      company:      user.company      || '',
      manager_email:user.managerEmail || ''
    };
    const { error } = await _sb.from('profiles').upsert(row);
    if (error) _err(error);
    return user.id;
  }

  async function updateUser(user) {
    const row = {
      name:          user.name         || '',
      employee_id:   user.employeeId   || '',
      department:    user.department   || '',
      role:          user.role         || 'user',
      company:       user.company      || '',
      manager_email: user.managerEmail || '',
      monthly_budget:user.monthlyBudget || 2000,
      currency:      user.currency     || 'USD',
      dark_mode:     user.darkMode     || false,
      admin_pin:     user.adminPin     || '',
      updated_at:    new Date().toISOString()
    };
    const { error } = await _sb.from('profiles').update(row).eq('id', user.id);
    if (error) _err(error);
  }

  async function removeUser(id) {
    /* Deletes profile row. The auth user record is NOT deleted (requires service role key). */
    const { error } = await _sb.from('profiles').delete().eq('id', id);
    if (error) _err(error);
  }

  /* ── RECEIPTS ── */
  async function getAll() {
    const { data, error } = await _sb.from('receipts').select('*').order('date', { ascending: false });
    if (error) _err(error);
    return (data || []).map(_toReceipt);
  }

  async function getAllByUser(userId) {
    const { data, error } = await _sb.from('receipts').select('*')
      .eq('user_id', userId).order('date', { ascending: false });
    if (error) _err(error);
    return (data || []).map(_toReceipt);
  }

  async function getByDateRange(from, to, userId = null) {
    let q = _sb.from('receipts').select('*').gte('date', from).lte('date', to);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q.order('date', { ascending: false });
    if (error) _err(error);
    return (data || []).map(_toReceipt);
  }

  async function getById(id) {
    const { data, error } = await _sb.from('receipts').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') _err(error);
    return _toReceipt(data);
  }

  async function add(receipt) {
    const row = {
      user_id:     receipt.userId,
      amount:      receipt.amount,
      currency:    receipt.currency    || 'USD',
      merchant:    receipt.merchant    || '',
      category:    receipt.category    || 'other',
      date:        receipt.date,
      description: receipt.description || '',
      location:    receipt.location    || '',
      status:      receipt.status      || 'pending',
      image_data:  receipt.imageData   || ''
    };
    const { data, error } = await _sb.from('receipts').insert(row).select().single();
    if (error) _err(error);
    return data.id;
  }

  async function update(receipt) {
    const row = {
      amount:      receipt.amount,
      currency:    receipt.currency    || 'USD',
      merchant:    receipt.merchant    || '',
      category:    receipt.category    || 'other',
      date:        receipt.date,
      description: receipt.description || '',
      location:    receipt.location    || '',
      status:      receipt.status      || 'pending',
      image_data:  receipt.imageData   || '',
      updated_at:  new Date().toISOString()
    };
    const { error } = await _sb.from('receipts').update(row).eq('id', receipt.id);
    if (error) _err(error);
  }

  async function remove(id) {
    const { error } = await _sb.from('receipts').delete().eq('id', id);
    if (error) _err(error);
  }

  async function clear() {
    const session = await getSession();
    if (!session) return;
    const { error } = await _sb.from('receipts').delete().eq('user_id', session.user.id);
    if (error) _err(error);
  }

  return {
    auth, signIn, signUp, signOut, getSession, onAuthChange,
    getProfile, getAllUsers, getUserById, addUser, updateUser, removeUser,
    getAll, getAllByUser, getByDateRange, getById, add, update, remove, clear
  };
})();
