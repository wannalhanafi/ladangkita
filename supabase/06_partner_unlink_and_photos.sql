-- LadangKita · Stage 2 · partners may untick peringkat on a job/pick, and remove photos they uploaded themselves.
create policy "partners unlink" on public.job_batches for delete to authenticated using (public.is_member(plantation_id));
create policy "partners unlink" on public.job_blocks for delete to authenticated using (public.is_member(plantation_id));
create policy "partners unlink" on public.pick_batches for delete to authenticated using (public.is_member(plantation_id));
create policy "uploader deletes" on public.attachments for delete to authenticated
  using (public.is_member(plantation_id) and created_by = public.my_member_id(plantation_id));
create policy "uploader deletes files" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and owner = auth.uid() and public.is_member(((storage.foldername(name))[1])::uuid));
