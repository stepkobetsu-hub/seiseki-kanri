# 良い事や行事予定 — 教室からSTEP広報窓口への報告
更新日：2026-10-07

## 入口
- 面談メモ：https://stepkobetsu-hub.github.io/seiseki-kanri/meeting_memo.html
- 報告画面：https://stepkobetsu-hub.github.io/seiseki-kanri/classroom_reports.html
- 塾長の広報窓口：https://step-publicity-desk.mintcocoajasmine.chatgpt.site
- 面談メモの上部、ログアウト・トップへの左に「良い事や行事予定」を追加。同じ講師セッションを引き継ぐ。

## 操作
校舎、種類、出来事・予定の日付（任意）、件名、内容を入力して送信する。発信に利用してよい内容は「この内容をホームページ・SNSなどの発信に使ってよい」にチェックする。未チェックの内容は本人・塾長への確認が必要として窓口へ渡す。

下部の「以前の報告」は50件ずつ表示し、「さらに表示」で過去分を読み込む。編集ボタンでフォームに戻り、「変更して送信」する。本人は自分の報告、権限4の塾長は全員の報告を確認・編集できる。校舎や操作の共通権限設定も確認する。削除機能は追加していない。

自分の端末では既存ログインを保持し、共用端末は面談メモと同じ30分の無操作ログアウトを継承する。トークンをリンクURLへ含めない。

## 保存・連携
- Supabaseプロジェクト：wisedgcgwaebtkprdhth
- Edge Function：step-publicity-report-runtime-v1（新規。既存seiseki-admin-runtime-v1を変更しない）
- 正本：supabase/functions/step-publicity-report-runtime-v1/
- 保存テーブル：public.step_publicity_reports
- 読み取り専用連携キーのハッシュ：public.step_publicity_reader_config
- テーブルはRLS有効、anon／authenticatedへ権限なし。報告APIで共通講師セッション、共通権限、本人または塾長という編集条件を確認。
- 平文の連携キーはSitesのserver-only secret STEP_REPORT_READER_KEY。公開コードや台帳には記録しない。
- STEP_REPORT_FEED_URLは固定の新規Edge Function。
- 広報窓口はlib/classroom-report-import.tsで状態取得時に変更を取り込み、desk_ideasとdesk_noticesに保存。報告UUIDを維持し、修正内容を話題に反映し、版ごとに新規または編集のお知らせを1件作る。
- 取り込み済みの版番号と取得カーソルはdesk_settingsへ保存。AI処理後の編集も新しい題材として確認できる。
- 広報窓口を開いている間は既存の30秒更新で受信。閉じているときも報告はSupabaseに保存され、次回の窓口起動・週次準備で取り込む。独立した閉じたアプリ向けのスマホプッシュは追加していない。
- 取得に失敗しても保存済みの窓口データを保持し、次回の取得で再試行する。

## 重複・競合
新規報告と送信操作にはUUIDを使用。タイムアウト後の同じ送信は二重登録しない。編集はrevisionを照合し、古い画面からの上書きは409で拒否する。元の報告者の講師コードは編集時も維持する。本人以外がIDを指定して編集しようとしても403で拒否する。

## 検証
- 新規保存、認証なしの拒否、本人のみの一覧、塾長の一覧・編集、他人の編集拒否、再送の重複防止、競合の拒否、入力検証、共通権限の拒否、読み取り専用キーの制限を自動テストで確認。
- 本番テーブルのRLSと公開APIロールの権限なしを確認。
- 本番の無認証・不正連携キーを拒否することを確認。
- 広報窓口への新規・編集の取り込みと重複防止は、明示した動作確認用データで本番APIにより照合し、検証後にそのデータを除去する。
- 実際の講師コード・パスワードによる送信は、利用者の初回報告で確認する。

## 更新と停止
フロントとEdge Function正本はseiseki-kanri/mainで管理。フロントはGitHub Pages公開を確認する。Edge Functionを変更したら同じ関数名へデプロイし、認証・保存・feedを確認する。スキーマ正本はsupabase/step_publicity_reports.sql、初回変更はSupabaseのstep_publicity_reportsマイグレーションへ記録済み。

窓口側は同じSitesプロジェクト・D1・本番URLへ公開する。連携だけを停止する場合はstep_publicity_reader_configのenabledをfalseにし、報告データを保持する。旧データや他のスタッフ認証・成績管理を変更しない。
