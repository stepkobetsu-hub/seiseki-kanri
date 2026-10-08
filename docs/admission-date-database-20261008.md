# 入塾日を成績管理DBから表示する

2026-10-08、生徒マスタ（☆マスタA列=生徒番号、C列=入塾日）から328名の入塾日原文を取り込み、315名を有効な日付として保存した。元データが年省略・不正日付の場合は推測せず原文を保持する。

保存先: Supabase wisedgcgwaebtkprdhth / public.students.admission_date (date)、admission_date_text (text)。生徒番号で照合する。通常の生徒同期ではこの値を上書きしない。

seiseki-admin-runtime-v1 (version 20) のgetStudents/getStudentList/getStudentDirectoryDetail/getStudentScoresで同じDBから取得する。student_directory.htmlとadmin.htmlの入塾日表示はGASへの個別リクエストを行わない。

既存の生徒マスタ同期・自動同期のputDirectoryDetails完了後、まだ入塾日を取り込んでいない在籍生を最大4名ずつ背景処理で取得する。成功済みの生徒は再取得しない。失敗時は次の同期で再試行する。入塾日が未登録なら未登録、不正日付なら原文と日付要確認を表示し、通塾期間を計算しない。

確認: 生徒番号1001と1293のDB値をマスタと照合。学生一覧・詳細・成績API応答、日付検証、画面2か所の一致、入塾日表示のGoogle通信ゼロをテスト。既存認証・権限チェックは維持。
