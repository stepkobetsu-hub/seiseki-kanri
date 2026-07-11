# Supabase Phase 2 完了メモ

実施日: 2026-07-11

## 完了したこと

- Supabaseプロジェクトへの接続設定を追加
- 管理画面ログインをSupabase Auth対応
- `profiles` に管理者ロールを登録
- RLSを設定し、未ログインでは生徒データが見えないことを確認
- 管理者ログイン後に `students` を読み取れることを確認
- Phase 2テストデータ `TEST001` / `TEST002` を投入して画面表示を確認
- テストデータ2件を削除
- 従来GASの `getStudents` から本番生徒データ96件をSupabaseへ投入
- 管理画面の生徒一覧で `取得元: Supabase` と96件表示を確認

## 今回の対象範囲

Phase 2では `students` の読み取りだけをSupabase化しています。

次のデータはまだ従来GAS側です。

- 成績データ
- 通知表
- 志望校
- 面談メモ
- 学校設定
- 入塾書類

## 公開前チェック

- `assets/js/supabase-config.js` に入れてよいのは Project URL と anon/publishable key のみ
- service role key、DBパスワード、管理者パスワードはGitHubへ入れない
- Supabase Authentication の Redirect URLs に本番URLを追加する
- GitHub Pagesでログイン、生徒一覧、検索、校舎/学年/学校フィルタを確認する
- 必要に応じて「従来方式で開く」でGAS表示に戻せることを確認する

## 再同期手順

PowerShellでリポジトリフォルダに移動して実行します。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_students_from_gas_prompt.ps1
```

最初は `1` を選んでドライランを確認し、件数に問題がない場合だけ `2` を選んで投入します。
