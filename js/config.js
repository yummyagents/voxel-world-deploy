// ============================================================
// 社区功能配置（访客计数 / 点赞 / 留言）
// ------------------------------------------------------------
// 【妈妈设置一次即可】把下面两行引号里的内容，换成你 Supabase 项目的值：
//   SUPABASE_URL      在 Supabase 后台：Settings(设置) → API → Project URL
//   SUPABASE_ANON_KEY 在 Supabase 后台：Settings(设置) → API → Project API keys → anon / public
// 注意：anon key 是可以公开的（安全由数据库 RLS 策略保证），可放心填进网页。
// 若留空，社区功能会自动隐藏，不影响正常游戏。
// ============================================================

export const SUPABASE_URL = 'https://xleunrmklzhbvdgwhgej.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Ln94jXgV6JQRXJgMyVfcgA_seVGr_Pz';

// 游戏标题（开始界面显示）
export const GAME_TITLE = '美味特工队 · Yummy Agents';
export const GAME_SUBTITLE = '像素方块训练基地';

// 是否启用社区功能（配置齐全后自动启用）
export function isCommunityEnabled() {
  return typeof SUPABASE_URL === 'string' && SUPABASE_URL.startsWith('http')
    && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY.length > 20;
}
