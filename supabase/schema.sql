-- ============================================
-- 上岸通 · Supabase 数据库 Schema
-- 在 Supabase Dashboard → SQL Editor 中运行此文件
-- ============================================

-- 0. 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 用户表（扩展 Supabase auth.users）
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nickname TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 新用户注册自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nickname)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'nickname', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. 订单表
-- ============================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product TEXT NOT NULL DEFAULT '终身会员',
  amount NUMERIC(10, 2) NOT NULL DEFAULT 9.90,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded')),
  payment_method TEXT DEFAULT '微信支付',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 3. 题库表（服务端题库，可多人共享）
-- ============================================
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module TEXT NOT NULL CHECK (module IN ('changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao', 'shenlun')),
  type TEXT NOT NULL DEFAULT '单选',
  q TEXT NOT NULL,
  material TEXT DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer INTEGER NOT NULL,
  explain TEXT DEFAULT '',
  source TEXT DEFAULT '',          -- 来源：'模拟·上岸通' / '2024国考副省' / '2023联考' 等
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. 答题记录表
-- ============================================
CREATE TABLE IF NOT EXISTS public.answer_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected INTEGER,
  correct BOOLEAN NOT NULL,
  mode TEXT NOT NULL DEFAULT 'practice' CHECK (mode IN ('practice', 'exam')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 5. 用户错题 / 收藏表
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_mistakes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

-- ============================================
-- 6. 模考成绩表
-- ============================================
CREATE TABLE IF NOT EXISTS public.exam_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  wrong INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  accuracy NUMERIC(5, 2) NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 7. 每日打卡表
-- ============================================
CREATE TABLE IF NOT EXISTS public.daily_logs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, log_date)
);

-- ============================================
-- 索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_questions_module ON public.questions(module);
CREATE INDEX IF NOT EXISTS idx_questions_source ON public.questions(source);
CREATE INDEX IF NOT EXISTS idx_answer_logs_user ON public.answer_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_logs_question ON public.answer_logs(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_scores_user ON public.exam_scores(user_id, created_at DESC);

-- ============================================
-- RLS 策略（行级安全）
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

-- profiles：用户只能读/写自己的
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- orders：用户只能看自己的
CREATE POLICY "orders_select_own" ON public.orders FOR SELECT USING (auth.uid() = user_id);

-- questions：任何人都可读（题库公开），管理员可写
CREATE POLICY "questions_select_all" ON public.questions FOR SELECT USING (true);
CREATE POLICY "questions_insert_admin" ON public.questions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- answer_logs：各自看各自的
CREATE POLICY "logs_select_own" ON public.answer_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "logs_insert_own" ON public.answer_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- user_mistakes / user_favorites：各自管理
CREATE POLICY "mistakes_manage_own" ON public.user_mistakes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "favorites_manage_own" ON public.user_favorites FOR ALL USING (auth.uid() = user_id);

-- exam_scores：各自看各自的
CREATE POLICY "scores_select_own" ON public.exam_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scores_insert_own" ON public.exam_scores FOR INSERT WITH CHECK (auth.uid() = user_id);

-- daily_logs：各自管理
CREATE POLICY "dailylogs_manage_own" ON public.daily_logs FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 8. 统计视图/函数（可选）
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_stats(p_user_id UUID)
RETURNS TABLE(
  total_answers BIGINT,
  correct_answers BIGINT,
  accuracy NUMERIC,
  streak_days INT,
  today_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(al.id)::BIGINT AS total_answers,
    COUNT(al.id) FILTER (WHERE al.correct)::BIGINT AS correct_answers,
    CASE WHEN COUNT(al.id) > 0 THEN
      ROUND(COUNT(al.id) FILTER (WHERE al.correct)::NUMERIC / COUNT(al.id)::NUMERIC * 100, 1)
    ELSE 0 END AS accuracy,
    0::INT AS streak_days,
    COUNT(al.id) FILTER (WHERE al.created_at::DATE = CURRENT_DATE)::BIGINT AS today_count
  FROM public.answer_logs al
  WHERE al.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 插入初始题库种子数据（模拟题，上线后可替换）
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.questions LIMIT 1) THEN
    -- 常识判断 3 道种子
    INSERT INTO public.questions (module, type, q, options, answer, explain, source, difficulty) VALUES
    ('changshi', '单选', '党的二十大报告指出，中国式现代化是人口规模巨大的现代化，是全体人民共同富裕的现代化，是____的现代化。', '["物质文明和精神文明相协调","人与自然和谐共生","走和平发展道路","以上都是"]'::jsonb, 3, '二十大报告：中国式现代化是人口规模巨大的现代化，是全体人民共同富裕的现代化，是物质文明和精神文明相协调的现代化，是人与自然和谐共生的现代化，是走和平发展道路的现代化。', '模拟·上岸通', 'easy'),
    ('yanyu', '单选', '下列句中加点成语使用正确的一项是：', '["这场演出美轮美奂","他说得天花乱坠，让人半信半疑","这位演员的舞技真是炙手可热","看到这样的天才，让人叹为观止"]'::jsonb, 1, 'A项"美轮美奂"形容建筑高大华美；C项"炙手可热"形容权势大、气焰盛，含贬义；D项"叹为观止"意为赞美看到的事物好到极点，应作"叹为观止"。B项"天花乱坠"比喻说话有声有色，非常动听（多指夸大或不切实际），上下文使用正确。', '模拟·上岸通', 'medium'),
    ('panduan', '单选', '如果"所有A都是B"和"有些C不是B"都为真，则下列哪项必为真？', '["所有C都不是A","有些C是A","有些A不是C","有些C不是A"]'::jsonb, 3, '由"有些C不是B"+ "所有A都是B"可推：有些C不是B且所有A都是B → 有些C不在B中而所有A在B中 → 有些C不是A。故D项"有些C不是A"必为真。', '模拟·上岸通', 'hard');
  END IF;
END $$;
