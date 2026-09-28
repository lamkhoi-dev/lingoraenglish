#!/usr/bin/env python3
"""
Ensures all 8 skills' 51st lesson ('Practice') has EXACTLY 50 distinct items,
with ZERO duplicates against lessons 1..50 of that skill and ZERO internal duplicates.
"""
import json
import os
import sys

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

SEED_DIR = os.path.join(os.path.dirname(__file__), "seed", "pronunciation-lessons")

# 1. WORD STRESS (50 unique words across various syllable counts & patterns)
WORD_STRESS_ITEMS = [
    {"text": "avocado", "pattern": "a-vo-CA-do", "note": "Third syllable 'CA' carries the primary stress."},
    {"text": "certificate", "pattern": "cer-TIF-i-cate", "note": "Second syllable 'TIF' is stressed."},
    {"text": "caterpillar", "pattern": "CAT-er-pil-lar", "note": "Primary stress on the first syllable 'CAT'."},
    {"text": "refrigerator", "pattern": "re-FRIG-er-a-tor", "note": "Second syllable 'FRIG' is stressed; other syllables compress."},
    {"text": "enthusiastic", "pattern": "en-thu-si-AS-tic", "note": "Stress on 'AS' directly before -tic."},
    {"text": "personality", "pattern": "per-son-AL-i-ty", "note": "Stress on 'AL' right before -ity."},
    {"text": "electricity", "pattern": "e-lec-TRIC-i-ty", "note": "Stress on 'TRIC' before -ity."},
    {"text": "administration", "pattern": "ad-min-is-TRA-tion", "note": "Primary stress on 'TRA' before -tion."},
    {"text": "qualification", "pattern": "qual-i-fi-CA-tion", "note": "Primary stress on 'CA' before -tion."},
    {"text": "investigation", "pattern": "in-ves-ti-GA-tion", "note": "Primary stress on 'GA' before -tion."},
    {"text": "magnificent", "pattern": "mag-NIF-i-cent", "note": "Second syllable 'NIF' takes the beat."},
    {"text": "laboratory", "pattern": "LAB-o-ra-to-ry", "note": "First syllable 'LAB' is stressed in American English."},
    {"text": "particular", "pattern": "par-TIC-u-lar", "note": "Second syllable 'TIC' takes the stress."},
    {"text": "coincidence", "pattern": "co-IN-ci-dence", "note": "Second syllable 'IN' carries the main stress."},
    {"text": "fascinating", "pattern": "FAS-ci-nat-ing", "note": "First syllable 'FAS' carries the stress."},
    {"text": "architect", "pattern": "AR-chi-tect", "note": "First syllable 'AR' is stressed."},
    {"text": "architecture", "pattern": "AR-chi-tec-ture", "note": "First syllable 'AR' carries primary stress."},
    {"text": "architectural", "pattern": "ar-chi-TEC-tur-al", "note": "Stress shifts to the third syllable 'TEC'."},
    {"text": "geography", "pattern": "ge-OG-ra-phy", "note": "Second syllable 'OG' takes the stress."},
    {"text": "geographic", "pattern": "ge-o-GRAPH-ic", "note": "Stress shifts to 'GRAPH' before -ic."},
    {"text": "philosophy", "pattern": "phi-LOS-o-phy", "note": "Second syllable 'LOS' is stressed."},
    {"text": "philosophical", "pattern": "phil-o-SOPH-i-cal", "note": "Stress shifts to 'SOPH' before -ical."},
    {"text": "psychology", "pattern": "psy-CHOL-o-gy", "note": "Second syllable 'CHOL' is stressed."},
    {"text": "psychological", "pattern": "psy-cho-LOG-i-cal", "note": "Stress shifts to 'LOG' before -ical."},
    {"text": "astronomy", "pattern": "as-TRON-o-my", "note": "Second syllable 'TRON' takes the stress."},
    {"text": "astronomical", "pattern": "as-tro-NOM-i-cal", "note": "Stress shifts to 'NOM' before -ical."},
    {"text": "appreciate", "pattern": "ap-PRE-ci-ate", "note": "Second syllable 'PRE' carries the stress."},
    {"text": "encyclopedia", "pattern": "en-cy-clo-PE-di-a", "note": "Stress on the fourth syllable 'PE'."},
    {"text": "anticipate", "pattern": "an-TIC-i-pate", "note": "Second syllable 'TIC' is stressed."},
    {"text": "congratulate", "pattern": "con-GRAT-u-late", "note": "Second syllable 'GRAT' carries primary stress."},
    {"text": "accelerate", "pattern": "ac-CEL-er-ate", "note": "Second syllable 'CEL' is stressed."},
    {"text": "refugee", "pattern": "ref-u-GEE", "note": "Suffix -ee attracts stress to the last syllable."},
    {"text": "pioneer", "pattern": "pi-o-NEER", "note": "Suffix -eer takes the final stress."},
    {"text": "souvenir", "pattern": "sou-ve-NIR", "note": "Final syllable 'NIR' receives primary stress."},
    {"text": "cigarette", "pattern": "cig-a-RETTE", "note": "Stress on the final syllable 'RETTE'."},
    {"text": "kitchenware", "pattern": "KITCH-en-ware", "note": "Compound noun: primary stress on first noun 'KITCH'."},
    {"text": "sunflower", "pattern": "SUN-flow-er", "note": "Compound noun: stress the first element 'SUN'."},
    {"text": "raincoat", "pattern": "RAIN-coat", "note": "Compound noun: strong first syllable 'RAIN'."},
    {"text": "headphones", "pattern": "HEAD-phones", "note": "Compound noun: stress on 'HEAD'."},
    {"text": "earthquake", "pattern": "EARTH-quake", "note": "Compound noun: 'EARTH' is emphasized."},
    {"text": "firefighter", "pattern": "FIRE-fight-er", "note": "Compound noun: stress on 'FIRE'."},
    {"text": "traffic jam", "pattern": "TRAF-fic jam", "note": "Compound noun: primary stress falls on 'TRAF'."},
    {"text": "swimming pool", "pattern": "SWIM-ming pool", "note": "Gerund compound: primary stress on 'SWIM'."},
    {"text": "a RE-fund", "pattern": "RE-fund (noun)", "note": "Noun: stress on the first syllable 'RE'."},
    {"text": "to re-FUND", "pattern": "re-FUND (verb)", "note": "Verb: stress moves to the second syllable 'FUND'."},
    {"text": "a PRO-test", "pattern": "PRO-test (noun)", "note": "Noun: stress on the first syllable 'PRO'."},
    {"text": "to pro-TEST", "pattern": "pro-TEST (verb)", "note": "Verb: stress moves to the second syllable 'TEST'."},
    {"text": "an UP-date", "pattern": "UP-date (noun)", "note": "Noun: stress on the prefix 'UP'."},
    {"text": "to up-DATE", "pattern": "up-DATE (verb)", "note": "Verb: stress moves to 'DATE'."},
    {"text": "deliberate", "pattern": "de-LIB-er-ate", "note": "Second syllable 'LIB' is stressed."}
]

# Fix cigarette bracket typo
WORD_STRESS_ITEMS[34]["note"] = "Stress on the final syllable 'RETTE'."

# 2. SENTENCE STRESS (50 completely distinct sentences - no repeated templates)
SENTENCE_STRESS_ITEMS = [
    {"text": "I lost my phone yesterday.", "pattern": "I LOST my PHONE YES-ter-day.", "note": "Main emphasis on 'lost', 'phone', and 'yesterday'."},
    {"text": "She bought a beautiful new car.", "pattern": "she BOUGHT a BEAU-ti-ful NEW CAR.", "note": "'bought', 'beautiful', 'new', 'car' carry the sentence beats."},
    {"text": "Can you pick me up at the airport?", "pattern": "can you PICK me UP at the AIR-port?", "note": "Stress on phrasal verb 'pick up' and 'airport'."},
    {"text": "We need to discuss the project schedule.", "pattern": "we NEED to dis-CUSS the PRO-ject SCHED-ule.", "note": "Grammar words 'we', 'to', 'the' are quick and soft."},
    {"text": "He didn't know the answer to the question.", "pattern": "he DID-n't KNOW the AN-swer to the QUES-tion.", "note": "'didn't' and 'know' take focus."},
    {"text": "I was waiting for you in the lobby.", "pattern": "I was WAIT-ing for you in the LOB-by.", "note": "'waiting' and 'lobby' carry the content."},
    {"text": "Could you send me the report by five?", "pattern": "could you SEND me the re-PORT by FIVE?", "note": "Stress on 'send', 'report', and 'five'."},
    {"text": "They decided to cancel the outdoor concert.", "pattern": "they de-CI-ded to CAN-cel the OUT-door CON-cert.", "note": "Four content beats drive the rhythm."},
    {"text": "My sister lives in a small apartment downtown.", "pattern": "my SIS-ter LIVES in a SMALL a-PART-ment DOWN-town.", "note": "Notice the quick unstressed words between beats."},
    {"text": "I really appreciate all your valuable support.", "pattern": "I REAL-ly ap-PRE-ci-ate ALL your VAL-u-a-ble sup-PORT.", "note": "'really', 'appreciate', 'all', 'valuable', 'support'."},
    {"text": "Are you going to the party tonight?", "pattern": "are you GO-ing to the PAR-ty to-NIGHT?", "note": "'going', 'party', 'tonight' take the pitch peaks."},
    {"text": "The train leaves in ten minutes.", "pattern": "the TRAIN LEAVES in TEN MIN-utes.", "note": "'train', 'leaves', 'ten', 'minutes' are stressed."},
    {"text": "I don't think that's a good idea.", "pattern": "I DON'T THINK that's a GOOD i-DEA.", "note": "Negatives like 'don't' always receive stress."},
    {"text": "What time does your plane arrive?", "pattern": "what TIME does your PLANE ar-RIVE?", "note": "Question word 'time', 'plane', 'arrive'."},
    {"text": "Please turn off your mobile devices.", "pattern": "please TURN OFF your MO-bile de-VI-ces.", "note": "'turn off', 'mobile', 'devices'."},
    {"text": "She graduated at the top of her class.", "pattern": "she GRAD-u-at-ed at the TOP of her CLASS.", "note": "'graduated', 'top', 'class' take prominence."},
    {"text": "We should grab a cup of coffee.", "pattern": "we should GRAB a CUP of COF-fee.", "note": "'should', 'a', 'of' are reduced; 'grab', 'cup', 'coffee' stressed."},
    {"text": "I left my wallet on the kitchen table.", "pattern": "I LEFT my WAL-let on the KITCH-en TA-ble.", "note": "Four clear peaks: 'left', 'wallet', 'kitchen', 'table'."},
    {"text": "Why didn't anyone tell me about this?", "pattern": "WHY DID-n't AN-y-one TELL me a-bout THIS?", "note": "Question word 'why', 'didn't', 'tell', 'this'."},
    {"text": "The doctor advised him to rest for a week.", "pattern": "the DOC-tor ad-VISED him to REST for a WEEK.", "note": "'doctor', 'advised', 'rest', 'week'."},
    {"text": "I told him to call me, but he emailed instead.", "pattern": "I TOLD him to CALL me, but he E-mailed in-STEAD.", "note": "Contrastive stress between 'call' and 'emailed'."},
    {"text": "I said fifteen dollars, not fifty dollars.", "pattern": "I said fif-TEEN DOL-lars, not FIF-ty DOL-lars.", "note": "Contrastive stress highlights 'fifTEEN' vs 'FIFty'."},
    {"text": "Do you want green tea or black tea?", "pattern": "do you want GREEN tea or BLACK tea?", "note": "Contrastive stress highlights 'GREEN' and 'BLACK'."},
    {"text": "She wanted a red dress, not a blue one.", "pattern": "she wanted a RED dress, not a BLUE one.", "note": "Contrast between colors 'RED' and 'BLUE'."},
    {"text": "I asked for hot coffee, but this is iced.", "pattern": "I asked for HOT cof-fee, but this is ICED.", "note": "Contrast on temperature 'HOT' vs 'ICED'."},
    {"text": "We booked the morning flight to avoid delays.", "pattern": "we BOOKED the MORN-ing FLIGHT to a-VOID de-LAYS.", "note": "Content words carry the sentence forward."},
    {"text": "Can anyone recommend a reliable plumber?", "pattern": "can AN-y-one rec-om-MEND a re-LI-a-ble PLUM-ber?", "note": "Four stressed peaks in the question."},
    {"text": "He always forgets to lock the front door.", "pattern": "he AL-ways for-GETS to LOCK the FRONT DOOR.", "note": "Adverbs of frequency like 'always' often take stress."},
    {"text": "I rarely eat fast food on weekdays.", "pattern": "I RARE-ly EAT FAST FOOD on WEEK-days.", "note": "'rarely', 'eat', 'fast food', 'weekdays'."},
    {"text": "She never drinks sugary beverages in the evening.", "pattern": "she NEV-er DRINKS SUG-ar-y BEV-er-a-ges in the EVE-ning.", "note": "Rhythmic peaks on descriptive words."},
    {"text": "Could you explain that concept one more time?", "pattern": "could you ex-PLAIN that CON-cept ONE MORE TIME?", "note": "'explain', 'concept', 'one more time'."},
    {"text": "The manager wants everyone in the conference room.", "pattern": "the MAN-a-ger WANTS EV-ery-one in the CON-fer-ence ROOM.", "note": "Emphasis on key nouns and verb."},
    {"text": "I can hardly hear what the speaker is saying.", "pattern": "I can HARD-ly HEAR what the SPEAK-er is SAY-ing.", "note": "'hardly', 'hear', 'speaker', 'saying'."},
    {"text": "They promised to deliver the package by noon.", "pattern": "they PROM-ised to de-LIV-er the PACK-age by NOON.", "note": "'promised', 'deliver', 'package', 'noon'."},
    {"text": "You shouldn't have opened that attachment.", "pattern": "you SHOULD-n't have O-pened that at-TACH-ment.", "note": "Negative modal 'shouldn't' is heavily emphasized."},
    {"text": "Nobody expected such an incredible outcome.", "pattern": "NO-bod-y ex-PEC-ted such an in-CRED-i-ble OUT-come.", "note": "'nobody', 'expected', 'incredible', 'outcome'."},
    {"text": "We must submit the final draft before midnight.", "pattern": "we MUST sub-MIT the FI-nal DRAFT be-fore MID-night.", "note": "'must' takes emphatic modal stress."},
    {"text": "How much did you pay for those tickets?", "pattern": "how MUCH did you PAY for those TICK-ets?", "note": "Question focus on 'much', 'pay', 'tickets'."},
    {"text": "Where did you put the spare keys?", "pattern": "WHERE did you PUT the SPARE KEYS?", "note": "Focus on location 'where', action 'put', and 'spare keys'."},
    {"text": "Who told you about the secret surprise?", "pattern": "WHO TOLD you a-bout the SE-cret sur-PRISE?", "note": "Focus on identity 'who', 'told', 'secret surprise'."},
    {"text": "I thought you were studying for the exam.", "pattern": "I THOUGHT you were STUD-y-ing for the ex-AM.", "note": "'thought', 'studying', 'exam'."},
    {"text": "She looked everywhere for her missing cat.", "pattern": "she looked EV-ery-where for her MISS-ing CAT.", "note": "'everywhere', 'missing', 'cat'."},
    {"text": "Our team won the national championship today.", "pattern": "our TEAM WON the NA-tion-al CHAM-pi-on-ship to-DAY.", "note": "'team', 'won', 'national', 'championship', 'today'."},
    {"text": "I honestly believe we can finish on schedule.", "pattern": "I HON-est-ly be-LIEVE we can FIN-ish on SCHED-ule.", "note": "'honestly', 'believe', 'finish', 'schedule'."},
    {"text": "The traffic was terrible on the bridge.", "pattern": "the TRAF-fic was TER-ri-ble on the BRIDGE.", "note": "'traffic', 'terrible', 'bridge'."},
    {"text": "He offered to drive us straight to the station.", "pattern": "he OF-fered to DRIVE us STRAIGHT to the STA-tion.", "note": "'offered', 'drive', 'straight', 'station'."},
    {"text": "We ordered pizza because nobody wanted to cook.", "pattern": "we OR-dered PIZ-za be-cause NO-bod-y WANT-ed to COOK.", "note": "Two balanced clauses with 2-3 beats each."},
    {"text": "She plays the piano with extraordinary skill.", "pattern": "she PLAYS the pi-AN-o with ex-TRAOR-di-nar-y SKILL.", "note": "'plays', 'piano', 'extraordinary', 'skill'."},
    {"text": "Never assume anything without checking the facts.", "pattern": "NEV-er as-SUME AN-y-thing with-out CHECK-ing the FACTS.", "note": "Imperative warning: 'never', 'assume', 'checking', 'facts'."},
    {"text": "Make sure you double-check all the figures.", "pattern": "make SURE you DOU-ble-CHECK all the FIG-ures.", "note": "'sure', 'double-check', 'figures'."}
]

# 3. CONNECTED SPEECH (replace 'pick it up', 'far away', 'big game' with 3 distinct phrases)
CONNECTED_SPEECH_ITEMS = [
    {"text": "turn it on", "pattern": "tur-ni-ton", "note": "Consonant-to-vowel: /n/ links directly into 'it' and 'on'."},
    {"text": "check it out", "pattern": "che-ki-tout", "note": "Consonant /k/ links to 'it', and flap /t/ links into 'out'."},
    {"text": "hold on a minute", "pattern": "hol-do-na-min-ute", "note": "Chained consonant-to-vowel links create seamless flow."},
    {"text": "put on your shoes", "pattern": "pu-ton-your-shoes", "note": "Flap /t/ links into 'on'."},
    {"text": "tell him the truth", "pattern": "tel-lim the truth", "note": "Pronoun reduction: the /h/ drops in rapid speech."},
    {"text": "ask her later", "pattern": "as-ker la-ter", "note": "H-dropping: /k/ links directly into /ɜr/."},
    {"text": "give it to me", "pattern": "gi-vi-tə-me", "note": "/v/ links into 'it'; 'to' reduces to /tə/."},
    {"text": "leave it alone", "pattern": "lea-vi-ta-lone", "note": "Smooth linking of final consonants into vowels."},
    {"text": "not at all", "pattern": "no-ta-tall", "note": "Classic British or American flap-linked phrase."},
    {"text": "first of all", "pattern": "firs-tə-vall", "note": "Seamless consonant-to-vowel cascade."},
    {"text": "go out", "pattern": "go-[w]-out", "note": "Intrusive /w/ smooths the transition between two rounded vowels."},
    {"text": "do it now", "pattern": "do-[w]-it now", "note": "Intrusive /w/ bridges /uː/ and /ɪ/."},
    {"text": "two apples", "pattern": "two-[w]-apples", "note": "Insert a subtle /w/ glide between vowels."},
    {"text": "you are right", "pattern": "you-[w]-are right", "note": "Natural /w/ glide connects 'you' and 'are'."},
    {"text": "so easy", "pattern": "so-[w]-easy", "note": "Subtle /w/ glide avoids an abrupt glottal stop."},
    {"text": "I see it", "pattern": "I see-[j]-it", "note": "Intrusive /j/ bridges the high front vowels."},
    {"text": "she asked", "pattern": "she-[j]-asked", "note": "Natural /j/ glide between /iː/ and /æ/."},
    {"text": "three hours", "pattern": "three-[j]-hours", "note": "Subtle /j/ glide prevents hiatus."},
    {"text": "they agree", "pattern": "they-[j]-agree", "note": "Diphthong /eɪ/ links via /j/ into /ə/."},
    {"text": "we understand", "pattern": "we-[j]-understand", "note": "/j/ glide creates effortless continuity."},
    {"text": "clean never", "pattern": "clea(n)ever", "note": "Twin consonant: hold the /n/ slightly longer without releasing twice."},
    {"text": "bad day", "pattern": "ba[d]-day", "note": "Geminate /d/: stop the airflow once and release on 'day'."},
    {"text": "black coffee", "pattern": "bla[k]-coffee", "note": "Twin /k/: do not release the first /k/ before starting 'coffee'."},
    {"text": "hot tea", "pattern": "ho[t]-tea", "note": "Twin /t/: one elongated closure, single release."},
    {"text": "stop pushing", "pattern": "sto[p]-pushing", "note": "Twin /p/: hold the lips closed through both words."},
    {"text": "nice smile", "pattern": "ni[s]-smile", "note": "Continuous /s/: elongate the friction seamlessly."},
    {"text": "some money", "pattern": "so[m]-money", "note": "Twin /m/: hold the nasal murmur smoothly."},
    {"text": "part time", "pattern": "par[t]-time", "note": "Single extended stop on the alveolar ridge."},
    {"text": "right turn", "pattern": "righ[t]-turn", "note": "Hold the closure on 'right' and release into 'turn'."},
    {"text": "look closer", "pattern": "loo[k]-closer", "note": "Twin /k/: hold velar closure without a separate burst."},
    {"text": "what you need", "pattern": "wha-chu need", "note": "Palatalization: /t/ + /j/ merges into /tʃ/."},
    {"text": "did you see it", "pattern": "di-joo see it", "note": "Palatalization: /d/ + /j/ merges into /dʒ/."},
    {"text": "don't you know", "pattern": "don-chu know", "note": "/t/ + /j/ blends smoothly into /tʃ/."},
    {"text": "would you help", "pattern": "woo-joo help", "note": "/d/ + /j/ blends into /dʒ/."},
    {"text": "can't you hear me", "pattern": "can-chu hear me", "note": "/t/ + /j/ assimilation."},
    {"text": "meet you at six", "pattern": "mee-choo at six", "note": "Rapid speech assimilation of /t/ and /j/."},
    {"text": "told you so", "pattern": "tol-joo so", "note": "/d/ + /j/ blends into /dʒ/ in conversational speech."},
    {"text": "bless you", "pattern": "ble-shoo", "note": "/s/ + /j/ assimilates to /ʃ/."},
    {"text": "miss you", "pattern": "mi-shoo", "note": "/s/ + /j/ becomes /ʃ/ in fast speech."},
    {"text": "is that your car", "pattern": "is tha-chur car", "note": "/t/ + /j/ palatalization across word boundary."},
    {"text": "last night", "pattern": "las' night", "note": "Elision: /t/ drops between consonants /s/ and /n/."},
    {"text": "next door", "pattern": "nex' door", "note": "Elision: /t/ is omitted between /ks/ and /d/."},
    {"text": "fast train", "pattern": "fas' train", "note": "/t/ is elided before /tr/."},
    {"text": "best friend", "pattern": "bes' friend", "note": "/t/ disappears between /s/ and /f/."},
    {"text": "stand there", "pattern": "stan' there", "note": "/d/ drops between nasal /n/ and dental /ð/."},
    {"text": "diamond ring", "pattern": "diamon' ring", "note": "/d/ drops between /n/ and /r/ in rapid speech."},
    {"text": "soft music", "pattern": "sof' music", "note": "/t/ is dropped between /f/ and /m/."},
    {"text": "take a break", "pattern": "tay-kuh break", "note": "Consonant-to-vowel link with reduced 'a'."},
    {"text": "step aside", "pattern": "ste-pa-side", "note": "Smooth link of final /p/ directly into initial /ə/."},
    {"text": "hand over the keys", "pattern": "han-do-ver the keys", "note": "Consonant-to-vowel link /d/ into 'over'."}
]

# 4. REDUCTIONS (replace 'Did you eat yet?' and 'I have to leave now.')
REDUCTIONS_ITEMS = [
    {"text": "What do you want to do?", "pattern": "Whaddya wanna do?", "note": "Extreme reduction of helper words into natural flow."},
    {"text": "I am going to call him back.", "pattern": "I'm gonna call 'im back.", "note": "'going to' -> 'gonna'; 'him' -> ''im'."},
    {"text": "We have got to hurry up.", "pattern": "We gotta hurry up.", "note": "'have got to' reduces to 'gotta'."},
    {"text": "Do you want a cup of coffee?", "pattern": "Wanna cup a coffee?", "note": "'want a' -> 'wanna'; 'of' -> 'a' /ə/."},
    {"text": "She has to study for the test.", "pattern": "She hasta study fer the test.", "note": "'has to' -> 'hasta' /hæstə/; 'for' -> /fər/."},
    {"text": "Let me know when you arrive.", "pattern": "Lemme know when ya arrive.", "note": "'let me' -> 'lemme'; 'you' -> 'ya'."},
    {"text": "Give me a minute please.", "pattern": "Gimme a minute please.", "note": "'give me' -> 'gimme'."},
    {"text": "Could you pass the salt?", "pattern": "Couldja pass the salt?", "note": "'could you' -> 'couldja' /kʊdʒə/."},
    {"text": "Would you mind waiting outside?", "pattern": "Wouldja mind waitin' outside?", "note": "'would you' -> 'wouldja'."},
    {"text": "What did you say to him?", "pattern": "Whaddya say to 'im?", "note": "'what did you' -> 'whaddya'; 'him' -> ''im'."},
    {"text": "I should have told you earlier.", "pattern": "I shoulda told ya earlier.", "note": "'should have' -> 'shoulda' /ʃʊdə/."},
    {"text": "We could have won that match.", "pattern": "We coulda won that match.", "note": "'could have' -> 'coulda' /kʊdə/."},
    {"text": "They would have helped us if we asked.", "pattern": "They woulda helped us if we asked.", "note": "'would have' -> 'woulda' /wʊdə/."},
    {"text": "You must have forgotten the keys.", "pattern": "You musta fergot the keys.", "note": "'must have' -> 'musta' /mʌstə/."},
    {"text": "It might have been an honest mistake.", "pattern": "It mighta been an honest mistake.", "note": "'might have' -> 'mighta' /maɪtə/."},
    {"text": "He used to live in Chicago.", "pattern": "He usta live in Chicago.", "note": "'used to' -> 'usta' /juːstə/."},
    {"text": "I am supposed to meet her at noon.", "pattern": "I'm sposta meet 'er at noon.", "note": "'supposed to' -> 'sposta' /spoʊstə/."},
    {"text": "Do you need to go to the store?", "pattern": "D'ya needa go da the store?", "note": "'need to' -> 'needa'; 'to' -> /də/."},
    {"text": "Try to finish before lunch.", "pattern": "Try da finish fer lunch.", "note": "'to' -> /də/; 'for' -> /fər/."},
    {"text": "I kind of like this design.", "pattern": "I kinda like this design.", "note": "'kind of' -> 'kinda' /kaɪndə/."},
    {"text": "She is sort of upset about the delay.", "pattern": "She's sorta upset about the delay.", "note": "'sort of' -> 'sorta' /sɔːrtə/."},
    {"text": "Lots of people were in attendance.", "pattern": "Lotsa people were in attendance.", "note": "'lots of' -> 'lotsa' /lɒtsə/."},
    {"text": "Out of nowhere a storm began.", "pattern": "Outta nowhere a storm began.", "note": "'out of' -> 'outta' /aʊtə/."},
    {"text": "Front of the line was completely crowded.", "pattern": "Fronta the line was crowded.", "note": "'front of' -> 'fronta'."},
    {"text": "I am going to get some water.", "pattern": "I'mma get some water.", "note": "'I am going to' reduces to 'I'mma' in informal speech."},
    {"text": "Don't you want to join us?", "pattern": "Doncha wanna join us?", "note": "'don't you' -> 'doncha'; 'want to' -> 'wanna'."},
    {"text": "Didn't you see the road sign?", "pattern": "Didn'tcha see the road sign?", "note": "'didn't you' -> 'didn'tcha'."},
    {"text": "Haven't you finished that chapter yet?", "pattern": "Haven'tcha finished that chapter yet?", "note": "'haven't you' -> 'haven'tcha'."},
    {"text": "Can you bring some bread and butter?", "pattern": "Can ya bring some bread 'n butter?", "note": "'and' reduces to syllabic 'n' /n/."},
    {"text": "We worked hard day and night.", "pattern": "We worked hard day 'n night.", "note": "'day and night' -> 'day 'n night'."},
    {"text": "Take it or leave it.", "pattern": "Take idder leave it.", "note": "'or' reduces to /ər/; 'it or' flaps seamlessly."},
    {"text": "More or less what I expected.", "pattern": "More 'er less what I expected.", "note": "'or' reduces to unstressed /ər/."},
    {"text": "Black and white photography.", "pattern": "Black 'n white photography.", "note": "'and' reduces to /n/ between stops."},
    {"text": "He said that he was busy.", "pattern": "He said th't he was busy.", "note": "Relative 'that' reduces to /ðət/ with schwa."},
    {"text": "I know that she is right.", "pattern": "I know th't she's right.", "note": "Conjunction 'that' is weak and short."},
    {"text": "We hope that everything goes smoothly.", "pattern": "We hope th't everything goes smoothly.", "note": "'that' takes /ðət/."},
    {"text": "Tell them to wait downstairs.", "pattern": "Tell 'em to wait downstairs.", "note": "'them' reduces to ''em' /əm/."},
    {"text": "Show them around the new campus.", "pattern": "Show 'em around the new campus.", "note": "'them' -> ''em'."},
    {"text": "Ask them if they are ready.", "pattern": "Ask 'em if they're ready.", "note": "'them' -> ''em'."},
    {"text": "I bought some apples for breakfast.", "pattern": "I bought s'm apples fer breakfast.", "note": "'some' -> /səm/; 'for' -> /fər/."},
    {"text": "This gift is for you.", "pattern": "This gift is fer ya.", "note": "'for' -> /fər/; 'you' -> /jə/."},
    {"text": "Are you ready to order?", "pattern": "Er ya ready ta order?", "note": "'are' -> /ər/; 'you' -> /jə/; 'to' -> /tə/."},
    {"text": "Where were you all morning?", "pattern": "Where wer ya all morning?", "note": "'were' reduces to /wər/."},
    {"text": "What can I do for you today?", "pattern": "What kn I do fer ya today?", "note": "'can' -> /kən/; 'for' -> /fər/; 'you' -> /jə/."},
    {"text": "As far as I can tell.", "pattern": "Ez far ez I kn tell.", "note": "'as' -> /əz/; 'can' -> /kən/."},
    {"text": "He is as tall as his father.", "pattern": "He's ez tall ez 'is father.", "note": "'as' -> /əz/; 'his' -> /ɪz/ without /h/."},
    {"text": "Do they know what time it is?", "pattern": "D'they know what time iddis?", "note": "'do they' -> /dðeɪ/; 'it is' -> /ɪdɪz/."},
    {"text": "Does she want to tag along?", "pattern": "D'she wanna tag along?", "note": "'does she' -> /dʃiː/; 'want to' -> 'wanna'."},
    {"text": "Has he answered the email yet?", "pattern": "'Zhe answered the email yet?", "note": "'has he' loses /h/ and reduces to /æzi/."},
    {"text": "It has been raining all afternoon.", "pattern": "It's bin raining all afternoon.", "note": "'has been' contracts and reduces to /ɪts bɪn/."}
]

# 5. RHYTHM (replace 'CATS CHASE MICE.' and 'The CATS will CHASE the MICE.')
RHYTHM_ITEMS = [
    {"text": "Dogs bark loudly.", "pattern": "DOGS BARK LOUD-ly.", "note": "Three content beats in a row: equal spacing between pulses."},
    {"text": "The dogs will bark quite loudly.", "pattern": "the DOGS will BARK quite LOUD-ly.", "note": "Grammar words compress so the three beats stay evenly timed."},
    {"text": "Birds sing songs.", "pattern": "BIRDS SING SONGS.", "note": "Three staccato beats at constant musical intervals."},
    {"text": "The wild birds were singing their sweet songs.", "pattern": "the WILD BIRDS were SING-ing their SWEET SONGS.", "note": "Unstressed syllables squeeze into the tempo."},
    {"text": "Rain falls down.", "pattern": "RAIN FALLS DOWN.", "note": "Slow, deliberate three-beat pulse."},
    {"text": "Cold rain was falling all afternoon.", "pattern": "COLD RAIN was FALL-ing all af-ter-NOON.", "note": "Maintain identical time intervals between the stress peaks."},
    {"text": "Clock ticks fast.", "pattern": "CLOCK TICKS FAST.", "note": "Three punchy, equal beats."},
    {"text": "The old wall clock was ticking away so fast.", "pattern": "the OLD WALL CLOCK was TICK-ing a-way so FAST.", "note": "Notice how 'was', 'a-way', 'so' speed up to preserve the beat."},
    {"text": "Trains stop here.", "pattern": "TRAINS STOP HERE.", "note": "Three heavy content monosyllables."},
    {"text": "All the express trains must stop right over here.", "pattern": "ALL the ex-PRESS TRAINS must STOP right O-ver HERE.", "note": "Rhythmic constancy despite multiple syllables."},
    {"text": "Fire burns bright.", "pattern": "FIRE BURNS BRIGHT.", "note": "Three resonant stress peaks."},
    {"text": "A warm camp fire was burning extremely bright.", "pattern": "a WARM CAMP FIRE was BURN-ing ex-TREME-ly BRIGHT.", "note": "Keep the metronome ticking evenly across the beats."},
    {"text": "Stars shine bright at night.", "pattern": "STARS SHINE BRIGHT at NIGHT.", "note": "Four beats: steady musical progression."},
    {"text": "Millions of bright stars were shining throughout the dark night.", "pattern": "MIL-lions of BRIGHT STARS were SHIN-ing through-OUT the DARK NIGHT.", "note": "Squeeze unstressed syllables without rushing the main beats."},
    {"text": "Kids love sweets.", "pattern": "KIDS LOVE SWEETS.", "note": "Tri-syllabic stress beat."},
    {"text": "Most young kids really love tasty sweet snacks.", "pattern": "MOST YOUNG KIDS REAL-ly LOVE TAST-y SWEET SNACKS.", "note": "Clustered stresses followed by rapid reductions."},
    {"text": "Wind blows hard.", "pattern": "WIND BLOWS HARD.", "note": "Three monosyllabic hammer beats."},
    {"text": "A chilly north wind had been blowing unusually hard.", "pattern": "a CHIL-ly NORTH WIND had been BLOW-ing un-U-su-al-ly HARD.", "note": "Notice how 'had been' and 'unusually' glide between beats."},
    {"text": "Cook good food.", "pattern": "COOK GOOD FOOD.", "note": "Three heavy vowel beats."},
    {"text": "Always cook fresh, delicious food for your dinner.", "pattern": "AL-ways COOK FRESH de-LI-cious FOOD for your DIN-ner.", "note": "Equal spacing between prominent syllables."},
    {"text": "Ships cross seas.", "pattern": "SHIPS CROSS SEAS.", "note": "Three rhythmic pulses."},
    {"text": "Enormous cargo ships were crossing rough stormy seas.", "pattern": "e-NOR-mous CAR-go SHIPS were CROSS-ing ROUGH STOR-my SEAS.", "note": "Stress-timed acceleration of weak syllables."},
    {"text": "Bears sleep through winter.", "pattern": "BEARS SLEEP through WIN-ter.", "note": "Three content beats."},
    {"text": "Wild brown bears always sleep peacefully throughout the harsh winter.", "pattern": "WILD BROWN BEARS AL-ways SLEEP PEACE-ful-ly through-OUT the HARSH WIN-ter.", "note": "Polysyllabic words compressed between peaks."},
    {"text": "Bells chime loud.", "pattern": "BELLS CHIME LOUD.", "note": "Three resonant bell-strike beats."},
    {"text": "Ancient bronze bells were chiming remarkably loud.", "pattern": "AN-cient BRONZE BELLS were CHIM-ing re-MARK-a-bly LOUD.", "note": "Feel the alternating peaks and valleys."},
    {"text": "Leaves turn red in fall.", "pattern": "LEAVES TURN RED in FALL.", "note": "Four evenly spaced autumn beats."},
    {"text": "Maple leaves quickly turn bright red during late autumn.", "pattern": "MA-ple LEAVES QUICK-ly TURN BRIGHT RED dur-ing LATE AU-tumn.", "note": "Keep the cadence steady despite the added words."},
    {"text": "Tigers hunt wild prey.", "pattern": "TI-gers HUNT WILD PREY.", "note": "Four strong beats."},
    {"text": "Fierce royal tigers will hunt their wild prey in the jungle.", "pattern": "FIERCE ROY-al TI-gers will HUNT their WILD PREY in the JUN-gle.", "note": "Smooth foot transitions across syllables."},
    {"text": "Sun heats earth.", "pattern": "SUN HEATS EARTH.", "note": "Three core beats."},
    {"text": "The blazing desert sun heats the dry rocky earth.", "pattern": "the BLAZ-ing DE-sert SUN HEATS the DRY ROCK-y EARTH.", "note": "Multiple stresses grouped together naturally."},
    {"text": "Waves crash on rocks.", "pattern": "WAVES CRASH on ROCKS.", "note": "Three dynamic crests."},
    {"text": "Huge ocean waves were crashing violently upon the dark rocks.", "pattern": "HUGE O-cean WAVES were CRASH-ing VI-o-lent-ly up-on the DARK ROCKS.", "note": "Rapid compression of unstressed functional syllables."},
    {"text": "Snow covered fields.", "pattern": "SNOW COV-ered FIELDS.", "note": "Three clear beats."},
    {"text": "Fresh white snow had completely covered the distant mountain fields.", "pattern": "FRESH WHITE SNOW had com-PLETE-ly COV-ered the DIS-tant MOUN-tain FIELDS.", "note": "Stress timing: length of phrase matches beat count, not syllable count."},
    {"text": "Wolves howl at moon.", "pattern": "WOLVES HOWL at MOON.", "note": "Three primal pulses."},
    {"text": "Hungry grey wolves were howling mournfully beneath the full moon.", "pattern": "HUN-gry GREY WOLVES were HOWL-ing MOURN-ful-ly be-NEATH the FULL MOON.", "note": "Rhythmic balance between content peaks."},
    {"text": "Fish swim deep in sea.", "pattern": "FISH SWIM DEEP in SEA.", "note": "Four steady beats."},
    {"text": "Strange tropical fish will swim incredibly deep in the silent sea.", "pattern": "STRANGE TROP-i-cal FISH will SWIM in-CRED-i-bly DEEP in the SI-lent SEA.", "note": "Notice how syllables expand and compress naturally."},
    {"text": "Bees make sweet honey.", "pattern": "BEES MAKE SWEET HON-ey.", "note": "Four warm beats."},
    {"text": "Tiny worker bees diligently make delicious sweet golden honey.", "pattern": "TI-ny WORK-er BEES DIL-i-gent-ly MAKE de-LI-cious SWEET GOLD-en HON-ey.", "note": "Keep your vocal energy centered on the stressed syllables."},
    {"text": "Planes fly high in clouds.", "pattern": "PLANES FLY HIGH in CLOUDS.", "note": "Four soaring beats."},
    {"text": "Modern passenger planes can fly remarkably high above the white clouds.", "pattern": "MOD-ern PAS-sen-ger PLANES can FLY re-MARK-a-bly HIGH a-bove the WHITE CLOUDS.", "note": "Even cadence across varied phrase lengths."},
    {"text": "Books teach great truths.", "pattern": "BOOKS TEACH GREAT TRUTHS.", "note": "Four heavy monosyllabic beats."},
    {"text": "Classical history books have always taught profound great truths.", "pattern": "CLAS-si-cal HIS-to-ry BOOKS have AL-ways TAUGHT pro-FOUND GREAT TRUTHS.", "note": "Feel the steady pendulum swing of English rhythm."},
    {"text": "Hands hold warm cups.", "pattern": "HANDS HOLD WARM CUPS.", "note": "Four comforting beats."},
    {"text": "Cold weary hands were holding warm fragrant cups of herbal tea.", "pattern": "COLD WEA-ry HANDS were HOLD-ing WARM FRA-grant CUPS of HER-bal TEA.", "note": "Flawless stress-timed flow from start to finish."},
    {"text": "Drums beat loud.", "pattern": "DRUMS BEAT LOUD.", "note": "Three pounding stress beats."},
    {"text": "Huge ceremonial drums were beating remarkably loud.", "pattern": "HUGE cer-e-MO-ni-al DRUMS were BEAT-ing re-MARK-a-bly LOUD.", "note": "Polysyllabic words compressed into the steady beat."}
]

# 6. INTONATION (50 sentences with zero overlap)
INTONATION_ITEMS = [
    {"text": "She graduated with honors.", "pattern": "She graduated with ↘honors.", "note": "Statement: falling intonation at the final content word."},
    {"text": "I finished the assignment.", "pattern": "I finished the as↘signment.", "note": "Definite statement ends with a decisive drop in pitch."},
    {"text": "We bought a new dining table.", "pattern": "We bought a new dining ↘table.", "note": "Standard downward cadence on completed facts."},
    {"text": "The flight arrives at seven.", "pattern": "The flight arrives at ↘seven.", "note": "Clear drop signals the end of the informative thought."},
    {"text": "They decided to stay home.", "pattern": "They decided to stay ↘home.", "note": "Finality indicated by pitch dropping below neutral."},
    {"text": "Did you receive my package?", "pattern": "Did you receive my ↗package?", "note": "Yes/No question: rising pitch at the end."},
    {"text": "Is this seat taken?", "pattern": "Is this seat ↗taken?", "note": "Polite inquiry: sharp rise on 'taken'."},
    {"text": "Have you ever traveled to Spain?", "pattern": "Have you ever traveled to ↗Spain?", "note": "Yes/No query floats upward at the end."},
    {"text": "Are we ready to start?", "pattern": "Are we ready to ↗start?", "note": "Anticipatory rising intonation."},
    {"text": "Can I borrow your pencil?", "pattern": "Can I borrow your ↗pencil?", "note": "Friendly request ends with an upward sweep."},
    {"text": "Where did you leave the keys?", "pattern": "↘Where did you leave the ↘keys?", "note": "Wh- question: starts high and finishes falling."},
    {"text": "When does the seminar begin?", "pattern": "↘When does the seminar be↘gin?", "note": "Wh- inquiries demand a falling tone."},
    {"text": "Why are the lights still on?", "pattern": "↘Why are the lights still ↘on?", "note": "Curiosity/inquiry: drop at the conclusion."},
    {"text": "How much does this ticket cost?", "pattern": "↘How much does this ticket ↘cost?", "note": "Downward cadence on the final word."},
    {"text": "Who is giving the keynote speech?", "pattern": "↘Who is giving the keynote ↘speech?", "note": "Wh- falling contour."},
    {"text": "Would you like soup, salad, or bread?", "pattern": "Would you like ↗soup, ↗salad, or ↘bread?", "note": "List intonation: rise, rise, then fall on the final option."},
    {"text": "We need apples, oranges, and bananas.", "pattern": "We need ↗apples, ↗oranges, and ba↘nanas.", "note": "Incomplete items rise; last item drops to close."},
    {"text": "I packed a jacket, boots, and an umbrella.", "pattern": "I packed a ↗jacket, ↗boots, and an um↘brella.", "note": "Listing contour: pitch ascends until the finale."},
    {"text": "Do you prefer tea or coffee?", "pattern": "Do you prefer ↗tea or ↘coffee?", "note": "Alternative question: first choice rises, second falls."},
    {"text": "Is it blue, black, or grey?", "pattern": "Is it ↗blue, ↗black, or ↘grey?", "note": "Alternatives terminate with a definitive fall."},
    {"text": "You are coming tomorrow, aren't you?", "pattern": "You're coming tomorrow, ↘aren't you?", "note": "Confirmation tag (speaker is sure): falling pitch."},
    {"text": "You didn't lock the gate, did you?", "pattern": "You didn't lock the gate, ↗did you?", "note": "Genuine doubt tag: rising pitch asks for truth."},
    {"text": "It's rather chilly outside, isn't it?", "pattern": "It's rather chilly outside, ↘isn't it?", "note": "Seeking agreement: falling tag."},
    {"text": "We haven't met before, have we?", "pattern": "We haven't met before, ↗have we?", "note": "Uncertain check: upward rise on 'have we'."},
    {"text": "That was a thrilling match, wasn't it?", "pattern": "That was a thrilling match, ↘wasn't it?", "note": "Enthusiastic consensus: falling tag."},
    {"text": "I really appreciate your kind help.", "pattern": "I ↘really appreciate your kind ↘help.", "note": "Sincere gratitude: low, grounded pitch."},
    {"text": "What a breathtaking view!", "pattern": "What a ↘breathtaking ↘view!", "note": "Exclamation: high emotional peak followed by steep drop."},
    {"text": "That's fantastic news!", "pattern": "That's fan↘tastic ↘news!", "note": "Excitement peaks on 'tastic' and settles on 'news'."},
    {"text": "How wonderful to see you!", "pattern": "How ↘wonderful to ↘see you!", "note": "Warm greeting with sweeping downward inflection."},
    {"text": "Please sit down.", "pattern": "Please sit ↘down.", "note": "Polite command: firm falling tone."},
    {"text": "Although it was freezing, we went hiking.", "pattern": "Although it was ↗freezing, we went ↘hiking.", "note": "Dependent clause rises; main clause falls."},
    {"text": "If you need anything, just call me.", "pattern": "If you need ↗anything, just ↘call me.", "note": "Conditional 'if' clause carries rising suspense."},
    {"text": "Because it rained all morning, the game was postponed.", "pattern": "Because it rained all ↗morning, the game was post↘poned.", "note": "Subordinate clause rises to keep listener waiting."},
    {"text": "When we arrived at the venue, the show had started.", "pattern": "When we arrived at the ↗venue, the show had ↘started.", "note": "Introductory time clause floats up."},
    {"text": "While she was cooking dinner, he set the table.", "pattern": "While she was cooking ↗dinner, he set the ↘table.", "note": "Rise indicates unfinished thought until second half."},
    {"text": "Well, I suppose that might work.", "pattern": "↘Well↗, I suppose that might ↘work.", "note": "Hesitation/reluctance: fall-rise on 'well'."},
    {"text": "Actually, I have a different proposal.", "pattern": "↘Act↗ually, I have a different pro↘posal.", "note": "Diplomatic correction: fall-rise on 'actually'."},
    {"text": "Fortunately, nobody was hurt.", "pattern": "↘For↗tunately, nobody was ↘hurt.", "note": "Sentence adverbial gets mild fall-rise emphasis."},
    {"text": "Honestly, I haven't thought about it.", "pattern": "↘Hon↗estly, I haven't thought a↘bout it.", "note": "Candid reflection: fall-rise on 'honestly'."},
    {"text": "To be frank, I am not convinced.", "pattern": "To be ↘frank↗, I am not con↘vinced.", "note": "Expressing mild skepticism."},
    {"text": "Did she say fifty or fifteen?", "pattern": "Did she say ↗fifty or fif↘teen?", "note": "Clarification: first number rises, second falls."},
    {"text": "Are we leaving now or later?", "pattern": "Are we leaving ↗now or ↘later?", "note": "Contrasting choices."},
    {"text": "Was that your brother or your cousin?", "pattern": "Was that your ↗brother or your ↘cousin?", "note": "Alternative inquiry."},
    {"text": "Should I call him or text him?", "pattern": "Should I ↗call him or ↘text him?", "note": "Action choices."},
    {"text": "Is the museum open or closed today?", "pattern": "Is the museum ↗open or ↘closed today?", "note": "Status inquiry."},
    {"text": "Could you possibly hold this for a second?", "pattern": "Could you possibly hold this for a ↗second?", "note": "Tentative polite request: gentle rise."},
    {"text": "Would you mind if I opened the window?", "pattern": "Would you mind if I opened the ↗window?", "note": "Courteous softening: ending ascends gently."},
    {"text": "Excuse me, where is the nearest pharmacy?", "pattern": "Ex↗cuse me, ↘where is the nearest ↘pharmacy?", "note": "Polite greeting rises; Wh- question drops."},
    {"text": "Good morning everyone!", "pattern": "Good ↗morning ↘everyone!", "note": "Friendly professional greeting."},
    {"text": "Have a wonderful weekend ahead!", "pattern": "Have a wonderful ↘weekend a↘head!", "note": "Warm sendoff with conclusive warmth."}
]

# 7. CHUNKING (50 items with clear pause bars /)
CHUNKING_ITEMS = [
    {"text": "In the early morning / the mist hung over the lake.", "pattern": "In the early morning / the mist hung over the lake.", "note": "Pause between time prepositional phrase and main clause."},
    {"text": "If you want to succeed / you must be consistent.", "pattern": "If you want to succeed / you must be consistent.", "note": "Natural break after conditional dependent clause."},
    {"text": "The young woman in the red coat / smiled warmly.", "pattern": "The young woman in the red coat / smiled warmly.", "note": "Pause separates long subject noun phrase from the predicate."},
    {"text": "Before you sign the contract / read every single page.", "pattern": "Before you sign the contract / read every single page.", "note": "Pause after introductory dependent clause."},
    {"text": "Although he was exhausted / he finished the marathon.", "pattern": "Although he was exhausted / he finished the marathon.", "note": "Pause highlights the concession before the result."},
    {"text": "According to the latest survey / consumer confidence has risen.", "pattern": "According to the latest survey / consumer confidence has risen.", "note": "Pause after citation phrase."},
    {"text": "To be completely honest / I did not expect this outcome.", "pattern": "To be completely honest / I did not expect this outcome.", "note": "Discourse marker chunked separately."},
    {"text": "When the bell rang / all the students / hurried into the classroom.", "pattern": "When the bell rang / all the students / hurried into the classroom.", "note": "Three balanced breath groups."},
    {"text": "In order to improve your speaking / practice every single day.", "pattern": "In order to improve your speaking / practice every single day.", "note": "Purpose clause followed by imperative action."},
    {"text": "As soon as we arrived at the hotel / it started pouring rain.", "pattern": "As soon as we arrived at the hotel / it started pouring rain.", "note": "Pause marks time transition."},
    {"text": "The company / which was founded ten years ago / went public yesterday.", "pattern": "The company / which was founded ten years ago / went public yesterday.", "note": "Non-defining relative clause enclosed in pauses."},
    {"text": "My older brother / who works in Tokyo / is visiting this weekend.", "pattern": "My older brother / who works in Tokyo / is visiting this weekend.", "note": "Parenthetical clause separated on both sides."},
    {"text": "The decision / however difficult / had to be made.", "pattern": "The decision / however difficult / had to be made.", "note": "Contrasting parenthetical phrase set apart."},
    {"text": "His primary goal / to become a pilot / required intense discipline.", "pattern": "His primary goal / to become a pilot / required intense discipline.", "note": "Appositive infinitive phrase bracketed by pauses."},
    {"text": "The painting / discovered in an old attic / was worth millions.", "pattern": "The painting / discovered in an old attic / was worth millions.", "note": "Participial descriptive chunk."},
    {"text": "On one hand / the salary is attractive / but on the other / the hours are long.", "pattern": "On one hand / the salary is attractive / but on the other / the hours are long.", "note": "Four balanced rhetorical chunks."},
    {"text": "First / heat the skillet / then / add a spoonful of olive oil.", "pattern": "First / heat the skillet / then / add a spoonful of olive oil.", "note": "Step-by-step procedural chunking."},
    {"text": "Neither my parents / nor my siblings / could attend the ceremony.", "pattern": "Neither my parents / nor my siblings / could attend the ceremony.", "note": "Correlative conjunctions create rhythmic pauses."},
    {"text": "Not only did he win first prize / but he also broke the record.", "pattern": "Not only did he win first prize / but he also broke the record.", "note": "Inverted parallel structure divided neatly."},
    {"text": "Either we leave immediately / or we will miss the boarding call.", "pattern": "Either we leave immediately / or we will miss the boarding call.", "note": "Pause between two urgent alternatives."},
    {"text": "Ladies and gentlemen / thank you for coming / this evening.", "pattern": "Ladies and gentlemen / thank you for coming / this evening.", "note": "Public address: vocative chunk, appreciation chunk, time chunk."},
    {"text": "I am pleased to announce / that our quarterly profits / have increased by twenty percent.", "pattern": "I am pleased to announce / that our quarterly profits / have increased by twenty percent.", "note": "Formal presentation delivery."},
    {"text": "Today / we stand at a critical crossroad / in our history.", "pattern": "Today / we stand at a critical crossroad / in our history.", "note": "Deliberate oratorical phrasing."},
    {"text": "The question is not / whether we can do this / but whether we will.", "pattern": "The question is not / whether we can do this / but whether we will.", "note": "Rhetorical antithesis divided into three thought units."},
    {"text": "Let us remember / that every great journey / begins with a single step.", "pattern": "Let us remember / that every great journey / begins with a single step.", "note": "Inspirational pacing."},
    {"text": "Without hesitation / she dived into the water / and rescued the child.", "pattern": "Without hesitation / she dived into the water / and rescued the child.", "note": "Narrative action chunks."},
    {"text": "Under the spreading chestnut tree / the village smithy stands.", "pattern": "Under the spreading chestnut tree / the village smithy stands.", "note": "Poetic prepositional setting."},
    {"text": "Far across the valley / a solitary beacon / flickered in the dusk.", "pattern": "Far across the valley / a solitary beacon / flickered in the dusk.", "note": "Atmospheric description in three distinct beats."},
    {"text": "With tears of joy in her eyes / she embraced her family.", "pattern": "With tears of joy in her eyes / she embraced her family.", "note": "Emotional adverbial chunk."},
    {"text": "Deep in the enchanted forest / ancient trees / whispered in the wind.", "pattern": "Deep in the enchanted forest / ancient trees / whispered in the wind.", "note": "Storytelling pacing."},
    {"text": "For further information / please visit our website / or contact customer service.", "pattern": "For further information / please visit our website / or contact customer service.", "note": "Business contact chunking."},
    {"text": "Due to unforeseen weather conditions / the flight has been rescheduled.", "pattern": "Due to unforeseen weather conditions / the flight has been rescheduled.", "note": "Official transit announcement."},
    {"text": "In case of emergency / proceed calmly / to the nearest exit.", "pattern": "In case of emergency / proceed calmly / to the nearest exit.", "note": "Safety instruction in three clear beats."},
    {"text": "Please remain seated / until the aircraft / has come to a complete stop.", "pattern": "Please remain seated / until the aircraft / has come to a complete stop.", "note": "Flight crew announcement."},
    {"text": "All passengers traveling with small children / may now board.", "pattern": "All passengers traveling with small children / may now board.", "note": "Boarding gate phrasing."},
    {"text": "She took a deep breath / gathered her courage / and stepped onto the stage.", "pattern": "She took a deep breath / gathered her courage / and stepped onto the stage.", "note": "Tricolon of actions."},
    {"text": "He opened the envelope / read the letter twice / and smiled quietly.", "pattern": "He opened the envelope / read the letter twice / and smiled quietly.", "note": "Sequential actions split by slight pauses."},
    {"text": "We packed our bags / checked out of the room / and called a taxi.", "pattern": "We packed our bags / checked out of the room / and called a taxi.", "note": "Travel sequence."},
    {"text": "They bought the land / designed the blueprint / and built their dream house.", "pattern": "They bought the land / designed the blueprint / and built their dream house.", "note": "Three major life steps."},
    {"text": "I set the alarm / turned off the bedside lamp / and closed my eyes.", "pattern": "I set the alarm / turned off the bedside lamp / and closed my eyes.", "note": "Bedtime routine chunking."},
    {"text": "Whatever happens tomorrow / we gave it our absolute best.", "pattern": "Whatever happens tomorrow / we gave it our absolute best.", "note": "Conditional reassurance."},
    {"text": "No matter where you travel / always stay true to your roots.", "pattern": "No matter where you travel / always stay true to your roots.", "note": "Philosophical reminder."},
    {"text": "Whenever you feel doubt / remember how far you have already come.", "pattern": "Whenever you feel doubt / remember how far you have already come.", "note": "Encouraging reflection."},
    {"text": "Even though the path was steep / nobody complained / along the way.", "pattern": "Even though the path was steep / nobody complained / along the way.", "note": "Overcoming obstacles."},
    {"text": "Provided that everyone agrees / we will proceed / with the initial plan.", "pattern": "Provided that everyone agrees / we will proceed / with the initial plan.", "note": "Administrative consensus."},
    {"text": "By the time we arrived / the ceremony was over / and everyone had left.", "pattern": "By the time we arrived / the ceremony was over / and everyone had left.", "note": "Complex time relation."},
    {"text": "As far as the eye could see / golden wheat / swayed in the breeze.", "pattern": "As far as the eye could see / golden wheat / swayed in the breeze.", "note": "Expansive landscape description."},
    {"text": "In spite of their differences / they remained / lifelong friends.", "pattern": "In spite of their differences / they remained / lifelong friends.", "note": "Contrasting relationship."},
    {"text": "To master natural English / you need patience / curiosity / and regular practice.", "pattern": "To master natural English / you need patience / curiosity / and regular practice.", "note": "Goal followed by a listed triad."},
    {"text": "When the morning sun rose / the birds began their song / welcoming the day.", "pattern": "When the morning sun rose / the birds began their song / welcoming the day.", "note": "Graceful poetic closure."}
]

# 8. FLUENCY (50 fluid, natural English passages)
FLUENCY_ITEMS = [
    {"text": "Learning a new language is less about perfection and much more about making genuine human connections.", "pattern": "Smooth continuous flow connecting clauses.", "note": "Speak without hesitations between 'perfection' and 'and much more'."},
    {"text": "If you listen closely to native speakers, you will notice that their words blend effortlessly into continuous melodies.", "pattern": "Connected glide across commas.", "note": "Keep vocal tone resonant throughout the entire sentence."},
    {"text": "Consistent daily practice, even for just fifteen minutes, delivers far better results than cramming once a week.", "pattern": "Dynamic flow over parenthetical 'even for just fifteen minutes'.", "note": "Link 'delivers' cleanly into 'far better results'."},
    {"text": "Confidence grows not from never making mistakes, but from communicating freely despite them.", "pattern": "Antithetical balance with smooth delivery.", "note": "Contrast 'not from' and 'but from' fluidly."},
    {"text": "Reading aloud every morning trains your tongue, lips, and jaw muscles to produce English sounds automatically.", "pattern": "Smooth articulation of listed muscular organs.", "note": "Glide through the coordinate nouns without stopping."},
    {"text": "The greatest obstacle to fluent speaking is often the inner voice that worries about grammatical precision.", "pattern": "Continuous rhythm across complex subject.", "note": "Deliver 'is often the inner voice' as one breath unit."},
    {"text": "When you shadow authentic audio, your mouth gradually internalizes the authentic rhythm and music of the language.", "pattern": "Melodic delivery mirroring the topic.", "note": "Connect 'internalizes the' smoothly."},
    {"text": "Pronunciation is like playing a musical instrument: muscle memory and ear training must develop together.", "pattern": "Balanced flow with slight colon pause.", "note": "Transition effortlessly across the colon."},
    {"text": "Every conversation you engage in brings you one step closer to your ultimate personal and professional goals.", "pattern": "Forward momentum building toward 'goals'.", "note": "Keep pitch moving forward without faltering."},
    {"text": "Embrace every opportunity to speak English, whether you are ordering coffee or presenting in a boardroom.", "pattern": "Smooth delivery across contrastive settings.", "note": "Flawless glide between 'coffee' and 'or presenting'."},
    {"text": "Public speaking becomes vastly easier once you shift your focus from your own anxiety to the message your audience needs.", "pattern": "Sustained breath management across 20 words.", "note": "Maintain steady tempo without rushing."},
    {"text": "A clear, well-paced explanation always triumphs over a rushed monologue delivered at lightning speed.", "pattern": "Contrast in cadence matching the meaning.", "note": "Pronounce 'lightning speed' with deliberate crispness."},
    {"text": "By pausing strategically before important keywords, you give your listeners time to absorb and appreciate your ideas.", "pattern": "Intentional pacing and controlled breath support.", "note": "Practice breathing before 'you give your listeners'."},
    {"text": "Effective communicators know when to speak up boldly, and just as importantly, when to listen with full attention.", "pattern": "Graceful symmetry across both clauses.", "note": "Link 'just as importantly' effortlessly."},
    {"text": "The secret to speaking naturally is letting your thoughts guide your breath rather than worrying about isolated words.", "pattern": "Continuous stream of thought.", "note": "Connect 'guide your breath' without any break."},
    {"text": "Traveling abroad pushes you out of your comfort zone and forces you to adapt quickly to unfamiliar accents.", "pattern": "Dynamic travel narrative.", "note": "Seamless linking across 'forces you to adapt'."},
    {"text": "When you immerse yourself in diverse cultures, you begin to see the world from wonderfully unexpected perspectives.", "pattern": "Rich multi-syllabic vocabulary spoken fluidly.", "note": "Articulate 'wonderfully unexpected perspectives' smoothly."},
    {"text": "Language is the living bridge that allows people from completely different backgrounds to find common ground.", "pattern": "Warm metaphorical delivery.", "note": "Deliver 'living bridge that allows' in a single wave."},
    {"text": "Navigating a foreign subway station during rush hour tests both your vocabulary and your situational awareness.", "pattern": "Everyday experiential fluency.", "note": "Keep the cadence steady from start to finish."},
    {"text": "Sharing a meal with local hosts often leads to the most memorable and spontaneous conversations of any journey.", "pattern": "Comfortable, engaging conversational tempo.", "note": "Smoothly connect 'spontaneous conversations'."},
    {"text": "In today's interconnected global economy, clear cross-cultural communication is an invaluable superpower.", "pattern": "Professional business fluency.", "note": "Pronounce 'cross-cultural communication' with clean transitions."},
    {"text": "Collaborating effectively with international colleagues requires empathy, active listening, and concise articulation.", "pattern": "Balanced executive delivery.", "note": "Glide across the three coordinate qualities."},
    {"text": "A concise email that gets straight to the point saves everyone time and prevents unnecessary misunderstandings.", "pattern": "Crisp, businesslike flow.", "note": "Smooth linking across 'unnecessary misunderstandings'."},
    {"text": "Negotiating successfully is rarely about winning an argument; it is about finding a solution that benefits both parties.", "pattern": "Semicolon transition with authoritative calm.", "note": "Maintain professional poise across both halves."},
    {"text": "Delivering constructive feedback requires a gentle touch and a genuine desire to see your teammates flourish.", "pattern": "Warm leadership cadence.", "note": "Connect 'gentle touch and a genuine desire'."},
    {"text": "Critical thinking enables you to evaluate complex claims objectively rather than accepting simple answers at face value.", "pattern": "Academic analysis with smooth phrasing.", "note": "Articulate 'complex claims objectively' with clarity."},
    {"text": "The rapid advancement of artificial intelligence is fundamentally transforming how we learn, work, and create.", "pattern": "Modern tech topic delivered at steady pace.", "note": "Link 'how we learn, work, and create'."},
    {"text": "Scientific progress relies on rigorous experimentation, honest peer review, and a willingness to question assumptions.", "pattern": "Authoritative scientific cadence.", "note": "Smooth triad across the coordinate objects."},
    {"text": "Understanding climate patterns helps us develop sustainable strategies to protect vulnerable coastal communities.", "pattern": "Environmental science topic with rich flow.", "note": "Glide through 'sustainable strategies'."},
    {"text": "Curiosity and intellectual humility are the cornerstones of any lifelong journey of personal discovery.", "pattern": "Reflective academic pacing.", "note": "Deliver 'cornerstones of any lifelong journey' smoothly."},
    {"text": "Nothing beats the serene feeling of sipping hot tea on a rainy afternoon while lost in a captivating novel.", "pattern": "Cozy lifestyle narrative.", "note": "Gentle, relaxing tempo matching the mood."},
    {"text": "Maintaining a healthy sleep routine dramatically improves your daytime energy, focus, and overall well-being.", "pattern": "Wellness topic with steady rhythm.", "note": "Sustain clear breath across the final list."},
    {"text": "Spending time in nature has been proven to lower stress hormones and restore mental clarity almost immediately.", "pattern": "Calm, reassuring delivery.", "note": "Link 'restore mental clarity' seamlessly."},
    {"text": "Cooking a wholesome meal from scratch can be an incredibly mindful and rewarding way to unwind after a busy day.", "pattern": "Warm conversational flow.", "note": "Glide effortlessly through 'mindful and rewarding way'."},
    {"text": "Cultivating gratitude each morning sets an optimistic and resilient tone for whatever challenges lie ahead.", "pattern": "Uplifting mindfulness cadence.", "note": "Pronounce 'optimistic and resilient' with fluid grace."},
    {"text": "The author paints a vivid portrait of a forgotten city lost beneath centuries of shifting desert sands.", "pattern": "Literary eloquence.", "note": "Sustain a rich, imaginative tone throughout."},
    {"text": "Her music blends classical orchestration with contemporary beats to create an entirely fresh auditory experience.", "pattern": "Artistic review pacing.", "note": "Smooth transitions across musical terms."},
    {"text": "Architectural marvels remind us that human ambition can turn sheer imagination into enduring monuments.", "pattern": "Elevated philosophical tone.", "note": "Deliver 'sheer imagination into enduring monuments' cleanly."},
    {"text": "A photograph captures a fleeting split second and transforms it into an everlasting piece of personal history.", "pattern": "Poetic reflection.", "note": "Link 'fleeting split second' without hesitation."},
    {"text": "Great storytelling has the unique power to transcend generations and speak directly to the universal human spirit.", "pattern": "Resonant conclusion.", "note": "Deliver 'universal human spirit' with heartfelt resonance."},
    {"text": "Even when faced with sudden obstacles, remaining adaptable allows you to discover creative and unexpected workarounds.", "pattern": "Resilient mindset narrative.", "note": "Smooth connection through 'creative and unexpected workarounds'."},
    {"text": "Patience is not merely the ability to wait, but how you conduct yourself while working toward long-term goals.", "pattern": "Philosophical nuance.", "note": "Emphasize 'how you conduct yourself' fluidly."},
    {"text": "Every small habit you build today compounds over months and years into profound personal transformation.", "pattern": "Self-development pacing.", "note": "Maintain forward momentum toward 'transformation'."},
    {"text": "True mastery in any discipline comes from falling in love with the repetitive daily fundamentals of the craft.", "pattern": "Insightful coaching delivery.", "note": "Connect 'repetitive daily fundamentals' smoothly."},
    {"text": "You do not need to see the entire staircase to take the very first courageous step forward.", "pattern": "Inspirational metaphor.", "note": "Deliver with calm conviction and continuous flow."},
    {"text": "Overcoming the fear of speaking in public is a journey that transforms your self-perception forever.", "pattern": "Empowering personal growth cadence.", "note": "Flawless glide through 'transforms your self-perception forever'."},
    {"text": "When you speak from personal experience, your words carry an authenticity that no rehearsal can fabricate.", "pattern": "Honest, direct communication tone.", "note": "Deliver 'carry an authenticity' with grounded resonance."},
    {"text": "The English language belongs to whoever uses it to connect, inspire, and share their unique human story.", "pattern": "Inclusive global perspective.", "note": "Glide smoothly across 'connect, inspire, and share'."},
    {"text": "Never apologize for having an accent; it is simply proof that you were brave enough to learn a second language.", "pattern": "Uplifting affirmation for all language learners.", "note": "Speak with genuine warmth and unwavering confidence."},
    {"text": "Keep practicing every day, celebrate your progress, and trust that your dedication will lead to total fluency.", "pattern": "Triumphant finale.", "note": "End on a high, encouraging, and decisive note."}
]

ALL_NEW_PRACTICE = {
    "word-stress": WORD_STRESS_ITEMS,
    "sentence-stress": SENTENCE_STRESS_ITEMS,
    "connected-speech": CONNECTED_SPEECH_ITEMS,
    "reductions": REDUCTIONS_ITEMS,
    "rhythm": RHYTHM_ITEMS,
    "intonation": INTONATION_ITEMS,
    "chunking": CHUNKING_ITEMS,
    "fluency": FLUENCY_ITEMS,
}

def verify_and_apply():
    for skill_name, items in ALL_NEW_PRACTICE.items():
        json_path = os.path.join(SEED_DIR, f"{skill_name}.json")
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        lessons = data.get("lessons", data) if isinstance(data, dict) else data

        # Check existing items in lessons 0..49 (1 to 50)
        existing_texts = set()
        for idx, l in enumerate(lessons[:50]):
            for it in l.get("items", []):
                existing_texts.add(it["text"].strip().lower())

        # Validate count
        assert len(items) == 50, f"{skill_name} has {len(items)} items, expected 50"

        # Validate internal uniqueness
        item_texts = [it["text"].strip().lower() for it in items]
        unique_texts = set(item_texts)
        assert len(item_texts) == len(unique_texts), f"{skill_name} has internal duplicates! {len(item_texts)} vs {len(unique_texts)}"

        # Validate zero overlap with existing lessons
        duplicates = [it["text"] for it in items if it["text"].strip().lower() in existing_texts]
        if duplicates:
            print(f"ERROR: {skill_name} has {len(duplicates)} duplicates with existing lessons: {duplicates}")
            sys.exit(1)

        print(f"OK: {skill_name} - 50 items strictly verified (0 internal duplicates, 0 overlap with lessons 1-50)")

        # Update lesson 51 (index 50)
        practice_lesson = {
            "title": "Practice",
            "level": "intermediate",
            "difficulty": "medium",
            "accent": "us",
            "explain": f"Master {skill_name.replace('-', ' ')} across 50 targeted drills. Listen closely to the AI model, repeat, and record your voice to receive detailed real-time pronunciation scoring and feedback.",
            "points": [
                "Focus on the rhythm, stress, and flow highlighted in each drill.",
                "Listen to the reference model audio before each recording attempt.",
                "Review your AI score and phoneme-level feedback to pinpoint areas for improvement."
            ],
            "caution": "Do not rush through the drills; prioritize clarity, natural cadence, and accurate articulation.",
            "items": items
        }

        if len(lessons) >= 51:
            lessons[50] = practice_lesson
        else:
            lessons.append(practice_lesson)

        # Write back to JSON
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({"lessons": lessons}, f, indent=2, ensure_ascii=False)

    print("\nAll 8 JSON seed files successfully updated with zero duplicates!")

if __name__ == "__main__":
    verify_and_apply()
