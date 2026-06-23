'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Member {
  id: string;
  name: string;
  role: string;
  status: string;
  grade: string;
}

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isLoginView, setIsLoginView] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  // サイト全体へのアクセスロック用の状態
  const [isSiteLocked, setIsSiteLocked] = useState(true);
  const [sitePinInput, setSitePinInput] = useState('');
  const [sitePinError, setSitePinError] = useState('');

  async function fetchMembers() {
    // 💡 学年（grade）順、その中で名前（name）順にソートして取得
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('grade', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('データ取得エラーの詳細:', error.message || error);
    } else if (data) {
      setMembers(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    // 最初の1回目のデータ取得
    fetchMembers();

    // Supabaseのリアルタイムイベントを監視する設定
    const channel = supabase
      .channel('realtime-members') // 任意のチャンネル名
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'members' },
        () => {
          // データベースが更新されたら、自動で最新データを再取得する
          fetchMembers();
        }
      )
      .subscribe();

    // 画面が閉じられたときに監視を終了するクリーンアップ処理
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function toggleStatus(id: string, currentStatus: string) {
    const nextStatus = currentStatus === '🟩 在室' ? '🟥 退室' : '🟩 在室';
    const { error } = await supabase
      .from('members')
      .update({ status: nextStatus })
      .eq('id', id);

    if (error) {
      console.error('ステータス更新エラー:', error.message);
      alert('更新に失敗しました');
    } else {
      fetchMembers();
    }
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'lab123') {
      setIsAdminMode(true);
      setIsLoginView(false);
      setLoginError('');
      setPassword('');
    } else {
      setLoginError('パスワードが違います');
    }
  };

  // サイトに入るための暗証番号チェック
  const handleSitePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sitePinInput === process.env.NEXT_PUBLIC_SITE_PIN) { // 研究室共通の暗証番号
      setIsSiteLocked(false);
      setSitePinError('');
    } else {
      setSitePinError('暗証番号が正しくありません');
    }
  };

  const presentCount = members.filter((m) => m.status === '🟩 在室').length;
  const occupancyRate = members.length > 0 ? Math.round((presentCount / members.length) * 100) : 0;

  // 💡 学年の表示順を定義
  const gradeOrder = ['M2', 'M1', 'B4'];

  // 存在する学年を重複なしで抽出し、指定した順序でソート
  const grades = Array.from(new Set(members.map((m) => m.grade || '未設定'))).sort((a, b) => {
    return gradeOrder.indexOf(a) - gradeOrder.indexOf(b);
  });
  
  if (loading) {
    return <div className="flex justify-center items-center h-screen bg-gray-50 text-gray-500 font-medium">読み込み中...</div>;
  }

  // 読み込み完了後、ロック状態であれば強制的にこの画面を返す
  if (isSiteLocked) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-800 max-w-sm w-full">
          <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            🔒
          </div>
          <h2 className="text-xl font-extrabold text-white text-center mb-2">LabConnect Lock</h2>
          <p className="text-slate-400 text-xs text-center mb-6">研究室共通の暗証番号を入力してください</p>
          
          <form onSubmit={handleSitePinSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                pattern="\d*"
                maxLength={4}
                value={sitePinInput}
                onChange={(e) => setSitePinInput(e.target.value)}
                placeholder="4桁の数字"
                className="w-full text-center text-2xl tracking-widest px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500"
                autoFocus
              />
              {sitePinError && <p className="text-rose-400 text-xs font-bold text-center mt-2">{sitePinError}</p>}
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-colors shadow-lg text-sm">
              ロック解除
            </button>
          </form>
        </div>
      </main>
    );
  }
  
  if (isLoginView) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-100 max-w-sm w-full">
          <h2 className="text-xl font-extrabold text-slate-800 text-center mb-6">⚙️ 管理者ログイン</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">管理者パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
              />
              {loginError && <p className="text-rose-500 text-xs font-bold mt-2">{loginError}</p>}
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-colors shadow-sm">
              ログイン
            </button>
            <button type="button" onClick={() => setIsLoginView(false)} className="w-full text-slate-400 hover:text-slate-600 text-xs font-bold transition-colors">
              キャンセル
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* ヘッダー & 管理者リンク */}
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">LabConnect <span className="text-blue-600">Attendance</span></h1>
          {isAdminMode ? (
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2">
              🛡️ 管理者モード
              <button onClick={() => setIsAdminMode(false)} className="text-blue-400 hover:text-blue-900 font-black">✕</button>
            </span>
          ) : (
            <button onClick={() => setIsLoginView(true)} className="text-xs font-semibold text-slate-400 hover:text-blue-500 transition-colors">
              ⚙️ 管理者設定
            </button>
          )}
        </div>

        {/* 統計エリア：今日の状況 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">現在の在室</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-4xl font-black text-blue-600">{presentCount}</span>
              <span className="text-slate-400 font-semibold">/ {members.length} 人</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">在室率</span>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-4xl font-black text-emerald-500">{occupancyRate}%</span>
              <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${occupancyRate}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* 💡 学年ごとにグループ化されたメンバーリスト */}
        <div className="space-y-6">
          {members.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center text-slate-400">登録メンバーがいません</div>
          ) : (
            grades.map((grade) => {
              // この学年に所属するメンバーだけをフィルタリング
              const gradeMembers = members.filter((m) => (m.grade || '未設定') === grade);
              
              return (
                <div key={grade} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h2 className="text-sm font-black text-slate-600 uppercase tracking-wider">{grade}</h2>
                    <span className="text-xs font-bold text-slate-400">{gradeMembers.length} 人</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {gradeMembers.map((member) => {
                      const isPresent = member.status === '🟩 在室';
                      return (
                        <div key={member.id} className="flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${isPresent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                              {member.name[0]}
                            </div>
                            <div>
                              <span className="font-bold text-slate-700 block text-lg">{member.name}</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPresent ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                {member.status || '🟥 退室'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleStatus(member.id, member.status)}
                            className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95 shadow-sm ${
                              isPresent 
                                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' 
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'
                            }`}
                          >
                            {isPresent ? '退室' : '入室'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </main>
  );
}
