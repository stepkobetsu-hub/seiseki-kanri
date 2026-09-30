# 過去問DB高速化 — 2026-10-01（準備済み・本番切替前）

## 状態
Supabaseへの初回コピーと互換APIのデプロイを完了。Google Apps Scriptの外部通信権限承認待ち。既存WebアプリのデプロイとGitHub Pagesは未変更なので、現在の正本はGoogle Sheetのまま。
初回確認：学校7校、登録セル56件、PDF／画像55件。稼働データのコピーはコードに含めない。

## 遅さの原因
現行バインドApps Scriptの `normalizeDriveFilesInData_` が、一覧取得ごとに全登録ファイルに対してDrive実在・ゴミ箱・名称・MIME確認を個別に実行する。
55ファイル分の往復が登録アプリの事前・事後再読込でも発生。新APIはこれを実行しない。実測速度は承認後に測定する。

## 新基盤
- プロジェクト：[learning-progress](https://supabase.com/dashboard/project/wisedgcgwaebtkprdhth)
- 関数：`past-exam-runtime-v1`
- テーブル：`past_exam_state`、`past_exam_history`、`past_exam_auth`
- 関数API：https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/past-exam-runtime-v1
- PDF：既存Google Drive。ファイルの移動・再共有なし。
- 登録済み：定期テストPDF／提出待ち：定期テスト管理ファイル。用途を維持。
- テーブルの直接公開権限を撤回、RLSを有効化。既存の閲覧／登録／管理者の認証をサーバー側で検証。service_roleは関数内のみ。
- `savePatch`：変更セルだけ送信、変更前の値との比較で競合を拒否、同一操作の再試行は冪等。
- `saveFull`：旧アプリ互換。revisionを渡した場合は競合を拒否。旧APKはrevisionを渡さないため、同時の全体保存の上書き対策は新APKへの改修が必要。
- 更新前データを履歴保存する。

## 本番切替手順
1. Google Apps Scriptの外部通信権限を承認し `verifyPastExamFastConnection` で接続・件数を確認。
2. Google Sheetから最新データを再コピーする。切替前の新DBは読取本番ではないため、コピー時点以降の増加を再照合。
3. 既存Apps Scriptのload／getSchools／saveAllData／upsertRowを新APIへ接続。getSubmitInfoも新DBの登録済みIDを使用。アップロード・Drive削除・学生提出は維持する。
4. 既存デプロイIDを維持して新版公開。現行APKからの読み込み・登録・再試行を検証。
5. Pagesは直接新APIから読取、差分保存へ変更。保存失敗を成功扱いしない。未送信変更がある間は背景再読込で上書きしない。
6. Google Sheetは移行前バックアップとし、必要時に `exportPastExamBackupToSheet` で出力。正本が変更されたことを台帳に明記。
7. 新旧件数・データ一致、匿名書込拒否、Driveリンク、初回／再読込時間、競合検出を確認後に台帳の本番状態を更新。

## 検証済み
SQLの追加・冪等再試行・競合拒否・削除・anon直接アクセス拒否・RPC実行権限をトランザクション内で検証、ロールバック済み。
Edge Function v1デプロイ済み。HTTPS経由の実動作はGoogle承認後に確認する。
