-- Seeds public.vocabulary_translations for the 18 words already in
-- public.vocabulary_words, across 6 locales (es, fr, de, ja, ko, zh-CN).
--
-- Why: /vocabulary falls back to `vocabulary_translations` for every locale
-- except Vietnamese (which reads the vocabulary_words.meaning_vi/example_vi
-- columns directly) and English (which shows meaning_en as-is). Until now
-- vocabulary_translations was empty, so every non-English, non-Vietnamese
-- learner saw a blank "local meaning" field. See src/routes/vocabulary.tsx
-- localMeaning()/localExample().
--
-- Remaining locales (pt, it, zh-TW, hi, id, tr, ru, ar) are not covered yet —
-- same pattern, follow-up migration.

with t(word, locale, meaning, example_translation) as (
  values
  -- Spanish
  ('commute','es','desplazarse (a diario) al trabajo','Me desplazo unos cuarenta minutos cada mañana.'),
  ('reliable','es','confiable, de fiar','Ella es la persona más confiable de nuestro equipo.'),
  ('crave','es','antojarse, desear con muchas ganas','Siempre se me antoja algo dulce después de cenar.'),
  ('bargain','es','ganga','Esta chaqueta fue una verdadera ganga.'),
  ('itinerary','es','itinerario','Nuestro itinerario incluye dos días en Kioto.'),
  ('deadline','es','fecha límite','La fecha límite es el viernes al mediodía.'),
  ('curriculum','es','plan de estudios','El nuevo plan de estudios se centra en la expresión oral.'),
  ('symptom','es','síntoma','El dolor de garganta es un síntoma común.'),
  ('revenue','es','ingresos','Los ingresos crecieron un doce por ciento el trimestre pasado.'),
  ('apologise','es','disculparse','Me disculpo por el retraso con su pedido.'),
  ('upgrade','es','actualizar, mejorar','Necesito actualizar mi portátil este año.'),
  ('get along','es','llevarse bien','Mi hermana y yo nos llevamos muy bien.'),
  ('look forward to','es','esperar con ilusión','Estoy deseando que llegue el fin de semana.'),
  ('a piece of cake','es','pan comido','El examen fue pan comido.'),
  ('affect / effect','es','afectar (verbo) / efecto (sustantivo)','El ruido afecta mi sueño, y el efecto dura todo el día.'),
  ('significant','es','significativo, considerable','Hubo un aumento significativo del turismo.'),
  ('invoice','es','factura','Envíe la factura por correo electrónico, por favor.'),
  ('supportive','es','que brinda apoyo, alentador','Mi pareja me apoya mucho en mis estudios.'),

  -- French
  ('commute','fr','faire la navette (domicile-travail)','Je fais la navette environ quarante minutes chaque matin.'),
  ('reliable','fr','fiable','C''est la personne la plus fiable de notre équipe.'),
  ('crave','fr','avoir très envie de','J''ai toujours très envie de sucré après le dîner.'),
  ('bargain','fr','bonne affaire','Cette veste était une vraie bonne affaire.'),
  ('itinerary','fr','itinéraire','Notre itinéraire comprend deux jours à Kyoto.'),
  ('deadline','fr','date limite','La date limite est vendredi à midi.'),
  ('curriculum','fr','programme d''études','Le nouveau programme met l''accent sur l''expression orale.'),
  ('symptom','fr','symptôme','Le mal de gorge est un symptôme courant.'),
  ('revenue','fr','chiffre d''affaires, revenu','Le chiffre d''affaires a augmenté de douze pour cent le trimestre dernier.'),
  ('apologise','fr','s''excuser','Je m''excuse pour le retard de votre commande.'),
  ('upgrade','fr','mettre à niveau, améliorer','Je dois mettre à niveau mon ordinateur portable cette année.'),
  ('get along','fr','bien s''entendre','Ma sœur et moi nous entendons très bien.'),
  ('look forward to','fr','avoir hâte de','J''ai hâte d''être au week-end.'),
  ('a piece of cake','fr','un jeu d''enfant','L''examen était un jeu d''enfant.'),
  ('affect / effect','fr','affecter (verbe) / effet (nom)','Le bruit affecte mon sommeil, et l''effet dure toute la journée.'),
  ('significant','fr','important, considérable','Il y a eu une augmentation importante du tourisme.'),
  ('invoice','fr','facture','Veuillez envoyer la facture par e-mail.'),
  ('supportive','fr','qui soutient, encourageant','Mon/Ma partenaire me soutient beaucoup dans mes études.'),

  -- German
  ('commute','de','pendeln','Ich pendle jeden Morgen etwa vierzig Minuten.'),
  ('reliable','de','zuverlässig','Sie ist die zuverlässigste Person in unserem Team.'),
  ('crave','de','sich sehnen nach, großes Verlangen haben','Nach dem Abendessen habe ich immer Lust auf etwas Süßes.'),
  ('bargain','de','Schnäppchen','Diese Jacke war ein echtes Schnäppchen.'),
  ('itinerary','de','Reiseroute','Unsere Reiseroute umfasst zwei Tage in Kyoto.'),
  ('deadline','de','Frist, Abgabetermin','Die Frist ist Freitagmittag.'),
  ('curriculum','de','Lehrplan','Der neue Lehrplan konzentriert sich auf das Sprechen.'),
  ('symptom','de','Symptom','Halsschmerzen sind ein häufiges Symptom.'),
  ('revenue','de','Umsatz','Der Umsatz stieg im letzten Quartal um zwölf Prozent.'),
  ('apologise','de','sich entschuldigen','Ich entschuldige mich für die Verzögerung Ihrer Bestellung.'),
  ('upgrade','de','aktualisieren, upgraden','Ich muss dieses Jahr mein Laptop aufrüsten.'),
  ('get along','de','gut auskommen','Meine Schwester und ich kommen sehr gut miteinander aus.'),
  ('look forward to','de','sich freuen auf','Ich freue mich auf das Wochenende.'),
  ('a piece of cake','de','ein Kinderspiel','Die Prüfung war ein Kinderspiel.'),
  ('affect / effect','de','beeinflussen (Verb) / Wirkung (Substantiv)','Lärm beeinträchtigt meinen Schlaf, und die Wirkung hält den ganzen Tag an.'),
  ('significant','de','erheblich, bedeutend','Es gab einen deutlichen Anstieg des Tourismus.'),
  ('invoice','de','Rechnung','Bitte senden Sie die Rechnung per E-Mail.'),
  ('supportive','de','unterstützend','Mein Partner/Meine Partnerin unterstützt mich sehr bei meinem Studium.'),

  -- Japanese
  ('commute','ja','通勤する','私は毎朝約40分かけて通勤します。'),
  ('reliable','ja','信頼できる','彼女はチームで一番信頼できる人です。'),
  ('crave','ja','無性に欲しがる、渇望する','夕食後はいつも甘いものが無性に食べたくなります。'),
  ('bargain','ja','掘り出し物、お買い得品','このジャケットは本当にお買い得でした。'),
  ('itinerary','ja','旅程','私たちの旅程には京都での2日間が含まれています。'),
  ('deadline','ja','締め切り','締め切りは金曜日の正午です。'),
  ('curriculum','ja','カリキュラム','新しいカリキュラムはスピーキングに重点を置いています。'),
  ('symptom','ja','症状','喉の痛みはよくある症状です。'),
  ('revenue','ja','収益','収益は前四半期に12パーセント増加しました。'),
  ('apologise','ja','謝る','ご注文の遅れをお詫びいたします。'),
  ('upgrade','ja','アップグレードする','今年はノートパソコンをアップグレードする必要があります。'),
  ('get along','ja','仲良くする','私と妹はとても仲が良いです。'),
  ('look forward to','ja','楽しみにする','週末を楽しみにしています。'),
  ('a piece of cake','ja','朝飯前、とても簡単なこと','そのテストは朝飯前でした。'),
  ('affect / effect','ja','影響を与える（動詞）／効果、影響（名詞）','騒音は私の睡眠に影響を与え、その影響は一日中続きます。'),
  ('significant','ja','重要な、かなりの','観光客が大幅に増加しました。'),
  ('invoice','ja','請求書','請求書をメールでお送りください。'),
  ('supportive','ja','支えになる、協力的な','私のパートナーは私の勉強をとても支えてくれています。'),

  -- Korean
  ('commute','ko','통근하다','저는 매일 아침 약 40분 동안 통근합니다.'),
  ('reliable','ko','믿을 수 있는','그녀는 우리 팀에서 가장 믿을 수 있는 사람입니다.'),
  ('crave','ko','몹시 원하다, 갈망하다','저녁을 먹고 나면 항상 단 것이 당깁니다.'),
  ('bargain','ko','싸게 산 물건, 득템','이 재킷은 정말 싸게 산 거예요.'),
  ('itinerary','ko','여행 일정','저희 일정에는 교토에서의 이틀이 포함되어 있습니다.'),
  ('deadline','ko','마감일','마감일은 금요일 정오입니다.'),
  ('curriculum','ko','교육 과정','새 교육 과정은 말하기에 중점을 둡니다.'),
  ('symptom','ko','증상','인후통은 흔한 증상입니다.'),
  ('revenue','ko','수익, 매출','지난 분기 매출이 12퍼센트 증가했습니다.'),
  ('apologise','ko','사과하다','주문 지연에 대해 사과드립니다.'),
  ('upgrade','ko','업그레이드하다','올해 노트북을 업그레이드해야 합니다.'),
  ('get along','ko','사이좋게 지내다','저와 여동생은 정말 사이가 좋습니다.'),
  ('look forward to','ko','기대하다','저는 주말을 기대하고 있습니다.'),
  ('a piece of cake','ko','식은 죽 먹기','그 시험은 식은 죽 먹기였습니다.'),
  ('affect / effect','ko','영향을 미치다(동사) / 영향, 효과(명사)','소음은 제 수면에 영향을 미치고, 그 영향은 하루 종일 지속됩니다.'),
  ('significant','ko','상당한, 중요한','관광객 수가 상당히 증가했습니다.'),
  ('invoice','ko','청구서, 송장','이메일로 청구서를 보내 주세요.'),
  ('supportive','ko','지지하는, 힘이 되는','제 파트너는 제 공부를 많이 응원해 줍니다.'),

  -- Simplified Chinese
  ('commute','zh-CN','通勤','我每天早上通勤大约四十分钟。'),
  ('reliable','zh-CN','可靠的','她是我们团队中最可靠的人。'),
  ('crave','zh-CN','渴望，非常想要','晚饭后我总是很想吃甜食。'),
  ('bargain','zh-CN','划算的东西，便宜货','这件夹克真的很划算。'),
  ('itinerary','zh-CN','行程','我们的行程包括在京都的两天。'),
  ('deadline','zh-CN','截止日期','截止日期是周五中午。'),
  ('curriculum','zh-CN','课程设置','新课程侧重于口语。'),
  ('symptom','zh-CN','症状','喉咙痛是一种常见症状。'),
  ('revenue','zh-CN','收入，营业额','上个季度营业额增长了百分之十二。'),
  ('apologise','zh-CN','道歉','我为您订单的延迟道歉。'),
  ('upgrade','zh-CN','升级','我今年需要升级我的笔记本电脑。'),
  ('get along','zh-CN','相处融洽','我和妹妹相处得很好。'),
  ('look forward to','zh-CN','期待','我很期待周末的到来。'),
  ('a piece of cake','zh-CN','小菜一碟','那次考试简直是小菜一碟。'),
  ('affect / effect','zh-CN','影响（动词）／效果、影响（名词）','噪音影响了我的睡眠，这种影响持续一整天。'),
  ('significant','zh-CN','显著的，重要的','旅游业出现了显著增长。'),
  ('invoice','zh-CN','发票','请通过电子邮件发送发票。'),
  ('supportive','zh-CN','给予支持的，鼓励的','我的伴侣非常支持我的学业。')
)
insert into public.vocabulary_translations (word_id, locale, meaning, example_translation)
select vw.id, t.locale, t.meaning, t.example_translation
from t
join public.vocabulary_words vw on vw.word = t.word
on conflict (word_id, locale)
do update set
  meaning = excluded.meaning,
  example_translation = excluded.example_translation,
  updated_at = now();
