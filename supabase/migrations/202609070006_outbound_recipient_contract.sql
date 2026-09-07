begin;

alter table public.outbound_messages
  drop constraint if exists outbound_messages_recipients_check;

alter table public.outbound_messages
  add constraint outbound_messages_recipients_check
  check (
    jsonb_typeof(recipients) = 'object'
    and jsonb_typeof(recipients->'to') = 'array'
    and jsonb_array_length(recipients->'to') between 1 and 50
    and jsonb_typeof(recipients->'cc') = 'array'
    and jsonb_array_length(recipients->'cc') <= 50
    and jsonb_typeof(recipients->'bcc') = 'array'
    and jsonb_array_length(recipients->'bcc') <= 50
  );

commit;
