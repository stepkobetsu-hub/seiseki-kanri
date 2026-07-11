# Supabase移行 Phase 2 セットアップ手順

## 重要

- `main` ブランチへはまだ反映しません。
- 成績、通知表、志望校、面談メモの本番データはまだ移行しません。
- `service_role` key とDBパスワードは、チャット、GitHub、HTML、スクリーンショットへ貼らないでください。
- `assets/js/supabase-config.js` に入れてよいのは Project URL と anon key だけです。

## 1. Supabaseプロジェクト作成

1. Supabaseにログインします。
2. `New project` を押します。
3. Project name は例として `seiseki-kanri` にします。
4. Region は利用者に近いリージョンを選びます。日本利用なら `Northeast Asia (Tokyo)` があればそれを選びます。
5. Database Password を作成し、自分だけが見られる場所に保存します。
6. Project作成完了まで待ちます。

## 2. 必要な値を確認

Supabaseの Project Settings で次を確認します。

- Project URL
- anon public key
- service_role key

`service_role key` はローカルの移行・同期・バックアップだけで使います。GitHub Pagesには置きません。

## 3. SQLを適用

Supabaseの SQL Editor で次を順番に実行します。

1. `supabase/schema.sql`
2. `supabase/dashboard_views.sql`
3. `supabase/rls_policies.sql`
4. 架空データテスト用に `supabase/phase2_test_data.sql`

## 4. Authentication設定

1. Authentication > Providers で Email を有効にします。
2. 一般公開の新規登録は使わない運用にします。
3. Authentication > URL Configuration を開きます。
4. Site URL にGitHub PagesのURLを入れます。
   - 例: `https://stepkobetsu-hub.github.io`
5. Redirect URLs に管理画面URLを入れます。
   - 例: `https://stepkobetsu-hub.github.io/seiseki-kanri/admin.html`

## 5. 管理者ユーザー登録

1. Authentication > Users で管理者ユーザーを手動作成します。
2. 作成したユーザーの `User UID` を確認します。
3. SQL Editorで、次の形式で `profiles` に管理者権限を登録します。

```sql
insert into public.profiles (user_id, role, display_name)
values ('ここにUser UID', 'admin', '管理者')
on conflict (user_id) do update set role = 'admin';
```

メールアドレスだけではなく、`auth.users.id` と `profiles.role` で権限判定します。

## 6. GitHub Pages向け設定

`assets/js/supabase-config.js` の空欄に、公開してよい次だけを入れます。

```js
window.SEISEKI_CONFIG = window.SEISEKI_CONFIG || {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'anon public key'
};
```

`service_role key` は絶対に入れません。

## 7. RLSテスト

環境変数で値を渡して実行します。

```bash
SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_ANON_KEY="anon key" ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="..." node scripts/test_supabase_rls.mjs
```

期待結果:

| 状態 | students | test_scores | report_cards | meeting_memos | school_preferences |
| --- | --- | --- | --- | --- | --- |
| 未ログイン/anon keyのみ | 不可 | 不可 | 不可 | 不可 | 不可 |
| ログイン済み管理者 | 可 | 可 | 可 | 可 | 可 |
| ログイン済み非管理者 | 不可 | 不可 | 不可 | 不可 | 不可 |

## 8. 生徒マスタCSVドライラン

まず書き込まずに確認します。

```bash
DRY_RUN=1 MASTER_CSV_PATH="./master.csv" SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="service role key" node scripts/sync_students_from_master_csv.mjs
```

`sync-previews/` にCSVとJSONが出力されます。

確認する内容:

- CSV総行数
- 在籍生徒数
- 生徒コードあり/なし
- 新規追加予定
- 更新予定
- 変更なし
- 無効化予定
- 重複生徒コード
- 不正な学年
- 不正な校舎
- 空欄氏名
- 紐付け不能

## 9. 生徒基本情報だけ同期

RLSテストとドライランに問題がない場合だけ実行します。

```bash
DRY_RUN=0 MASTER_CSV_PATH="./master.csv" SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="service role key" node scripts/sync_students_from_master_csv.mjs
```

Phase 2では `students` だけです。成績、通知表、志望校、面談メモ、保護者情報、OCR情報は移行しません。

## 10. 生徒一覧比較

```bash
GAS_WEB_APP_URL="https://script.google.com/macros/s/.../exec" SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_ANON_KEY="anon key" ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="..." node scripts/compare_students_gas_supabase.mjs
```

比較対象:

- 初回生徒一覧
- 神領校のみ
- 大手町校のみ
- 中学生のみ
- 氏名検索
- 生徒コード検索
- 次の50件

## 11. GAS方式へ戻す

画面上の「従来方式で開く」ボタンを押します。

開発者ツールで戻す場合:

```js
localStorage.setItem('seisekiDataSource', 'legacy-gas');
sessionStorage.removeItem('seisekiSupabaseSession');
location.reload();
```

## 12. 2026-07-11 実施結果

- Supabase Project URL: `https://lrairqewdnyfxrydirrm.supabase.co`
- 管理者Authユーザー: `stepkobetsu@gmail.com`
- `profiles` に管理者ロール登録済み
- RLSテスト結果:
  - 未ログインの `students` 読み取りは0件
  - 未ログインの `students` 追加は401で拒否
  - 管理者ログイン後の `students` 読み取りは成功
  - 管理者ログイン後の `students` 追加/削除は成功
- Phase 2確認用テスト生徒:
  - `TEST001`
  - `TEST002`
  - 接続確認後に削除済み
- 従来GASの `getStudents` から本番生徒データを投入済み
- Supabase `students` 件数: 96件
- 管理画面の生徒一覧で `取得元: Supabase` と96件表示を確認済み

再投入または差分確認を行う場合:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_students_from_gas_prompt.ps1
```

最初は `1` を選びドライランで件数を確認し、問題がない場合だけ `2` を選んで投入します。
