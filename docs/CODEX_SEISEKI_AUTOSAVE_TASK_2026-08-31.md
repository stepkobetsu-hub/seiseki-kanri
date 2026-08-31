# Codex task: 成績管理を Supabase 先行保存＋自動保存へ切替

対象 Issue: #13
対象: `juku_app.html`（まず生徒側）

## 目的
成績管理の保存を、Google Sheet / GAS 完了待ち方式から、Supabase 先行保存方式へ変更する。
画面は入力を止めず、保存ボタンを押さなくても自動保存する。

## 既に準備済みのバックエンド
- Supabase project: `learning-progress` (`wisedgcgwaebtkprdhth`, ap-northeast-1)
- Edge Function: `seiseki-runtime-v1`
- Endpoint: `https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/seiseki-runtime-v1`
- 旧 Google Sheet は mirror / rollback 用として維持
- 既存 STEP 共通生徒 session token を Edge Function へ渡して本人確認

## 実装要件
1. `juku_app.html` の生徒側 API を Edge Function 優先にする。
   - getStudentScores / saveScore / deleteScore
   - getReports / getReport / saveReport / deleteReport
   - getWish / saveWish
2. `readCommonSession()` から得られる token を本文 `token` として渡す。
3. write には `mutationId: crypto.randomUUID()` を付ける。
4. 401/403 は認証エラー。GASへ迂回しない。
5. 5xx/通信エラーのみ既存 `commonGradeRequest` へフォールバック可能。
6. 成績入力を 500ms 前後 debounce で自動保存。
7. 通知表も 500ms 前後で自動保存。
8. 志望校は 800ms 前後で自動保存。
9. 状態表示を `入力中 → 保存中… → 自動保存済み` とする。
10. `saveScore()` 成功後の `getStudentScores` 全件再取得を廃止し、送信 payload を `myScores` に local upsert する。
11. 通信中も入力をブロックしない。
12. 古い保存応答で新しい入力を上書きしないよう save sequence を持つ。
13. 既存の保存ボタンは当面 `今すぐ保存 / 再試行` として残してよい。
14. feature flag `SEISEKI_SUPABASE_AUTOSAVE` を設け、問題時に旧方式へ即時ロールバックできるようにする。
15. ログイン、履歴、グラフ、通知表、志望校の既存表示を壊さない。

## 重要
- `admin.html` の Supabase Phase 2 は今回同時に全面切替しない。まず `juku_app.html` 生徒側を安定させる。
- `assets/js/supabase-config.js` は停止中の旧 `seiseki-kanri` project を参照しているため、今回の生徒側実装でそれを使わない。
- service_role key は絶対にブラウザへ入れない。
- 旧 Google Sheet データを消さない。

## 受入テスト
- ダミー生徒で点数を変更し、保存ボタンを押さず 1 秒程度で自動保存済み表示。
- 再読込後も値が残る。
- 5科目を連続入力して欠損しない。
- 通知表・志望校も同様に残る。
- delete 後に再読込して復活しない。
- Google Sheet mirror も後から反映される。
- 通信失敗時に保存済みと誤表示しない。

実装後は main へ直接入れず、まず branch + PR にして差分とテスト結果を提示してください。
