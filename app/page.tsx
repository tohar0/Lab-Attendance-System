'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Member {
  id: string;
  name: string;
  role: string;
  status: string;
  grade: string;
  pin: string
}
export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  // サイト全体へのアクセスロック用の状態
  // ブラウザの記憶（localStorage）を見て、過去に解除していればロックしない
  const [isSiteLocked, setIsSiteLocked] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lab_site_unlocked') !== 'true';
    }
    return true;
  });
  const [sitePinInput, setSitePinInput] = useState('');
  const [sitePinError, setSitePinError] = useState('');
  // 個人の打刻確認・PIN入力ロック用の状態
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberPinInput, setMemberPinInput] = useState('');
  const [memberPinError, setMemberPinError] = useState('');

  async function fetchMembers() {
    // 学年（grade）順、その中で名前（name）順にソートして取得
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
    // 画面の表示と一致させるため、「入室中」「退室中」で判定・更新します
    const nextStatus = currentStatus === '入室中' ? '退室中' : '入室中';
    const actionType = currentStatus === '入室中' ? 'EXIT' : 'ENTER';

    // members テーブルのステータス更新
    const { error: memberError } = await supabase
      .from('members')
      .update({ status: nextStatus })
      .eq('id', id);

    if (memberError) {
      console.error('ステータス更新エラー:', memberError.message);
      alert('更新に失敗しました');
      return;
    }

    // attendance_logs テーブルへの履歴の追加
    const { error: logError } = await supabase
      .from('attendance_logs')
      .insert([
        { member_id: id, action_type: actionType }
      ]);

    if (logError) {
      console.error('ログ記録エラー:', logError.message);
    }

    fetchMembers();
  }

  // サイトに入るための暗証番号チェック
  const handleSitePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sitePinInput === process.env.NEXT_PUBLIC_SITE_PIN) { // 研究室共通の暗証番号
      // ブラウザに「解除済み」のスタンプを保存
      if (typeof window !== 'undefined') {
        localStorage.setItem('lab_site_unlocked', 'true');
      }
      setIsSiteLocked(false);
      setSitePinError('');
      } else {
          setSitePinError('暗証番号が正しくありません');
      }
  };

  // 個人の打刻確認フォーム送信処理
  const handleMemberPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    // データベースから取得したそのメンバーの pin と入力値が一致するか判定
    if (memberPinInput === (selectedMember.pin || '1234')) {
      toggleStatus(selectedMember.id, selectedMember.status);
      setMemberModalOpen(false);
      setSelectedMember(null);
    } else {
      setMemberPinError('暗証番号が正しくありません');
    }
  };

  const presentCount = members.filter((m) => m.status === '入室中').length;
  const occupancyRate = members.length > 0 ? Math.round((presentCount / members.length) * 100) : 0;

  // 学年の表示順を定義
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
          <h2 className="text-xl font-extrabold text-white text-center mb-2">LabAttendanceSystem</h2>
          <p className="text-slate-400 text-xs text-center mb-6">研究室共通のパスワードを入力してください</p>
          
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

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* ヘッダー & 管理者リンク、バージョン情報 */}
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-extrabold text-blue-700 tracking-tight">Lab Attendance System</h1>
          <p className="text-xl text-slate-400">ver.{process.env.NEXT_PUBLIC_APP_VERSION}</p>
        </div>

        {/* 操作説明カード */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-3">
          <h2 className="text-xl font-black text-slate-700 flex items-center gap-1.5">
            📖 利用方法
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-500 font-medium">
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100/50">
              <p className="text-lg font-bold text-slate-700 mb-1">1. 入退室の切り替え</p>
              <p>自分の名前の右側にある「入室」または「退室」ボタンを押して、パスワードを入力することで入退室の切り替えができます。</p>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100/50">
              <p className="text-lg font-bold text-slate-700 mb-1">2. 個人データの確認</p>
              <p>名前をクリックすると、個人の詳細ページで通算来室日数や当日の在室時間,
                直近の打刻記録が確認できます。パスワードの変更もこちらで行うことができます。</p>
            </div>
          </div>
        </div>

        {/* 統計エリア：今日の状況 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <span className="text-lg font-bold text-slate-400 uppercase tracking-wider">現在の在室</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-4xl font-black text-blue-600">{presentCount}</span>
              <span className="text-slate-400 font-semibold">/ {members.length} 人</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <span className="text-lg font-bold text-slate-400 uppercase tracking-wider">在室率</span>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-4xl font-black text-emerald-500">{occupancyRate}%</span>
              <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${occupancyRate}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* 学年ごとにグループ化されたメンバーリスト */}
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
                    {/* 学年ごとの「在室数 / 総人数」のカウント表示に変更 */}
                    <span className="text-xs font-bold text-slate-400">
                      在室 <span className="text-blue-600 font-black">{gradeMembers.filter(m => m.status === '入室中').length}</span> / {gradeMembers.length} 人
                    </span>
                  </div>
                  {/* メンバごとの入退室ステータス */}
                  <div className="divide-y divide-slate-100">
                    {gradeMembers.map((member) => {
                      // 判定を「入室中」に統一
                      const isPresent = member.status === '入室中';
                      return (
                        <div key={member.id} className="flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${isPresent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                              {member.name[0]}
                            </div>
                            <div>
                              <Link href={`/member/${member.id}`} className="font-bold text-slate-700 block text-lg hover:text-blue-600 hover:underline transition-colors cursor-pointer">
                                {member.name}
                              </Link>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPresent ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                {isPresent ? '入室中' : '退室中'}
                              </span>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => {
                              setSelectedMember(member);
                              setMemberModalOpen(true);
                              setMemberPinInput('');
                              setMemberPinError('');
                            }}
                            className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95 shadow-sm ${
                              isPresent 
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            {isPresent ? '退室する' : '入室する'}
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
      {/* 個人の打刻確認 & 固有PIN入力ポップアップ */}
        {memberModalOpen && selectedMember && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full animate-in fade-in zoom-in-95 duration-150">
              <div className="text-center mb-4">
                <span className="text-3xl block mb-2">
                  {selectedMember.status === '🟩 在室中' ? '👋' : '🚀'}
                </span>
                <h3 className="text-lg font-extrabold text-slate-800">
                  {selectedMember.name} さん
                </h3>
                <h3 className="text-lg font-black text-slate-800">
                  {selectedMember?.status === '入室中' ? '退室しますか？' : '入室しますか？'}
                </h3>
              </div>

              <form onSubmit={handleMemberPinSubmit} className="space-y-4">
                <div>
                  <label className="block text-center text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    個人のパスワードを入力
                  </label>
                  <input
                    type="password"
                    pattern="\d*"
                    maxLength={4}
                    value={memberPinInput}
                    onChange={(e) => setMemberPinInput(e.target.value)}
                    placeholder="4桁の数字"
                    className="w-full text-center text-2xl tracking-widest px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                    autoFocus
                  />
                  {memberPinError && (
                    <p className="text-rose-500 text-xs font-bold text-center mt-2">{memberPinError}</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setMemberModalOpen(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-colors shadow-sm text-sm"
                  >
                    確定する
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* 画面最下部に管理者用の秘密のリンクを配置 */}
        <div className="text-center pt-8 pb-4">
          <Link href="/admin" className="text-[11px] font-bold text-slate-300 hover:text-slate-500 transition-colors underline tracking-wider">
            ⚙️ 管理者画面
          </Link>
        </div>
    </main>
  );
}
