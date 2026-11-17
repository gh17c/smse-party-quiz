-- 仅供管理员在 Supabase SQL Editor 中运行；只读，不改变账号或权限。
-- 登记姓名为学生自行填写，请结合班级名单核对。
select
  id as "账号ID",
  split_part(email, '@', 1) as "学号",
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', '') as "姓名",
  created_at as "注册时间",
  last_sign_in_at as "最近登录时间"
from auth.users
where split_part(email, '@', 2) = 'students.smse-party-quiz.invalid'
order by split_part(email, '@', 1);
