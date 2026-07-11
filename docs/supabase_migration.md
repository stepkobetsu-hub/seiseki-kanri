# 成績管理システム Supabase移行手順

## 現状調査メモ

- 管理画面は `admin.html` にHTML/CSS/JavaScriptが集約されています。
- API呼び出しの中心は `admin.html` の `api(data)` です。
- GAS側は `gas_code.js` の `route(e)` で `action` ごとに処理しています。
- `getStudents`、`getAllScores`、`getAllReports`、`getAllWishes`、`getMeetingMemos` はシート全体を `getDataRange().getValues()` で読み、画面側またはGAS側で絞り込んでいます。
- `admin.html#compare` は初期表示で生徒一覧を読み、選択後に成績、通知表、志望校、面談メモ、入塾時情報を個別取得しています。
- 速報画面は従来、全成績を取得してから絞り込み、新着確認で通知表・志望校も追加取得していました。

## 変更方針

1. 既定の動作は `legacy-gas` のまま維持します。
2. `localStorage.seisekiDataSource = "supabase"` と、Supabase接続設定がある時だけSupabase読み取りへ切り替えます。
3. Supabase URLとキーはHTMLへ直書きしません。
4. `service_role` キーは移行・同期・バックアップ用スクリプトだけで使います。
5. 保存系は当面GASへフォールバックします。書き込みをSupabaseへ移す時はサーバー側API、またはSupabase Auth + RLSの追加ポリシーを先に用意します。

## Supabaseセットアップ

1. Supabaseで成績管理専用プロジェクトを作成します。
2. SQL Editorで次を順番に実行します。
   - `supabase/schema.sql`
   - `supabase/dashboard_views.sql`
   - `supabase/rls_policies.sql`
3. 管理ユーザーをSupabase Authで作り、JWTの `app_metadata.role` を `admin` に設定します。
4. GitHub Pagesへ `service_role` は置かないでください。

## フロント側切り替え

ブラウザの開発者ツールでテストする場合:

```js
localStorage.setItem('seisekiDataSource', 'supabase');
localStorage.setItem('seisekiSupabaseUrl', 'https://xxxx.supabase.co');
localStorage.setItem('seisekiSupabaseAnonKey', 'anon key');
location.reload();
```

本番反映時はHTMLに直書きせず、別途配信する非公開設定、サーバー側API、またはSupabase Auth導入後の設定注入方式にしてください。

## 既存データ移行

まず件数確認:

```bash
DRY_RUN=1 GAS_WEB_APP_URL="https://script.google.com/macros/s/.../exec" SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." node scripts/migrate_legacy_to_supabase.mjs
```

問題がなければ `DRY_RUN=1` を外して実行します。

移行後は次を照合してください。

- 生徒件数: GAS `getStudents` と Supabase `students`
- 成績件数: GAS `getAllScores` と Supabase `test_scores`
- 通知表件数: GAS `getAllReports` と Supabase `report_cards`
- 志望校件数: GAS `getAllWishes` と Supabase `school_preferences`
- 面談メモ件数: GAS `getMeetingMemos` と Supabase `meeting_memos`

## 生徒マスタ同期

☆マスタをCSVで書き出した後、次で同期します。

```bash
MASTER_CSV_PATH="./master.csv" SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." node scripts/sync_students_from_master_csv.mjs
```

このスクリプトは `student_code` を基準にUPSERTします。氏名だけでは紐付けません。

## バックアップ

```bash
SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." BACKUP_DIR="./backups/2026-07-10" node scripts/backup_supabase.mjs
```

テーブルごとのJSONと `summary.json` を出力します。

## 元へ戻す方法

フロント側は次で即座にGASへ戻せます。

```js
localStorage.setItem('seisekiDataSource', 'legacy-gas');
location.reload();
```

ブランチ単位では `supabase-migration-phase1` を破棄すれば、開始時点の `main` に戻れます。開始時点のコミットは `9de053f96fae9ab2f4766281665122f2f787439f` です。
