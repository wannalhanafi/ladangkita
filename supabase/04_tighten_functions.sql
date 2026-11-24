-- LadangKita · Stage 1 · tighten helper functions (applied 24 Nov 2026 after Supabase security advisor)
-- Helper functions: callable only by signed-in users who need them; trigger functions by no one directly.
revoke execute on function public.is_member(uuid), public.is_admin(uuid), public.my_member_id(uuid),
  public.claim_membership(), public.guard_member_update(), public.guard_claim_paid() from public, anon;
revoke execute on function public.guard_member_update(), public.guard_claim_paid() from authenticated;
grant execute on function public.is_member(uuid), public.is_admin(uuid), public.my_member_id(uuid), public.claim_membership() to authenticated;
-- New functions are not public by default.
alter default privileges in schema public revoke execute on functions from public, anon;
-- Remaining advisor warnings (authenticated may call is_member / is_admin / my_member_id / claim_membership) are intended:
-- the row-security rules need them, and they only answer about the signed-in user.
