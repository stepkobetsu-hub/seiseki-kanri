# 過去問DB高速化 — 2026-10-01（本番反映済み）

## 状態
本番反映済み。登録情報の正本はSupabase。PDF／画像は既存Google Driveに置いたまま。
切替時の確認：学校7校、登録セル56件、PDF／画像55件。稼働データのコピーはコードに含めない。
既存GASのデプロイID／URLを維持してv130に更新。Pagesの直接読込・差分保存は[PR #38](https://github.com/stepkobetsu-hub/seiseki-kanri/pull/38)で反映。Pages公開処理は成功、新画面のオンライン表示を確認。

## 遅さの原因
現行バインドApps Scriptの `normalizeDriveFilesInData_` が、一覧取得ごとに全登録ファイルに対してDrive実在・ゴミ箱・名称・MIME確認を個別に実行する。
55ファイル分の往復が登録アプリの事前・事後再読込でも発生。新APIはこれを実行しない。旧版との同条件の速度比較は未実施。

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

## 運用とバックアップ
- 登録情報の読込／保存先はSupabase。既存GASは旧アプリ互換とDrive操作を担当。
- Google Sheetは移行前のバックアップ。通常の保存では自動同期しない。Sheetの直接編集は本番へ反映されない。
- 最新データをSheetへ出力する場合は、バインドApps Scriptで `exportPastExamBackupToSheet` を実行する。
- 現行GASの追加部分と接続箇所は `gas/past-exam-fast-adapter.gs`、DB定義は `supabase/past_exam_fast_metadata.sql` を参照。
- Androidアプリ0.2.1（versionCode 6）は [PR #40](https://github.com/stepkobetsu-hub/seiseki-kanri/pull/40) でsavePatchへ対応。変更前・変更後の1セルだけ送信し、競合時はアップロード済みfileIdを保持して再試行する。全体保存へフォールバックしない。
- 0.2.0以前の旧APKのrevisionなし全体保存は互換性のため残す。古いアプリが同時保存すると上書きリスクが残るため、0.2.1以降への更新が必要。
- 実機APKでのアップロード操作は今回未検証。PDFアップロード／削除／学生提出の既存処理は変更していない。

## 検証済み
- SQLの追加・冪等再試行・競合拒否・削除・anon直接アクセス拒否・RPC実行権限をトランザクション内で検証、ロールバック済み。
- GASから新APIへ実接続し、学校7校・登録セル56件・ファイル55件を確認。
- 旧 `saveFull` の同一データ保存、空 `savePatch`、公開閲覧、無権限の保存拒否を実APIで確認。テスト用登録は残していない。
- Nodeの3テスト：保存中の追加変更、競合時のローカル変更保持、応答喪失時の同一差分のGAS再送。全て成功。
- 本番Pagesで新コードとオンライン表示、学校一覧を確認。端末ごとの体感速度は未測定。

## Android 0.2.1の検証
PR #40のGitHub Actionsで単体テスト、debug APK生成、Lintが成功。変更前セルの不変性、別セルを送信しないこと、初回nullと重複防止のテストを追加。mainの配布用ビルドで固定署名を照合して既存APK URLを更新する。実機操作は未検証。
