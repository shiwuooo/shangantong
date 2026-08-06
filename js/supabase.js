/* 上岸通 · Supabase 客户端
 * 使用方法：
 *   1. 去 supabase.com 创建项目
 *   2. 在 index.html 中修改 SUPABASE_URL 和 SUPABASE_ANON_KEY
 *   3. 在 supabase SQL Editor 中运行 supabase/schema.sql
 */

// ============================================
// 配置 —— 上线前改这里
// ============================================
const SUPABASE_URL = 'https://你的项目ID.supabase.co';
const SUPABASE_ANON_KEY = '你的anon_key（在Supabase Dashboard → Settings → API中找到）';

// ============================================
// 模块
// ============================================
window.SupabaseClient = (function () {
  'use strict';
  let supabase = null;
  let session = null;

  function init() {
    if (typeof supabasejs === 'undefined') {
      console.warn('Supabase JS SDK 未加载。请确保在 index.html 引入 supabase-js CDN。');
      return { ok: false, error: 'SDK 未加载' };
    }
    try {
      supabase = window.supabasejs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          storageKey: 'shangantong_sb_auth',
        },
      });
      return { ok: true };
    } catch (e) {
      console.error('Supabase 初始化失败:', e);
      return { ok: false, error: e.message };
    }
  }

  // ==========================================
  // 会话
  // ==========================================
  async function getSession() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    session = data.session;
    return session;
  }

  function getCurrentUser() {
    return session?.user || null;
  }

  function isLoggedIn() {
    return !!session?.user;
  }

  // ==========================================
  // 注册 / 登录 / 登出
  // ==========================================
  async function signUp(email, password, nickname) {
    if (!supabase) return { ok: false, error: '未连接' };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname } },
    });
    if (error) return { ok: false, error: error.message };
    // 自动创建 profile
    session = data.session;
    return { ok: true, user: data.user };
  }

  async function signIn(email, password) {
    if (!supabase) return { ok: false, error: '未连接' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    session = data.session;
    return { ok: true, user: data.user };
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    session = null;
  }

  // ==========================================
  // Profile
  // ==========================================
  async function getProfile() {
    if (!supabase || !session) return null;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    return data;
  }

  async function updateProfile(fields) {
    if (!supabase || !session) return { ok: false, error: '未登录' };
    const { error } = await supabase
      .from('profiles')
      .update(fields)
      .eq('id', session.user.id);
    return { ok: !error, error: error?.message };
  }

  // ==========================================
  // 订单
  // ==========================================
  async function getOrders() {
    if (!supabase || !session) return [];
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    return data || [];
  }

  // ==========================================
  // 题库（从 Supabase 加载）
  // ==========================================
  async function loadQuestions(module) {
    if (!supabase) return [];
    let query = supabase.from('questions').select('*');
    if (module && module !== 'all') query = query.eq('module', module);
    const { data } = await query.order('created_at', { ascending: false });
    return data || [];
  }

  async function loadAllQuestions() {
    if (!supabase) return [];
    const { data } = await supabase.from('questions').select('*');
    return data || [];
  }

  // ==========================================
  // 答题记录
  // ==========================================
  async function logAnswer(questionId, selected, correct, mode = 'practice') {
    if (!supabase || !session) return false;
    const { error } = await supabase.from('answer_logs').insert({
      user_id: session.user.id,
      question_id: questionId,
      selected,
      correct,
      mode,
    });
    if (!error) {
      // 同时更新打卡
      await supabase.from('daily_logs').upsert({
        user_id: session.user.id,
        log_date: new Date().toISOString().slice(0, 10),
      }, { onConflict: 'user_id,log_date', ignoreDuplicates: false }).then(() => {
        // 增量更新 count
      });
    }
    return !error;
  }

  // ==========================================
  // 错题 / 收藏
  // ==========================================
  async function toggleMistake(questionId, add) {
    if (!supabase || !session) return false;
    if (add) {
      const { error } = await supabase.from('user_mistakes').upsert({
        user_id: session.user.id,
        question_id: questionId,
      }, { onConflict: 'user_id,question_id' });
      return !error;
    } else {
      const { error } = await supabase.from('user_mistakes').delete()
        .eq('user_id', session.user.id)
        .eq('question_id', questionId);
      return !error;
    }
  }

  async function toggleFavorite(questionId, add) {
    if (!supabase || !session) return false;
    if (add) {
      const { error } = await supabase.from('user_favorites').upsert({
        user_id: session.user.id,
        question_id: questionId,
      }, { onConflict: 'user_id,question_id' });
      return !error;
    } else {
      const { error } = await supabase.from('user_favorites').delete()
        .eq('user_id', session.user.id)
        .eq('question_id', questionId);
      return !error;
    }
  }

  async function getMistakeIds() {
    if (!supabase || !session) return [];
    const { data } = await supabase.from('user_mistakes').select('question_id').eq('user_id', session.user.id);
    return (data || []).map(r => r.question_id);
  }

  async function getFavoriteIds() {
    if (!supabase || !session) return [];
    const { data } = await supabase.from('user_favorites').select('question_id').eq('user_id', session.user.id);
    return (data || []).map(r => r.question_id);
  }

  // ==========================================
  // 模考成绩
  // ==========================================
  async function saveExamScore(score) {
    if (!supabase || !session) return false;
    const { error } = await supabase.from('exam_scores').insert({
      user_id: session.user.id,
      correct: score.correct,
      total: score.total,
      wrong: score.wrong,
      skipped: score.skipped,
      accuracy: score.acc,
    });
    return !error;
  }

  async function getExamHistory() {
    if (!supabase || !session) return [];
    const { data } = await supabase.from('exam_scores')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  }

  // ==========================================
  // 统计
  // ==========================================
  async function getStats() {
    if (!supabase || !session) return null;
    const { data } = await supabase.rpc('get_user_stats', { p_user_id: session.user.id });
    return data?.[0] || null;
  }

  // ==========================================
  // 同步：本地 → 云端
  // ==========================================
  async function syncLocalToCloud(localHistory) {
    if (!supabase || !session || !localHistory.length) return;
    // 只上传最近的 50 条（防重复上传）
    const recent = localHistory.slice(-50);
    for (const h of recent) {
      await logAnswer(h.id, h.selected, h.correct, h.mode || 'practice');
    }
  }

  // ==========================================
  // 公开接口
  // ==========================================
  return {
    init,
    getSession,
    getCurrentUser,
    isLoggedIn,
    signUp,
    signIn,
    signOut,
    getProfile,
    updateProfile,
    getOrders,
    loadQuestions,
    loadAllQuestions,
    logAnswer,
    toggleMistake,
    toggleFavorite,
    getMistakeIds,
    getFavoriteIds,
    saveExamScore,
    getExamHistory,
    getStats,
    syncLocalToCloud,
  };
})();
