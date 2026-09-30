# STEP過去問スキャナー Web版 1.0.1

本番： https://stepkobetsu-hub.github.io/seiseki-kanri/past-exam-web/

iPhone Safari・Android Chrome向けのPDF登録Webアプリ。iPhone版の配布方式として利用者がWebアプリを選択（2026-10-01）。Androidでも同じWeb版を利用できる。iPhoneはSafariの共有→ホーム画面に追加（表示される場合はWebアプリとして開く）、AndroidはChromeメニュー→ホーム画面に追加。manifestと180/192/512pxの専用アイコンを設定。

スキャン・トリミングはiPhoneのファイルアプリ／AndroidのGoogle Driveで行い、保存したPDFを選択する。WebページがOSの文書スキャナーを直接起動したり、ページ内で自動切抜きする機能はない。App Store/IPA/TestFlight配布ではない。Android専用APKはML Kitによる撮影・補正・PDF・登録の一体型を維持する。

## 登録仕様

担当者・学校・学年・科目・年度（2000年度まで）・回・種類を選択→1科目分の複数ページPDFを1ファイルとして選択→既存uploadAllでDriveへ保存→保存済みfileIdと当初の項目をlocalStorageへ保持→最新DBを読み、変更セル1件のみsavePatch→再読込で同じfileIdを確認後、大きな緑の登録完了カード・ダイアログを表示。

学校一覧は現行の高速API、通信エラー時は既存GASへフォールバック。空・不正な学校一覧/DBでは登録しない。学校取得失敗は画面から再試行できる。DB保存競合は失敗表示とし、再試行は最新セルへ同じfileIdを重複なしで追加する。ネットワーク保存再送は同一patch。saveFullは使わない。処理中は入力を固定。登録待ちがある間は新規アップロードを禁止し、DB登録だけを再試行する。PDFの実体はローカルに保存せず、fileId・登録項目のみを保持する。

既存Web提出の接続設定をpast-exam-upload-config.jsへ移し、従来のpast_exam_upload.htmlと共有する。接続先・既存の認証値は変更していない。既存Web提出のUI/登録処理は今回変更しない。非公開の管理鍵・署名キーは追加しない。

Service Workerは登録しない。ネット接続必須で、PDF/API応答をオフライン保存しない。通常の再起動・再読込で公開された最新版を使う。Safariブラウザとホーム画面Webアプリで登録待ちの保存領域が異なる場合があるため、登録待ちは同じ起動方法で再試行する。

## 配布・QR

- 案内： https://stepkobetsu-hub.github.io/seiseki-kanri/past_exam_scanner_install.html
- Android QR： images/past-exam/android-download-qr.svg → 固定正式APK
- iPhone QR： images/past-exam/iphone-open-qr.svg → 共通Web版
- Android用QRはAPK直接ダウンロード、iPhone用QRはWeb起動・ホーム画面追加。案内ページからAndroidもWeb版を選べる。
- QRを画像からデコードし、意図したURLと一致することを確認。固定URLなので今後の更新で再作成不要。

## 検証・制限

node --test past-exam-web/registration.test.mjs past-exam-fast-save.test.mjs：10件成功。アーカイブ年度、既存ファイル・flags・他セル維持、不正応答拒否、null新規セル、重複防止、保存後の再試行、競合停止、同一patch再送と再読込確認を検証。構文・差分・QRデコードを確認。

公開画面と学校一覧読取は公開後に確認。iPhone/Androidの実機ホーム画面追加・標準スキャン・PDF選択・実PDFのDriveアップロードとDB登録は未確認。既存Drive側の権限エラーはこのWeb画面の追加では解決しない。uploadAll成功の応答が失われfileIdが不明となった場合は自動復旧できない。利用端末の保存領域を消す/アプリを削除する前に、登録待ちを解消する。

参考：AppleのSafari Webアプリ案内 https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios 、ファイルアプリのスキャン https://support.apple.com/ja-jp/guide/iphone/iphf2746307f/ios 、Google Driveのスキャン https://support.google.com/drive/answer/3145835?co=GENIE.Platform%3DAndroid&hl=ja 。
