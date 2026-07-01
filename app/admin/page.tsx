'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface AttendanceLog {
  id: string;
  action_type: 'ENTER' | 'EXIT';
  timestamp: string;
  members: {
    name: string;
  } | null;
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 編集モーダル用の状態
  const [editLog, setEditLog] = useState<AttendanceLog | null>(null);
  const [editTimestamp, setEditTimestamp] = useState('');

  // 管理者ログインチェック
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === process.env.NEXT_PUBLIC_MANAGE_PASS) {
      setIsAdmin(true);
      setLoginError('');
      fetchNewLogs();
    } else {
      setLoginError('管理者パスワードが正しくありません');
    }
  };

  // 全メンバーの全ログを最新順に取得
  async function fetchNewLogs() {
    setLoading(true);
    const { data, error } = await supabase
      .from('attendance_logs')
      .select(`
        id,
        action_type,
        timestamp,
        members (
          name
        )
      `)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('ログ取得エラー:', error.message);
    } else {
      setLogs(data as unknown as AttendanceLog[]);
    }
    setLoading(false);
  }

  // ログの削除処理
  async function handleDeleteLog(id: string) {
    if (!confirm('この打刻ログを本当に削除しますか？')) return;

    const { error } = await supabase
      .from('attendance_logs')
      .delete()
      .eq('id', id);

    if (error) {
      alert('削除に失敗しました');
    } else {
      fetchNewLogs();
    }
  }

  // ログの編集（保存）処理
  async function handleUpdateLog(e: React.FormEvent) {
    e.preventDefault();
    if (!editLog) return;

    const { error } = await supabase
      .from('attendance_logs')
      .update({ timestamp: new Date(editTimestamp).toISOString() })
      .eq('id', editLog.id);

    if (error) {
      alert('更新に失敗しました');
    } else {
      setEditLog(null);
      fetchNewLogs();
    }
  }

  // 🚪 ログイン前画面
  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full">
          <div className="text-center mb-6">
            <span className="text-4xl block mb-2">🛠️</span>
            <h1 className="text-xl font-black text-slate-800">研究室管理画面</h1>
            <p className="text-slate-400 text-xs font-bold mt-1">管理者パスワードを入力してください</p>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              pattern="\d*"
              maxLength={4}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="4桁の数字"
              className="w-full text-center text-2xl font-mono tracking-widest px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {loginError && <p className="text-rose-500 text-xs font-bold text-center">{loginError}</p>}
            <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-3 rounded-xl transition-colors text-sm">
              管理者として認証
            </button>
          </form>
          <div className="text-center mt-4">
            <Link href="/" className="text-xs font-bold text-slate-400 hover:text-slate-600 underline">トップへ戻る</Link>
          </div>
        </div>
      </main>
    );
  }

  // 🖥️ ログイン後のダッシュボード画面
  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-xl font-black text-slate-800">🛠️ 打刻データ管理センター</h1>
            <p className="text-slate-400 text-xs font-bold mt-0.5">誤打刻の編集・削除が行えます（最新順）</p>
          </div>
          <Link href="/" className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl transition-colors">
            トップ画面へ戻る
          </Link>
        </div>

        {/* 📋 ログ一覧テーブル */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400 font-medium text-sm">読み込み中...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-medium text-sm">ログデータがありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                    <th className="p-4">メンバー</th>
                    <th className="p-4">種別</th>
                    <th className="p-4">打刻日時（日本時間）</th>
                    <th className="p-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs font-medium text-slate-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold text-slate-800">{log.members?.name || '不明なユーザー'}</td>
                      <td className="p-4">
                        <span className={`font-bold px-2.5 py-0.5 rounded-full ${log.action_type === 'ENTER' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {log.action_type === 'ENTER' ? '入室' : '退室'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                      </td>
                      <td className="p-4 text-center space-x-2">
                        <button
                          onClick={() => {
                            setEditLog(log);
                            // インプット用に日時形式（YYYY-MM-DDTHH:mm）に変換
                            const d = new Date(log.timestamp);
                            d.setHours(d.getHours() + 9); // 日本時間に簡易補正してフォームへ
                            setEditTimestamp(d.toISOString().slice(0, 16));
                          }}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          修正
                        </button>
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 📝 修正用ポップアップモーダル */}
        {editLog && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full">
              <h3 className="text-base font-black text-slate-800 mb-1">⏰ 打刻時間の修正</h3>
              <p className="text-slate-400 text-xs font-bold mb-4">{editLog.members?.name} さん のログ</p>

              <form onSubmit={handleUpdateLog} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">修正後の日時</label>
                  <input
                    type="datetime-local"
                    value={editTimestamp}
                    onChange={(e) => setEditTimestamp(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-700"
                    required
                  />
                </div>
                <div className="flex gap-3 text-xs font-bold pt-2">
                  <button type="button" onClick={() => setEditLog(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl transition-colors">
                    キャンセル
                  </button>
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl transition-colors shadow-sm">
                    変更を保存
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}