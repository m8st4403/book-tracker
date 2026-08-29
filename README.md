# 本棚スケジュール プロトタイプ v2

## 追加した機能
- 作品タイトル＋巻数で登録候補を検索
- 作家名から出版物を検索
- 作家名から自分の蔵書を検索
- ISBN / バーコード登録
- 登録した本に紐付く発売予定候補
- 独立カレンダー
- iPhone標準カレンダー用ICS出力

## データ源
- Google Books API: intitle / inauthor / isbn 検索
- openBD: ISBNから日本語書誌情報を補完

Google Books APIは intitle / inauthor / isbn のフィールド検索に対応しています。
openBDはシリーズ名、著者、書名、出版日、ISBN等の書誌項目を提供しています。

## iPhoneで試す
HTTPSで公開した index.html をSafariで開き、「ホーム画面に追加」してください。
カメラ読み取りにはHTTPSが必要です。

## 注意
これは仕様確認用MVPです。検索結果の「巻数」は出版社ごとの表記ゆれがあるため、最終版ではシリーズ・巻数を正規化する専用DBを用意するのが望ましいです。
