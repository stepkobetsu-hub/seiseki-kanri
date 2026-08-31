# 成績管理 Supabase 自動保存化（2026-08-31）

## 目的

`juku_app.html` の成績・通知表・志望校保存を、Google Apps Script / Google Sheet の完了待ちから切り離し、入力後すぐ Supabase に保存して Google Sheet はバックアップ／ミラーとして維持する。

## 現状確認

- 既存の成績管理は `gas_code.js` から Google Sheet（Spreadsheet ID `1Zq3AbL9Fx_skBUibh2F73kyWlw9Ionh3-dTOtots0D8`）へ直接保存している。
- `juku_app.html` の `saveScore()` は保存後に `getStudentScores` を再取得するため、保存待ちが長くなりやすい。
- 以前用意された Supabase project `seiseki-kanri` (`lrairqewdnyfxrydirrm`) は現在 INACTIVE。Free plan の active project 上限（2 project）により復帰できない。
- 現在本番で使われている `learning-progress` Supabase project (`wisedgcgwaebtkprdhth`, ap-northeast-1) は ACTIVE_HEALTHY で、Foresta/Step&Goal の runtime が稼働中。

## 2026-08-31 に先行実施したバックエンド

`learning-progress` project に、既存テーブルを壊さず以下を追加済み。

- `students`
- `test_scores`
- `report_cards`
- `school_preferences`
- `seiseki_seed_state`
- `seiseki_mutations`
- views: `test_scores_with_students`, `report_cards_with_students`, `school_preferences_with_students`

Edge Function を本番 deploy 済み。

- Function: `seiseki-runtime-v1`
- URL: `https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/seiseki-runtime-v1`
- `verify_jwt=false` だが、公開無認証ではなく、本文の STEP 共通生徒 session token を `foresta_v3_sessions` または既存共通 API で検証する。
- 生徒 role の本人 studentId 以外は拒否する。

### 保存方式

1. ブラウザから Supabase Edge Function へ送信
2. Supabase PostgreSQL に先に upsert/delete
3. ブラウザへ成功応答
4. `EdgeRuntime.waitUntil()` で旧 GAS / Google Sheet へバックグラウンドミラー
5. Google 側が失敗した場合は `seiseki_mutations` に `failed` として残し、次回リクエスト時に再試行

つまり、画面操作では Google Sheet の書込完了を待たない。

### 初回データ移行

一括置換ではなく安全な read-through 方式。

- 初回 `getStudentScores` → 旧 GAS から取得して Supabase へ seed
- 初回 `getReports` → 同上
- 初回 `getWish` → 同上
- seed 済みは `seiseki_seed_state` に記録し、2回目以降は Supabase から読む

Google Sheet は当面削除せず、バックアップ兼ロールバック先として残す。

## フロントエンドで行う変更（次工程）

### 1. `juku_app.html` の student grade API を切替

対象 action:

- `getStudentScores`
- `saveScore`
- `deleteScore`
- `getReports`
- `getReport`
- `saveReport`
- `deleteReport`
- `getWish`
- `saveWish`

これらは `commonGradeRequest` / GAS ではなく `seiseki-runtime-v1` を優先する。

送信例:

```js
await fetch('https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/seiseki-runtime-v1', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...payload,
    token: session.token,
    mutationId: crypto.randomUUID()
  })
});
```

読み取り・保存が Supabase 側で失敗した場合のみ、現行 `commonGradeRequest` をフォールバックにする。認証エラー（401/403）は安易に GAS へ迂回せず、再ログインを促す。

### 2. 成績入力を自動保存

- `f_jpn` ～ `f_avg_total5` の input/change を監視
- 450〜600ms debounce
- 年度・回次が選択済みの場合に保存
- 画面の値を先に確定し、通信待ちで操作を止めない
- ステータス: `入力中` → `保存中…` → `自動保存済み` / `保存失敗・再試行`
- 既存「保存」ボタンは当面「今すぐ保存／再試行」として残す（ロールバック期間後に削除可）

重要: `saveScore()` 成功後に毎回 `getStudentScores` を全再取得しない。送信 payload を `myScores` にローカル upsert して描画する。

### 3. 通知表・志望校も自動保存

- 通知表: 450〜600ms debounce
- 志望校: text/select change から 700〜900ms debounce
- 同一画面で複数通信が重なった場合、古い応答で新しい状態を上書きしないよう save sequence / mutationId を使う。

### 4. ロールバック

フロント側に一時的に feature flag を置く。

```js
const SEISEKI_SUPABASE_AUTOSAVE = true;
```

問題時は false に戻せば、旧 `commonGradeRequest` / GAS 経路へ復帰できる。Supabase テーブルと Edge Function は削除不要。

## 検証

本番切替前にダミー生徒で以下を確認する。

- 成績を1項目変更 → 1秒前後で `自動保存済み`
- 再読込後も値が残る
- Google Sheet にも数秒〜十数秒後に同じ値がミラーされる
- 連続入力（5科目を順番に入力）で最後の値が欠けない
- 通知表、志望校も同様
- delete → 再読込で復活しない
- Supabase 側を一時失敗させた場合、明確に保存失敗表示され、旧値を「保存済み」と誤表示しない

## 管理者画面について

`admin.html` には以前の Supabase Phase 2 コードが既に存在するが、`assets/js/supabase-config.js` は inactive project `lrairqewdnyfxrydirrm` を参照している。いきなり切り替えない。

まず生徒側の成績・通知表・志望校を安定させ、その後に管理者側の一覧・編集を `learning-progress` project へ移す。管理者 Supabase Auth / RLS の再設定を確認してから切り替える。
