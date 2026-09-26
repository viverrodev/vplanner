-- ============================================================================
-- 0035: schedulers can move shorts up and down
--
-- move_short() now allows masters and schedulers. A fixed short that gets
-- moved still swaps into its neighbour's date (same as before).
-- Staging first, then production.
-- ============================================================================

create or replace function move_short(p_short uuid, p_direction int)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s short_videos;
  o short_videos;
  v_i int;
  v_n int;
  v_ids uuid[];
  v_s_date date;
  v_o_date date;
begin
  select * into s from short_videos where id = p_short;
  if not found then
    raise exception 'Short not found.' using errcode = 'P0002';
  end if;
  if not (is_team_master(s.team_id) or has_team_role(s.team_id, 'publisher')) then
    raise exception 'Only the master or a scheduler can reorder shorts.' using errcode = '42501';
  end if;
  if short_is_locked(s) then
    raise exception 'Posted shorts keep their place. Un-mark a platform to move it.' using errcode = '23514';
  end if;

  perform 1 from teams where id = s.team_id for update;

  -- The list exactly as the table shows it (same order as the numbers).
  select array_agg(id order by planned_date asc nulls last, queue_position, created_at, id)
    into v_ids
    from short_videos where team_id = s.team_id;
  v_n := array_length(v_ids, 1);
  v_i := array_position(v_ids, s.id);

  -- Nearest neighbour in that direction that isn't posted.
  loop
    v_i := v_i + case when p_direction < 0 then -1 else 1 end;
    if v_i < 1 or v_i > v_n then
      raise exception '%', case when p_direction < 0 then 'It''s already at the top.' else 'It''s already at the bottom.' end
        using errcode = '23514';
    end if;
    select * into o from short_videos where id = v_ids[v_i];
    exit when not short_is_locked(o);
  end loop;

  v_s_date := s.planned_date;
  v_o_date := o.planned_date;

  -- Swap their places in the list…
  v_ids[array_position(v_ids, s.id)] := o.id;
  v_ids[v_i] := s.id;

  perform set_config('vp.short_system', 'on', true);
  update short_videos x
     set queue_position = t.pos
    from unnest(v_ids) with ordinality as t(id, pos)
   where x.id = t.id and x.queue_position is distinct from t.pos::double precision;

  -- …and a fixed short takes the date of the slot it moves into.
  if s.schedule_mode = 'pinned' and v_o_date is not null then
    update short_videos set planned_date = v_o_date where id = s.id;
  end if;
  if o.schedule_mode = 'pinned' and v_s_date is not null then
    update short_videos set planned_date = v_s_date where id = o.id;
  end if;
  perform set_config('vp.short_system', 'off', true);

  perform recalc_short_queue(s.team_id);
end;
$$;
revoke all on function move_short(uuid, int) from public, anon;
grant execute on function move_short(uuid, int) to authenticated;
