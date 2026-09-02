# 成績管理を稼働中Supabaseへ完全移行する実装指示（2026-09-02）

## 目的

成績管理の本番保存先を、稼働中の Supabase `learning-progress` project に統一する。

- Project ref: `wisedgcgwaebtkprdhth`
- 現行 Edge Function: `seiseki-runtime-v1`
- 生徒用 `juku_app.html` は既に Supabase 先行保存へ切替済み
- 今回は講師・管理者用 `admin.html` の成績関連機能を同じデータへ接続する
- Google Sheet は移行確認期間中だけ非同期ミラー／復旧元として維持する
- INACTIVE の旧 project `lrairqewdnyfxrydirrm` は本番経路に使わない
- Cloudflare D1 へは移さない

## 必ず先に読む資料

1. `supabase/SEISEKI_AUTOSAVE_CUTOVER_2026-08-31.md`
2. `docs/CODEX_SEISEKI_AUTOSAVE_TASK_2026-08-31.md`
3. `docs/supabase_phase2_completion.md`
4. PR #14 と Issue #13
5. 現在の `admin.html`、`juku_app.html`
6. `supabase/functions/seiseki-runtime-v1/`

## 現在確認できている問題

1. `admin.html` が読み込む `assets/js/supabase-config.js` は停止中の旧 project を指している。
2. 管理者画面の Supabase 対象は旧 Phase 2 の一部処理だけで、成績・通知表・志望校の多くが GAS のまま。
3. 生徒画面と管理者画面が同じデータを必ず見る構成になっていない。
4. 管理者側だけ別の Supabase Auth を要求する旧実装が残っている。
5. 台帳の「完全移行済み」と実装範囲が一致していない。

## 対象機能

### 必須：成績管理の正本をSupabaseへ統一

- 生徒一覧・生徒検索
- テスト成績の一覧・個別取得・保存・削除
- 通知表の一覧・個別取得・保存・削除
- 志望校・合否結果の一覧・個別取得・保存
- 校舎、学年、学校、年度、回次による絞り込み
- 成績比較、平均、順位、グラフ表示に必要な取得処理
- 生徒用と管理者用で同じ `students` / `test_scores` / `report_cards` / `school_preferences` を使用

現在の管理画面で確認される主な action:
`getStudents`, `getStudentList`, `getAllScores`, `getStudentScores`, `saveScore`, `deleteScore`, `getAllReports`, `getReports`, `saveReport`, `deleteReport`, `getAllWishes`, `getWish`, `saveWish`, `saveWishResult`, `getSchools`。

### 別機能として整理してよいもの

次は `admin.html` 内に同居しているが、成績データそのものではない。今回同時に無理に移さず、GAS継続なら画面・台帳・コードで明確に区別する。

- 面談メモ
- 入塾書類／エントリーシート
- 講師メンバー管理

ただし、成績画面の動作に必要な学校マスタは対象に含める。

## 認証

- 管理者ブラウザーへ `service_role`、DBパスワード、秘密鍵を置かない。
- 停止中projectの Supabase Auth を復活させない。
- 既存の STEP 共通スタッフ認証で発行されたセッショントークンを使用する。
- Edge Function 側で毎回または安全な短期キャッシュを使ってスタッフ権限を再検証する。
- 生徒トークンでは管理者用一覧・他生徒データへアクセスできないこと。
- 必要権限レベルを既存システムの仕様から確認し、コードに根拠を残す。
- `user_metadata` を認可判定に使わない。
- public schema の対象テーブルは RLS を有効にし、ブラウザーから直接 service role 相当の操作をさせない。
- 管理者用集計は Edge Function 経由を基本とする。

## データ移行

1. 旧 GAS / Google Sheet の成績・通知表・志望校・学校マスタの件数を読み取り専用で集計する。
2. Supabase側の件数、重複キー、欠損を確認する。
3. 破壊的な全置換は行わず、再実行可能な idempotent import を用意する。
4. 生徒コード、年度、回次／学期を自然キーとして重複を防ぐ。
5. 移行前後の件数と代表レコードのハッシュ／値を照合する。
6. 本物の生徒データをテスト目的で変更しない。
7. 書込み試験はダミー生徒 `1320` だけを使用する。
8. 検証後にテストデータを元へ戻す。
9. Google Sheetへの非同期ミラーと失敗再試行を維持する。
10. mirror失敗を成功表示しない。ただしSupabaseへの正本保存成功とミラー状態は分けて扱う。

## 実装方針

- `seiseki-runtime-v1` に管理者用 action を追加するか、責務分離が必要なら `seiseki-admin-runtime-v1` を新設する。
- 生徒用の既存API契約を壊さない。
- 管理者一覧で全件表走査を繰り返さない。校舎・年度・回次等に必要なインデックスを設計する。
- 新しい公開テーブルを Data API へ直接公開しなくても動く構成を優先する。
- Viewを使う場合は `security_invoker=true` または公開権限を明示的に制限する。
- Edge Functionの依存バージョンを固定する。
- 旧 `assets/js/supabase-config.js` の停止project参照を本番経路から除去する。
- 緊急時のみ旧GASへ戻せる管理者用feature flagを残す。
- 通信エラー・5xxの読取フォールバックは可。書込みを旧GAS成功として扱う設計は避ける。
- 保存元が画面で分かるよう、診断表示には `source: supabase` を返す。

## テスト

最低限、以下を自動テストにする。

1. 未認証の管理者API拒否
2. 生徒トークンで管理者API拒否
3. 権限不足スタッフの拒否
4. 管理者の生徒一覧取得
5. 全成績・通知表・志望校の取得
6. 絞り込みとページング
7. ダミー1320の保存→再取得→更新→削除／復元
8. 生徒画面で保存した内容が管理者画面へ表示される
9. 管理者画面で保存した内容が生徒画面へ表示される
10. Google Sheetミラー状態
11. 旧停止projectへ通信しない
12. 既存の生徒用自動保存テストをすべて維持
13. RLS／権限アドバイザー確認
14. `npm test` または既存全テスト成功
15. GitHub Pages本番URLで主要タブの表示確認

## 進め方

1. mainを最新化
2. 専用branchを作成
3. 読み取り経路を先に実装
4. ダミーで比較確認
5. 書込み経路を実装
6. Google Sheetミラー確認
7. 自動テスト
8. PR作成
9. PR本文に、移行件数・未確認事項・ロールバック方法を記載
10. mainへは自動マージしない

## 完了条件

- 成績管理の生徒用・講師管理者用が同じSupabase正本を参照する。
- 成績関連の日常的な読取・保存がGAS正本に依存しない。
- 停止中の旧Supabase projectを呼ばない。
- Google Sheetはバックアップ／ミラーとして残る。
- 実データ照合・ダミー試験・全テスト・権限確認が完了している。
- PRが作成され、確認できる状態である。
- 本番反映はPR確認後に行う。
