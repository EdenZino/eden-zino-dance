insert into instructors(name, bio, image_url, instagram_url)
select 'עדן זינו', 'יש להשלים את הביוגרפיה דרך ממשק הניהול.', '', 'https://www.instagram.com/eden_zinooo/?hl=en'
where not exists (select 1 from instructors where name = 'עדן זינו');

insert into legal_documents(type, version, title, content, is_active, published_at) values
('TERMS','DRAFT-1','תנאי שימוש והרשמה','טיוטה בלבד. יש להעביר לבדיקה משפטית לפני הפעלה מסחרית.',true,now()),
('PRIVACY','DRAFT-1','מדיניות פרטיות','טיוטה בלבד. יש להעביר לבדיקה משפטית לפני הפעלה מסחרית.',true,now()),
('CANCELLATION','DRAFT-1','מדיניות ביטולים','טיוטה בלבד. יש להעביר לבדיקה משפטית לפני הפעלה מסחרית.',true,now()),
('ACCESSIBILITY','DRAFT-1','הצהרת נגישות','טיוטה בלבד. יש להשלים פרטי רכז נגישות ודרך יצירת קשר.',true,now())
on conflict(type,version) do nothing;
