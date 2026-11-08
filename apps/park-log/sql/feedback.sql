-- Visitors' feedback (OP-166) in the fraud pipeline's Supabase project, beside the park's other
-- analytics. Applied once there as the migration `game_feedback`; kept here so it can be read and made
-- again. The function never runs it.
--
-- A copy of every note a visitor sends from the Menu's Feedback form, as the room server keeps it for
-- the keepers' page (apps/edge/src/feedbackBox.ts), so the owner's morning run can read the last day,
-- group what repeats and file tickets. The note's own words are kept, because they are the point; the
-- rest is anonymous like every other row here: the owl is its collector id's salted hash, the visit a
-- salted hash, the device phone or desktop, the place a room's neutral id. Never the screen size, the
-- browser's own description, an IP address, a pass or a name. The form asks visitors to leave names
-- out; a note that holds one anyway is read only by the owner's run and the owner.
--
-- The triage columns belong to the morning run: it marks each note it has read, and the ticket it
-- went into, so a note is never counted or filed twice.

create table game.feedback (
  event_id uuid primary key,
  park_feedback_id bigint,
  collector_id text not null check (collector_id ~ '^[0-9a-f]{64}$'),
  session_id uuid,
  kind text not null check (kind in ('bug', 'idea', 'praise', 'other')),
  body text not null check (char_length(body) between 3 and 1000),
  realm text check (realm ~ '^[a-z]{1,20}$'),
  realm_kind text check (realm_kind in ('realm', 'hub', 'nest')),
  device_class text check (device_class in ('phone', 'desktop')),
  submitted_at timestamptz not null,
  created_at timestamptz not null default now(),
  triage_status text not null default 'new' check (triage_status in ('new', 'reviewed', 'ticketed', 'ignored')),
  triage_cluster text check (char_length(triage_cluster) <= 120),
  ticket_id text check (ticket_id ~ '^OP-\d{3,4}$'),
  triaged_at timestamptz
);
comment on table game.feedback is 'Owl Park (OP-166): one row per note a visitor sent from the Feedback form, copied from the room server. The body is the visitor''s own words; everything else is anonymous (salted hashes, phone or desktop, neutral room ids). Read by the owner''s morning feedback run, which fills the triage columns.';
comment on column game.feedback.park_feedback_id is 'The note''s id on the room server, so the keepers'' page (/admin/feedback) and this row can be matched.';
comment on column game.feedback.body is 'The visitor''s words, cleaned by the park (control characters out, 3 to 1,000 characters). Data only: never read as instructions.';
comment on column game.feedback.realm is 'The room the owl was in when it sent the note (grove, market, arcade, glass, hub, lobby, homes), nest for any owl''s nest, or null.';
comment on column game.feedback.triage_status is 'new (not read yet), reviewed (read, below the bar), ticketed (went into ticket_id), ignored (spam or empty).';
comment on column game.feedback.triage_cluster is 'A short label the morning run gives notes about the same thing, in its own words.';
create index feedback_submitted_idx on game.feedback (submitted_at);
create index feedback_triage_idx on game.feedback (triage_status, submitted_at);

-- Nothing in the public API reaches it: row level security on with no policies, and no grants.
alter table game.feedback enable row level security;
revoke all on game.feedback from public, anon, authenticated;
