'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Member {
  id: string;
  name: string;
  role: string;
  status: string;
  grade: string;
  pin: string;
}

interface AttendanceLog {
  id: string;
  action_type: 'ENTER' | 'EXIT';
  timestamp: string;
  created_at?: string;
}

export default function MemberDetail() {
  const params = useParams();
  const [member, setMember] = useState<Member | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  // パスワード変更用の状態
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinUpdateMessage, setPinUpdateMessage] = useState('');
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  // === ログ編集用の状態 ===
  const [selectedLog, setSelectedLog] = useState<any>(null); // 編集対象のログ
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editAction, setEditAction] = useState<'update' | 'delete'>('update');
  const [inputPin, setInputPin] = useState('');
  const [newLogTime, setNewLogTime] = useState(''); // 修正後の時間 (HH:MM)
  const [newLogStatus, setNewLogStatus] = useState<'入室中' | '退室中'>('入室中');


  useEffect(() => {
    async function fetchMemberAndLogs() {
      if (!params?.id) return;
      
      // 1. メンバー基本情報の取得
      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('id', params.id)
        .single();

      if (memberData) {
        setMember(memberData);

        // 2. そのメンバーの打刻ログを過去からすべて取得（古い順）
        // 一旦、カラムを個別に指定するのではなく、すべてのカラム（'*'）を確実に取得する形に変更します
        const { data: logData } = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('member_id', String(params.id)) // 型を確実に文字列（String）に合わせます
          .order('timestamp', { ascending: true });

        if (logData) {
          setLogs(logData as AttendanceLog[]);
        }
      }
      setLoading(false);
    }
    fetchMemberAndLogs();
  }, [params?.id]);

  // パスワード（PIN）を更新する処理
  const handlePinUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || !newPin.match(/^\d{4}$/)) {
      setPinUpdateMessage('❌ 新しいパスワードは4桁の数字を入力してください');
      return;
    }

    // 現在の暗証番号が一致しているかチェック
    const dbPin = member.pin || '1234';
    if (currentPinInput !== dbPin) {
      setPinUpdateMessage('❌ 現在のパスワードが正しくありません');
      return;
    }

    // 新しいPINと古いPINが同じ場合の簡易チェック
    if (currentPinInput === newPin) {
      setPinUpdateMessage('❌ 新しいパスワードが現在と同じです');
      return;
    }

    setIsUpdatingPin(true);
    setPinUpdateMessage('');

    const { error } = await supabase
      .from('members')
      .update({ pin: newPin })
      .eq('id', member.id);

    setIsUpdatingPin(false);

    if (error) {
      console.error('PIN更新エラー:', error.message);
      setPinUpdateMessage('❌ 更新に失敗しました');
    } else {
      setPinUpdateMessage('✅ パスワードを変更しました！');
      setMember({ ...member, pin: newPin });
      setCurrentPinInput(''); // フォームをクリア
      setNewPin('');
    }
  };

  if (loading) return <div className="flex justify-center items-center h-screen bg-slate-50 text-slate-500 font-medium">読み込み中...</div>;
  if (!member) return <div className="flex justify-center items-center h-screen bg-slate-50 text-slate-500 font-medium">メンバが見つかりません</div>;

  // ==========================================
  // 📊 データ集計ロジック（案A：00:00オートリセット考慮）
  // ==========================================
  
  // 日本時間（JST）に強制的に変換するオプション
  const jstOptions = { timeZone: 'Asia/Tokyo' };
  const todayStr = new Date().toLocaleDateString('ja-JP', jstOptions); // 今日（YYYY/MM/DD）
  const uniqueDates = new Set<string>(); // 通算来室日数を数えるための重複なしセット
  let todayTotalMs = 0; // 今日の滞在時間（ミリ秒）

  // ログを入退室のペアで計算するためにループを回す
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const logDate = new Date(log.timestamp);
    
    // ログの日時も日本時間に変換して比較・カウントする
    const logDateStr = logDate.toLocaleDateString('ja-JP', jstOptions);
    uniqueDates.add(logDateStr);

    if (log.action_type === 'ENTER') {
      const nextLog = logs[i + 1];
      const enterTime = logDate;
      let exitTime: Date;

      if (nextLog && nextLog.action_type === 'EXIT') {
        exitTime = new Date(nextLog.timestamp);
        i++;
      } else {
        const isToday = logDateStr === todayStr;
        exitTime = isToday ? new Date() : new Date(enterTime.getFullYear(), enterTime.getMonth(), enterTime.getDate(), 23, 59, 59);
      }

      // 日本時間の日付同士で「今日」のログかを判定
      if (logDateStr === todayStr) {
        todayTotalMs += (exitTime.getTime() - enterTime.getTime());
      }
    }
  }

  // ミリ秒を「〇時間〇分」に変換
  const todayTotalMinutes = Math.floor(todayTotalMs / (1000 * 60));
  const todayHours = Math.floor(todayTotalMinutes / 60);
  const todayMins = todayTotalMinutes % 60;

  // === ログ修正・削除の実行関数 ===
  const handleSelfCorrection = async () => {
    if (inputPin !== member?.pin) {
      alert('暗証番号（PIN）が一致しません。');
      return;
    }

    if (editAction === 'delete') {
      const { error } = await supabase
        .from('attendance_logs')
        .delete()
        .eq('id', selectedLog.id);

      if (error) {
        alert('ログの削除に失敗しました。');
        return;
      }
    } else {
      // 💡 カラム名 timestamp から日時のベースを作成
      const logDate = new Date(selectedLog.timestamp);
      const [hours, minutes] = newLogTime.split(':');
      logDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // action_type ('ENTER' | 'EXIT') に変換して保存
      const actionType = newLogStatus === '入室中' ? 'ENTER' : 'EXIT';

      const { error } = await supabase
        .from('attendance_logs')
        .update({
          timestamp: logDate.toISOString(),
          action_type: actionType
        })
        .eq('id', selectedLog.id);

      if (error) {
        alert('ログの修正に失敗しました。');
        return;
      }
    }

    // 整合性を保つため、最新のログの状態をメンバーの status に同期
    const { data: latestLogs } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const currentStatus = latestLogs && latestLogs.length > 0
      ? (latestLogs[0].action_type === 'ENTER' ? '入室中' : '退室中')
      : '退室中';

    await supabase
      .from('members')
      .update({ status: currentStatus })
      .eq('id', member.id);

    alert('打刻ログを修正しました。データが再計算されます。');
    setIsEditModalOpen(false);
    setInputPin('');
    window.location.reload();
  };

  return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-md mx-auto space-y-6">
          <Link href="/" className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 w-fit">
            ← 全体リストに戻る
          </Link>

          {/* プロフィール */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-2xl mx-auto mb-3">
              {member.name[0]}
            </div>
            <h1 className="text-xl font-extrabold text-slate-800">{member.name}</h1>
            <p className="text-slate-400 text-xs font-bold uppercase mt-1 tracking-wider">{member.grade}</p>
          </div>

          {/* 集計結果カード */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">通算来室日数</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black text-slate-800">{uniqueDates.size}</span>
                <span className="text-slate-400 text-xs font-bold">日</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">本日の在室時間</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black text-blue-600">{todayHours}</span>
                <span className="text-slate-400 text-xs font-bold mr-1">時間</span>
                <span className="text-3xl font-black text-blue-600">{todayMins}</span>
                <span className="text-slate-400 text-xs font-bold">分</span>
              </div>
            </div>
          </div>

          {/* 最近の履歴一覧 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-sm font-black text-slate-700 mb-4">⏱️ 最近の打刻ログ（最新5件）</h2>
            <div className="space-y-3">
              {logs.length === 0 ? (
                <p className="text-slate-400 text-xs font-medium text-center py-4">履歴がまだありません</p>
              ) : (
                logs.slice(-5).reverse().map((log) => (
                  <div key={log.id} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <span className={`font-bold px-2 py-0.5 rounded-full ${log.action_type === 'ENTER' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {log.action_type === 'ENTER' ? '入室' : '退室'}
                      </span>
                      <span className="text-slate-500 font-medium">
                        {/* 💡 DBのカラムに合わせて log.timestamp ではなく log.created_at に変更 */}
                        {new Date(log.created_at || log.timestamp).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>

                    {/* 💡 各ログの右側に個別修正ボタンを設置 */}
                    <button
                      onClick={() => {
                        setSelectedLog(log);
                        const date = new Date(log.created_at || log.timestamp);
                        setNewLogTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
                        setNewLogStatus(log.action_type === 'ENTER' ? '入室中' : '退室中');
                        setEditAction('update');
                        setIsEditModalOpen(true);
                      }}
                      className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors px-2 py-1 bg-slate-50 hover:bg-blue-50 rounded-md"
                    >
                      修正
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 個人の暗証番号変更カード（mainの内側に配置） */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-sm font-black text-slate-700 mb-2">🔐 パスワードの変更</h2>
            <p className="text-slate-400 text-xs font-medium mb-4">本人確認のため、現在のパスワードを入力した上で変更してください。</p>
            
            <form onSubmit={handlePinUpdate} className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 px-1">現在のパスワード</label>
                  <input
                    type="password"
                    pattern="\d*"
                    maxLength={4}
                    value={currentPinInput}
                    onChange={(e) => setCurrentPinInput(e.target.value)}
                    placeholder="4桁の数字"
                    className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-mono tracking-widest text-center"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 px-1">新しいパスワード</label>
                  <input
                    type="password"
                    pattern="\d*"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="4桁の数字"
                    className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-mono tracking-widest text-center"
                  />
                </div>
              </div>
              
              <button
                type="submit"
                disabled={isUpdatingPin}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {isUpdatingPin ? '変更中...' : 'パスワードを変更する'}
              </button>
            </form>
            {pinUpdateMessage && (
              <p className={`text-xs font-bold mt-2 text-center ${pinUpdateMessage.startsWith('✅') ? 'text-emerald-600' : 'text-rose-500'}`}>
                {pinUpdateMessage}
              </p>
            )}
          </div>
        </div>

        {/* 打刻セルフ修正用モーダル（mainの内側に配置） */}
        {isEditModalOpen && selectedLog && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-lg font-black text-slate-800 mb-4">打刻データの自己修正・削除</h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">処理の選択</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditAction('update')}
                      className={`py-2 text-sm font-bold rounded-xl border ${editAction === 'update' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-slate-200 text-slate-500'}`}
                    >
                      時間を修正する
                    </button>
                    <button
                      onClick={() => setEditAction('delete')}
                      className={`py-2 text-sm font-bold rounded-xl border ${editAction === 'delete' ? 'bg-red-50 border-red-200 text-red-600' : 'border-slate-200 text-slate-500'}`}
                    >
                      この打刻を削除
                    </button>
                  </div>
                </div>

                {editAction === 'update' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">修正後の時間</label>
                      <input
                        type="time"
                        value={newLogTime}
                        onChange={(e) => setNewLogTime(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">状態</label>
                      <select
                        value={newLogStatus}
                        onChange={(e) => setNewLogStatus(e.target.value as '入室中' | '退室中')}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:border-blue-500"
                      >
                        <option value="入室中">入室中</option>
                        <option value="退室中">退室中</option>
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">本人確認用 PIN (4桁)</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={inputPin}
                    onChange={(e) => setInputPin(e.target.value)}
                    className="w-full px-4 py-2 text-center text-lg tracking-widest border border-slate-200 rounded-xl font-black focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setIsEditModalOpen(false); setInputPin(''); }}
                  className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSelfCorrection}
                  className={`flex-1 py-3 text-sm font-bold text-white rounded-xl transition-colors ${editAction === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
                >
                  {editAction === 'delete' ? '削除を実行' : '修正を保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }