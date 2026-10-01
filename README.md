# Minecraft AI Bot

MineflayerとGemini APIを使うMinecraftボットです。クライアントプロトコルは26.1に設定し、ViaVersionとViaBackwardsを導入した26.3サーバーへの接続を想定しています。`!`で始まる発言はGeminiに送信せず、通常コマンドとして処理します。

## セットアップ

1. Node.js 20以降を用意します。
2. `npm install`を実行します。
3. `cp .env.example .env`を実行し、`.env`に`GEMINI_API_KEY`とMinecraftサーバーの接続情報を設定します。`MC_USERNAME`は専用アカウント用の固有なキャッシュ識別子です。
4. サーバーがPaperまたはVelocityの場合、サーバー側に対応版の[ViaVersion](https://hangar.papermc.io/ViaVersion/ViaVersion)と[ViaBackwards](https://hangar.papermc.io/ViaVersion/ViaBackwards)を両方導入して再起動します。26.3対応を確認したViaBackwards 5.12.0以降を使ってください。
5. `.env`の`MC_VERSION=26.1`を確認し、`npm start`で起動します。

`MC_AUTH=offline`はオフラインモードのサーバー用です。Microsoft認証が必要なサーバーでは`MC_AUTH=microsoft`に設定してください。認証情報やAPIキーを`.env`以外に保存したり、Gitへコミットしたりしないでください。

開発者アカウントは`.env`の`DEVELOPER_USERNAMES`にカンマ区切りで指定します。既定値は`.fujiwarakaz,fujiwarakaz`です。

`MC_AUTH=microsoft`では、初回起動時にターミナルへデバイスログインURLとコードが表示されます。`https://microsoft.com/devicelogin`を開き、表示コードを入力して専用Microsoftアカウントで認証してください。コードは認証用の一時情報なので共有しないでください。別アカウントへ切り替えるときは、`MC_USERNAME`を新しい固有値に変更して認証キャッシュを分けてください。

ViaVersion単体が主に対応するのは新しいクライアントから古いサーバーへの接続です。今回のように古いクライアント（ボットの26.1）から新しいサーバー（26.3）へ接続するにはViaBackwardsも必要です。上記のPaper/Velocity以外のサーバーでは、サーバー基盤に合ったViaVersion系の導入方法を確認してください。ViaBackwardsが変換できない新機能や差異が残ることがあり、ゲーム内動作は実サーバーで確認してください。

## コマンド

- `!help`: 使用可能なコマンドを表示
- `!ping`: ボットの応答を確認
- `!goals` または 「目標一覧」: 設定可能な全目標タイプ一覧を表示
- `!goal [目標名]` または 自然言語指示（例:「採掘して」「装備を固めて」）: 指定した目標を実行
- `!come`または「ここ来て」: 発言したプレイヤーの近くへ移動
- `!stop`または「とまれ」: 移動と建築を停止
- `!build`または「家建てて」: 近くに3x3の木造小屋を建築（板材32個と平らな場所が必要）
- `!hold [アイテム名]`: インベントリの最初のアイテム、または名前に一致するアイテムを手に持つ
- その他の`!`コマンド: Geminiには送信せず、未対応メッセージを返す

## 目標システム（Goal System）

ボットは大幅に拡張された多様な自律・指示目標をサポートしています：

- **一連の装備固めワークフロー (Pipeline)**: 「採掘」 -> 「クラフト」 -> 「装備」 を一連の流れで連続実行し、自らの装備を固めます。
- **装備 (Equipment)**: 最強の防具・武器を点検し自動装着
- **採掘 (Mining)**: 鉄・石炭・ダイヤモンドなどの鉱石資源を掘削
- **クラフト (Crafting)**: 作業台で道具・防具・資材を製作
- **パトロール (Patrol)**: 拠点・プレイヤー周辺を警戒巡回
- **生存 (Survival)**: 危険な敵・溶岩を回避し防衛行動
- **地形把握 (Terrain Survey)**: 周辺高度・バイオーム・ランドマークの記録
- **街の分析 (Village Analysis)**: 村人・ベッド・職業ブロック構成の検出・計測
- **ネザー探検 (Nether Exploration)**: ネザー要塞・資源の警戒調査
- **エンド (End Exploration)**: 要塞・ポータル・ドラゴン戦の探検準備
- **古代都市 (Ancient City)**: ディープダーク・スカルク検知と静音調査
- **雪山 (Snowy Mountain)**: 粉雪回避と高地・山脈調査
- **ポプラ伐採 (Wood Cutting)**: ポプラ・白樺・オーク原木を大量伐採
- **倉庫整理 (Chest Sorting)**: 近くのチェストへの資材自動整理
- **優先体力回復・食べ物確保**:
  - HPや満腹度が低下すると自動的に優先目標として起動します。
  - **農作業 (Farming)**: 小麦・ニンジン等の収穫と種再植え
  - **調理 (Cooking)**: 食料調理と摂取・パンのクラフト
  - **荷物整理 (Inventory Sorting)**: 手持ちインベントリの整理整頓

起動後および30分ごとに自律目標をランダムまたは優先度に応じて選び、チャットで告知して実行します。周期は`AUTONOMY_INTERVAL_MS`で調整できます。

## テスト

`npm test`でコマンド判定とチャット応答の整形を確認できます。

## 行動ログ

ボットの接続、コマンド、移動・建築の開始と結果、Gemini APIの成功・失敗を`logs/bot-activity-YYYY-MM-DD.jsonl`へ日別のJSON Lines形式で追記します。UTCで週が切り替わると、完了した週（月曜から日曜）を`logs/bot-activity-week-YYYY-MM-DD.jsonl.gz`へ圧縮し、圧縮成功後に日別の元ファイルを削除します。チャット本文やGeminiの返答内容は記録しません。保存先のベースパスは`ACTIVITY_LOG_PATH`で変更できます。`logs/`はGit管理対象外です。