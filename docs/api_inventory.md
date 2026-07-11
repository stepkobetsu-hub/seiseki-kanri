# API通信一覧

## 管理画面 `admin.html`

| 画面 | 呼び出し | GAS action | 現状の主な取得量 | 移行方針 |
| --- | --- | --- | --- | --- |
| ログイン | ローカルパスワード | なし | なし | Supabase Authまたはサーバー側認証へ段階移行 |
| 速報 | `loadSpeed` | `getAllScores` | 成績データ。今回、年度・回次・校舎をAPIへ渡すよう変更 | `test_scores_with_students` または集計RPC |
| 速報/通知表タブ | `renderSpeedReport` | `getAllReports` | 通知表データ | `report_cards_with_students` |
| 速報/合否タブ | `renderSpeedResult` | `getAllWishes` | 志望校データ | `school_preferences_with_students` |
| 生徒一覧 | `loadStudents` | `getStudents` | 生徒マスタ全件 | `students`。ページネーション追加候補 |
| 成績×通知表 初期 | `initCompare` | `getStudents` | 生徒マスタ全件 | 初期は最小列のみ取得 |
| 成績×通知表 選択後 | `loadCompare` | `getStudentScores`, `getReports`, `getWish` | 選択生徒1名分 | `Promise.all` でSupabaseから並列取得 |
| 成績×通知表 面談 | `loadCompareMeetings` | `getMeetingMemos` | 選択生徒1名分 | `meeting_memos_with_students` |
| テスト成績一覧 | `loadAdminScores` | `getAllScores` | フィルタ付き全件 | DB側フィルタ + ページネーション |
| 通知表一覧 | `loadAdminReport` | `getAllReports` | フィルタ付き全件 | DB側フィルタ + ページネーション |
| 志望校一覧 | `loadAllWishes` | `getAllWishes` | 志望校全件 | DB側フィルタ + ページネーション |
| 面談メモ | `initMeetings`, `loadMeetingMemos` | `getStudents`, `getStaffMembers`, `getMeetingMemos` | 生徒・担当者・面談メモ | 生徒は最小列、メモはDB側絞り込み |
| 同期 | `runSync`, `applySync`, `loadSyncLog` | `syncStudents`, `applySyncResult`, `getSyncLog` | ☆マスタ差分・同期ログ | GASまたはサーバー側同期処理に残す |
| 学校設定 | `loadSchools` | `getSchools` | 学校マスタ | `schools` |
| 入塾時情報 | `loadEntryData` | `getEntrySheetData` | 選択生徒1名分 | Phase後半で `entry_documents` |

## GAS側の重い箇所

| GAS関数 | 読み取り対象 | 現状 |
| --- | --- | --- |
| `getStudents` | `生徒マスタ` | 全行取得 |
| `getAllScores` | `成績データ` | 全行取得後に年度・回次・校舎で絞り込み |
| `getAllReports` | `通知表データ` | 全行取得後に年度・学期・校舎で絞り込み |
| `getAllWishes` | `志望校データ` | 全行取得後に校舎・学年で絞り込み |
| `getMeetingMemos` | `面談メモデータ` | 全行取得後に生徒・担当・検索語で絞り込み |
| `syncStudentsFromMaster` | `☆マスタ` と `生徒マスタ` | どちらも全行取得し、差分を計算 |

## 優先移行順

1. `students`
2. `test_scores`
3. `report_cards`
4. `school_preferences`
5. `meeting_memos`
6. `schools`, `staff_members`, `entry_documents`

この順番なら `admin.html#compare` と速報の体感速度を先に改善できます。
