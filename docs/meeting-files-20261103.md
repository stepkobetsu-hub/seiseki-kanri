# 面談メモの写真・PDF添付（2026-11-03）

状態：サーバー側v32と非公開保存先は反映済み。画面変更のmain公開は明示的な本番公開承認不足として自動承認審査に拒否され、公開前の変更として準備済み。現時点の本番画面には添付欄は表示されない。

面談アプリ・管理画面「面談」の本文直下に添付欄を追加。写真（JPEG/PNG/GIF/WebP/HEIC）・PDFを最大5点、各10MBまで登録できる。生徒情報検索・面談アプリ一覧・管理画面一覧・成績比較の面談メモでは、本文の下にアイコンとファイル名を並べ、クリックすると別タブで開く。

## 保存・権限

- `meeting_memos.attachments` に添付ID・名前・MIME・サイズのみ保存。既存クライアントが添付IDを送らなければ既存添付を保持する。
- `meeting_memo_files` はRLS有効、anon/authenticatedへのテーブル権限なし。ファイルは非公開bucket `step-meeting-files` に保存。Storageにも当該bucketへの一般ユーザーアクセスを拒否するrestrictive policyを追加。
- `seiseki-admin-runtime-v1` v32の `saveMeetingAttachment` / `getMeetingAttachment`。既存の講師セッション・共通面談権限（public-13、write/view）と対象生徒・既存メモの校舎を確認。
- 保存時に実ファイルのシグネチャ、10MB上限、SHA-256、メモID・生徒番号との対応を検証。アップロードの再試行は同じ添付IDで行う。
- 本文に関連づけられた添付だけ5分有効の署名URLを発行。保存前・取り外し後・メモ削除後のファイルは閲覧APIから取得できない。
- 「取り外す」はメモとの関連を外す操作で、ストレージからの即時物理削除は行わない。未保存アップロードも非公開のまま残る。
- メモ本文はこれまでどおり入力必須。メール送信の既存動作を維持し、ファイル自体はメールには添付しない。
- HEICは端末によって表示できずダウンロードになる場合がある。

## 検証

`node --test tests/meeting-files.test.mjs`：アップロード再試行、署名取得、未関連添付拒否、別生徒・別メモID拒否、取り外し、既存編集時の保持、容量・形式、ファイル名のエスケープ、実runtime経路の認証・mutation確認、フロント編集欄の再試行を確認。

`npx deno check --no-lock supabase/functions/seiseki-admin-runtime-v1/index.ts`、3画面のインラインJavaScript構文検査も成功。

既存の古い `staff-permissions.test.mjs` は既存TS importの除去不足と旧scriptバージョン固定、`meeting-memo-view.test.mjs` / `admin-device-session.test.mjs` は既存画面との不一致で失敗するため、本変更は上記の追加統合テストで検証。既存テスト自体は変更していない。
