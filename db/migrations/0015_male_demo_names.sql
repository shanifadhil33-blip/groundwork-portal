-- Demo people use male names only (Adhil's rule). Personas dana -> imran and priya -> pranav, sample contacts renamed.
-- Data only plus the persona list; rollback: /workspace/qa/neon-runner/rollback-0015.sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_demo_persona_check;
UPDATE users SET demo_persona='imran', name='Imran', email=regexp_replace(email,'^dana\.','imran.') WHERE demo_persona='dana';
UPDATE users SET demo_persona='pranav', name='Pranav', email=regexp_replace(email,'^priya\.','pranav.') WHERE demo_persona='priya';
UPDATE users SET name='Imran', email='imran@ridgeline.demo' WHERE email='dana@ridgeline.demo';
UPDATE users SET name='Pranav', email='pranav@ridgeline.demo' WHERE email='priya@ridgeline.demo';
ALTER TABLE users ADD CONSTRAINT users_demo_persona_check CHECK(demo_persona IN ('imran','sam','pranav','omar'));
UPDATE clients SET contact_name=CASE contact_name WHEN 'Priya Menon' THEN 'Pranav Menon' WHEN 'Layla Haddad' THEN 'Laith Haddad' END WHERE contact_name IN ('Priya Menon','Layla Haddad');
UPDATE sites SET contact_name=CASE contact_name WHEN 'Aisha Rahman' THEN 'Arif Rahman' WHEN 'Fatima Al Zaabi' THEN 'Faisal Al Zaabi' WHEN 'Layla Haddad' THEN 'Laith Haddad' WHEN 'Imran Qureshi' THEN 'Yousef Qureshi' WHEN 'Priya Menon' THEN 'Pranav Menon' END
 WHERE contact_name IN ('Aisha Rahman','Fatima Al Zaabi','Layla Haddad','Imran Qureshi','Priya Menon');
UPDATE notifications SET actor_name=CASE actor_name WHEN 'Dana' THEN 'Imran' WHEN 'Priya' THEN 'Pranav' END WHERE actor_name IN ('Dana','Priya');
