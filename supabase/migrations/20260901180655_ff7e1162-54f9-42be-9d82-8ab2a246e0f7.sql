-- ============ enums ============
create type public.app_role as enum ('admin','student');
create type public.cefr_level as enum ('A1','A2','B1','B2','C1','C2');

-- ============ helper ============
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  email text not null default '',
  english_level public.cefr_level not null default 'B1',
  target_level public.cefr_level not null default 'C1',
  learning_goal text not null default '',
  ui_language text not null default 'en',
  streak_days integer not null default 0,
  last_practice_on date,
  practice_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end; $$;

-- ============ roles ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create policy "own roles read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admins manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============ content library ============
create table public.speaking_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  category text not null default 'Daily Life',
  level public.cefr_level not null default 'B1',
  part text not null default 'general',
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vocabulary_words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  ipa text not null default '',
  meaning_vi text not null default '',
  meaning_en text not null default '',
  category text not null default 'Daily English',
  level public.cefr_level not null default 'B1',
  example_sentence text not null default '',
  example_vi text not null default '',
  synonyms text[] not null default '{}',
  antonyms text[] not null default '{}',
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.grammar_lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  level public.cefr_level not null default 'B1',
  summary text not null default '',
  explanation text not null default '',
  explanation_vi text not null default '',
  examples jsonb not null default '[]'::jsonb,
  exercises jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listening_exercises (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  level public.cefr_level not null default 'A2',
  activity_type text not null default 'listen_and_choose',
  transcript text not null default '',
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ielts_questions (
  id uuid primary key default gen_random_uuid(),
  part integer not null default 1,
  topic text not null default 'General',
  prompt text not null,
  cue_points text[] not null default '{}',
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['speaking_questions','vocabulary_words','grammar_lessons','listening_exercises','ielts_questions'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read %1$s" on public.%1$I for select to anon, authenticated using (status = ''published'' or public.has_role(auth.uid(),''admin''))', t);
    execute format('create policy "admin write %1$s" on public.%1$I for all to authenticated using (public.has_role(auth.uid(),''admin'')) with check (public.has_role(auth.uid(),''admin''))', t);
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ============ student activity ============
create table public.speaking_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  question_id uuid references public.speaking_questions on delete set null,
  question_text text not null default '',
  transcript text not null default '',
  fluency numeric(3,1),
  grammar numeric(3,1),
  vocabulary numeric(3,1),
  pronunciation numeric(3,1),
  overall numeric(3,1),
  mistakes jsonb not null default '[]'::jsonb,
  corrections jsonb not null default '[]'::jsonb,
  better_vocabulary jsonb not null default '[]'::jsonb,
  natural_answer text not null default '',
  feedback text not null default '',
  audio_path text,
  is_demo boolean not null default false,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.pronunciation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  mode text not null default 'sound',
  target text not null default '',
  target_sound text,
  transcript text not null default '',
  accuracy numeric(5,2),
  feedback text not null default '',
  feedback_vi text not null default '',
  audio_path text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.pronunciation_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  sound text not null,
  score numeric(5,2) not null default 0,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, sound)
);

create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  topic text not null default 'Free Conversation',
  duration_seconds integer not null default 0,
  turn_count integer not null default 0,
  feedback text not null default '',
  performance numeric(3,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.conversation_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null,
  content text not null default '',
  created_at timestamptz not null default now()
);

create table public.ielts_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  part integer not null default 1,
  question_text text not null default '',
  transcript text not null default '',
  fluency_coherence numeric(3,1),
  lexical_resource numeric(3,1),
  grammatical_range numeric(3,1),
  pronunciation numeric(3,1),
  estimated_band numeric(3,1),
  feedback text not null default '',
  corrected_answer text not null default '',
  natural_answer text not null default '',
  band6_version text not null default '',
  band7_version text not null default '',
  band8_version text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.vocabulary_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  word_id uuid not null references public.vocabulary_words on delete cascade,
  times_practiced integer not null default 0,
  mastered boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, word_id)
);

create table public.listening_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  exercise_id uuid references public.listening_exercises on delete set null,
  score numeric(5,2) not null default 0,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  plan_date date not null default current_date,
  tasks jsonb not null default '[]'::jsonb,
  insights jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

do $$
declare t text;
begin
  foreach t in array array['speaking_attempts','pronunciation_attempts','pronunciation_scores','conversation_sessions','conversation_messages','ielts_attempts','vocabulary_progress','listening_attempts','daily_plans'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows %1$s" on public.%1$I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "admin read %1$s" on public.%1$I for select to authenticated using (public.has_role(auth.uid(),''admin''))', t);
  end loop;
end $$;

-- ============ ai usage + tts cache ============
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  capability text not null,
  provider text not null default 'lovable',
  model text not null default '',
  units integer not null default 1,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert on public.ai_usage_log to authenticated;
grant all on public.ai_usage_log to service_role;
alter table public.ai_usage_log enable row level security;
create policy "own usage read" on public.ai_usage_log for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own usage insert" on public.ai_usage_log for insert to authenticated with check (user_id = auth.uid());

create table public.tts_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  text_content text not null,
  voice text not null default 'default',
  audio_base64 text not null,
  mime_type text not null default 'audio/mpeg',
  hits integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.tts_cache to anon, authenticated;
grant all on public.tts_cache to service_role;
alter table public.tts_cache enable row level security;
create policy "cache readable" on public.tts_cache for select to anon, authenticated using (true);

-- ============ seed content ============
insert into public.speaking_questions (prompt, category, level) values
('What do you usually do on weekends?','Daily Life','A2'),
('Tell me about your family.','Family','A2'),
('Describe your best friend and why you get along.','Friends','B1'),
('What does a typical day at work look like for you?','Work','B1'),
('What was your favourite subject at school? Why?','School','A2'),
('Describe a trip you really enjoyed.','Travel','B1'),
('What kind of food do you like to cook?','Food','A2'),
('How do you usually decide what to buy online?','Shopping','B1'),
('What hobby would you like to start and why?','Hobbies','B1'),
('How do you stay healthy during a busy week?','Health','B2'),
('Describe a challenge you solved at work.','Business','B2'),
('How do you start a conversation with someone new?','Social Situations','B2');

insert into public.vocabulary_words (word, ipa, meaning_vi, meaning_en, category, level, example_sentence, example_vi, synonyms, antonyms) values
('commute','/kəˈmjuːt/','di chuyển đi làm hằng ngày','to travel regularly between home and work','Daily English','B1','I commute for about forty minutes every morning.','Tôi di chuyển khoảng bốn mươi phút mỗi sáng.','{travel,journey}','{}'),
('reliable','/rɪˈlaɪəbl/','đáng tin cậy','able to be trusted to do something well','Work & Office','B1','She is the most reliable person on our team.','Cô ấy là người đáng tin cậy nhất trong nhóm.','{dependable,trustworthy}','{unreliable}'),
('crave','/kreɪv/','khao khát, thèm','to want something very much','Food & Drinks','B2','I always crave something sweet after dinner.','Tôi luôn thèm đồ ngọt sau bữa tối.','{yearn,desire}','{}'),
('bargain','/ˈbɑːrɡɪn/','món hời; mặc cả','something bought for less than its usual price','Shopping','B1','This jacket was a real bargain.','Chiếc áo này thực sự là một món hời.','{deal,steal}','{}'),
('itinerary','/aɪˈtɪnəreri/','lịch trình','a planned route or schedule for a trip','Travel','B2','Our itinerary includes two days in Kyoto.','Lịch trình của chúng tôi có hai ngày ở Kyoto.','{schedule,plan}','{}'),
('deadline','/ˈdedlaɪn/','hạn cuối','the latest time something must be finished','Work & Office','A2','The deadline is Friday at noon.','Hạn cuối là trưa thứ Sáu.','{"due date"}','{}'),
('curriculum','/kəˈrɪkjələm/','chương trình học','the subjects taught in a school or course','School','B2','The new curriculum focuses on speaking.','Chương trình mới tập trung vào nói.','{syllabus}','{}'),
('symptom','/ˈsɪmptəm/','triệu chứng','a sign that you have an illness','Health','B1','A sore throat is a common symptom.','Đau họng là một triệu chứng thường gặp.','{sign,indication}','{}'),
('revenue','/ˈrevənuː/','doanh thu','the money a company receives from business','Business English','B2','Revenue grew by twelve percent last quarter.','Doanh thu tăng mười hai phần trăm quý trước.','{income,turnover}','{expenses}'),
('apologise','/əˈpɑːlədʒaɪz/','xin lỗi','to say sorry for something','Customer Service','A2','I apologise for the delay with your order.','Tôi xin lỗi vì sự chậm trễ đơn hàng của bạn.','{"say sorry"}','{}'),
('upgrade','/ˈʌpɡreɪd/','nâng cấp','to improve to a better version','Technology','B1','I need to upgrade my laptop this year.','Tôi cần nâng cấp laptop năm nay.','{improve,enhance}','{downgrade}'),
('get along','/ɡet əˈlɔːŋ/','hòa thuận với nhau','to have a friendly relationship','Phrasal Verbs','A2','My sister and I get along really well.','Tôi và em gái rất hòa thuận.','{}','{}'),
('look forward to','/lʊk ˈfɔːrwərd tuː/','háo hức chờ đợi','to feel excited about something that will happen','Phrasal Verbs','B1','I am looking forward to the weekend.','Tôi đang háo hức chờ cuối tuần.','{anticipate}','{}'),
('a piece of cake','/ə piːs əv keɪk/','dễ như ăn bánh','something very easy','Idioms','B2','The test was a piece of cake.','Bài kiểm tra dễ như ăn bánh.','{easy}','{}'),
('affect / effect','/əˈfekt/ /ɪˈfekt/','ảnh hưởng (động từ) / hiệu ứng (danh từ)','affect is a verb, effect is usually a noun','Commonly Confused Words','B2','Noise affects my sleep, and the effect lasts all day.','Tiếng ồn ảnh hưởng giấc ngủ, và hiệu ứng kéo dài cả ngày.','{}','{}'),
('significant','/sɪɡˈnɪfɪkənt/','đáng kể','large enough to be important','IELTS Vocabulary','B2','There was a significant increase in tourism.','Đã có sự gia tăng đáng kể về du lịch.','{considerable,notable}','{negligible}'),
('invoice','/ˈɪnvɔɪs/','hóa đơn','a document requesting payment','TOEIC Vocabulary','B1','Please send the invoice by email.','Vui lòng gửi hóa đơn qua email.','{bill}','{}'),
('supportive','/səˈpɔːrtɪv/','hỗ trợ, động viên','giving help and encouragement','Relationships','B1','My partner is very supportive of my studies.','Bạn đời của tôi rất động viên việc học của tôi.','{encouraging}','{}');

insert into public.grammar_lessons (slug, title, level, summary, explanation, explanation_vi, examples, exercises, sort_order) values
('present-simple','Present Simple','A1','Habits, routines and facts.','Use the present simple for habits, routines, schedules and general truths. Add -s for he/she/it.','Dùng hiện tại đơn cho thói quen, lịch trình và sự thật chung. Thêm -s với he/she/it.','["I work in a bank.","She works from home on Fridays.","Water boils at 100 degrees."]','[{"type":"multiple_choice","q":"She ___ coffee every morning.","options":["drink","drinks","drinking"],"answer":"drinks"},{"type":"fill_blank","q":"They ___ (live) in Hanoi.","answer":"live"}]',1),
('present-continuous','Present Continuous','A1','Actions happening now or around now.','Use am/is/are + verb-ing for actions in progress or temporary situations.','Dùng am/is/are + V-ing cho hành động đang diễn ra hoặc tạm thời.','["I am studying English right now.","They are building a new office."]','[{"type":"multiple_choice","q":"Look! It ___ .","options":["rains","is raining","rained"],"answer":"is raining"}]',2),
('present-perfect','Present Perfect','B1','Past actions with a present result.','Use have/has + past participle for experiences, unfinished time and recent results.','Dùng have/has + V3 cho trải nghiệm, thời gian chưa kết thúc và kết quả gần đây.','["I have lived here for five years.","She has just finished her report."]','[{"type":"multiple_choice","q":"I ___ never been to Japan.","options":["have","has","had"],"answer":"have"},{"type":"fill_blank","q":"We ___ (know) each other since 2019.","answer":"have known"}]',3),
('past-simple','Past Simple','A2','Finished actions in the past.','Use the past simple for completed actions with a finished time reference.','Dùng quá khứ đơn cho hành động đã hoàn tất trong quá khứ.','["I visited my grandparents last weekend.","He did not call me yesterday."]','[{"type":"fill_blank","q":"She ___ (go) to the market yesterday.","answer":"went"}]',4),
('past-continuous','Past Continuous','A2','Actions in progress in the past.','Use was/were + verb-ing for background actions interrupted by another event.','Dùng was/were + V-ing cho hành động đang diễn ra trong quá khứ.','["I was cooking when she arrived."]','[{"type":"multiple_choice","q":"They ___ TV when the lights went out.","options":["watched","were watching","watch"],"answer":"were watching"}]',5),
('past-perfect','Past Perfect','B2','The earlier of two past actions.','Use had + past participle for the action that happened first.','Dùng had + V3 cho hành động xảy ra trước.','["The train had left before we arrived."]','[{"type":"fill_blank","q":"By the time I got there, he ___ (leave).","answer":"had left"}]',6),
('future-simple','Future Simple','A2','Predictions and instant decisions.','Use will + base verb for predictions, promises and spontaneous decisions.','Dùng will + V cho dự đoán, lời hứa và quyết định tức thời.','["I will help you with that.","It will probably rain tomorrow."]','[{"type":"multiple_choice","q":"I think she ___ love it.","options":["will","is","was"],"answer":"will"}]',7),
('future-forms','Future Forms','B1','Will, going to and present continuous.','Use going to for plans and evidence, present continuous for arrangements, will for predictions.','Dùng going to cho kế hoạch, hiện tại tiếp diễn cho hẹn trước, will cho dự đoán.','["I am going to start a course.","I am meeting my manager at ten."]','[{"type":"multiple_choice","q":"We ___ fly to Da Nang on Monday (arrangement).","options":["will","are flying","fly"],"answer":"are flying"}]',8),
('modal-verbs','Modal Verbs','B1','Ability, permission, obligation and advice.','Modals such as can, must, should and might are followed by the base verb.','Động từ khiếm khuyết như can, must, should, might đi với động từ nguyên mẫu.','["You should rest.","She can speak three languages."]','[{"type":"multiple_choice","q":"You ___ wear a helmet. It is the law.","options":["must","might","could"],"answer":"must"}]',9),
('conditionals','Conditionals','B2','Zero, first, second and third conditionals.','Match the condition type to the tense pattern: if + present / will, if + past / would, if + past perfect / would have.','Ghép loại điều kiện với thì tương ứng.','["If it rains, I will stay home.","If I had more time, I would travel more."]','[{"type":"fill_blank","q":"If I ___ (be) you, I would apply.","answer":"were"}]',10),
('passive-voice','Passive Voice','B2','Focus on the action, not the doer.','Use be + past participle when the doer is unknown or unimportant.','Dùng be + V3 khi người thực hiện không quan trọng.','["The report was written last night."]','[{"type":"fill_blank","q":"English ___ (speak) all over the world.","answer":"is spoken"}]',11),
('reported-speech','Reported Speech','B2','Telling someone what was said.','Shift the tense back one step and adjust pronouns and time words.','Lùi thì một bước và điều chỉnh đại từ, trạng từ thời gian.','["She said she was tired."]','[{"type":"fill_blank","q":"He said, \"I am busy.\" -> He said he ___ busy.","answer":"was"}]',12),
('relative-clauses','Relative Clauses','B2','Adding information with who, which, that.','Use who for people, which for things, that in defining clauses.','Dùng who cho người, which cho vật, that trong câu xác định.','["The man who called you is my boss."]','[{"type":"multiple_choice","q":"The book ___ I bought is great.","options":["who","that","where"],"answer":"that"}]',13),
('articles','Articles','A2','A, an and the.','Use a/an for non-specific singular nouns and the for specific ones.','Dùng a/an cho danh từ chưa xác định, the cho danh từ xác định.','["I bought a car. The car is red."]','[{"type":"fill_blank","q":"She is ___ engineer.","answer":"an"}]',14),
('prepositions','Prepositions','A2','In, on, at and more.','Prepositions of time and place follow common patterns worth memorising in chunks.','Giới từ chỉ thời gian và nơi chốn nên học theo cụm.','["at 7 pm, on Monday, in July"]','[{"type":"fill_blank","q":"See you ___ Friday.","answer":"on"}]',15),
('comparatives','Comparatives and Superlatives','A2','Comparing things.','Add -er/-est to short adjectives and use more/most with longer ones.','Thêm -er/-est với tính từ ngắn, more/most với tính từ dài.','["This is cheaper.","It is the most interesting book."]','[{"type":"fill_blank","q":"This test is ___ (easy) than the last one.","answer":"easier"}]',16),
('gerunds-infinitives','Gerunds and Infinitives','B2','Verb + -ing or verb + to.','Some verbs take -ing, others take to + base verb; some change meaning.','Một số động từ đi với -ing, số khác đi với to + V.','["I enjoy reading.","I decided to leave."]','[{"type":"multiple_choice","q":"I avoid ___ late.","options":["to work","working","work"],"answer":"working"}]',17),
('countable-uncountable','Countable and Uncountable Nouns','A2','Much, many, some, any.','Countable nouns take many/a few; uncountable nouns take much/a little.','Danh từ đếm được dùng many, không đếm được dùng much.','["much water, many bottles"]','[{"type":"multiple_choice","q":"How ___ information do you need?","options":["many","much"],"answer":"much"}]',18),
('subject-verb-agreement','Subject-Verb Agreement','B1','Matching subjects and verbs.','Singular subjects take singular verbs; watch out for phrases between subject and verb.','Chủ ngữ số ít đi với động từ số ít.','["The list of items is long."]','[{"type":"fill_blank","q":"Everyone ___ (be) here.","answer":"is"}]',19);

insert into public.listening_exercises (title, level, activity_type, transcript, questions) values
('Ordering coffee','A1','listen_and_choose','Good morning! Can I get a medium latte, please? Of course. Anything else? No, that is all, thank you.','[{"q":"What does the customer order?","options":["A small tea","A medium latte","A large coffee"],"answer":"A medium latte"}]'),
('Asking for directions','A2','listen_and_answer','Excuse me, how do I get to the train station? Go straight for two blocks, then turn left. It is next to the post office.','[{"q":"Where is the station?","options":["Next to the post office","Behind the bank","Inside the mall"],"answer":"Next to the post office"}]'),
('A short work update','B1','fill_in_the_blank','I finished the report last night and sent it to the client this morning.','[{"q":"I finished the report ___ night.","answer":"last"}]'),
('Dictation: weekend plans','B1','dictation','On Saturday I am going to visit my cousin and then we will watch a film together.','[{"q":"Type what you hear.","answer":"On Saturday I am going to visit my cousin and then we will watch a film together."}]'),
('Shadowing: introducing yourself','B2','shadowing','Hi, my name is Minh. I work as a product designer and I have been learning English for about three years.','[]'),
('Conversation: a job interview','C1','conversation_listening','So, tell me a little about your background. I studied economics and then moved into data analysis, where I have spent the last six years.','[{"q":"What field did the speaker move into?","options":["Marketing","Data analysis","Teaching"],"answer":"Data analysis"}]');

insert into public.ielts_questions (part, topic, prompt, cue_points) values
(1,'Hometown','Where are you from, and what is your hometown like?','{}'),
(1,'Work or study','Do you work or are you a student? Tell me about it.','{}'),
(1,'Free time','What do you usually do in your free time?','{}'),
(2,'A person','Describe a person who has influenced you.','{"who the person is","how you know them","what they did","why they influenced you"}'),
(2,'A place','Describe a place you like to spend time in.','{"where it is","how often you go there","what you do there","why you like it"}'),
(2,'An experience','Describe a time when you learned something new.','{"what you learned","when it happened","how you learned it","how you felt about it"}'),
(3,'Influence','Why do you think some people influence others so strongly?','{}'),
(3,'Public spaces','How could cities create better public spaces for people?','{}'),
(3,'Learning','Do you think adults and children learn new skills differently? Why?','{}');