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

`MC_AUTH=microsoft`では、初回起動時にターミナルへデバイスログインURLとコードが表示されます。`https://microsoft.com/devicelogin`を開き、表示コードを入力して専用Microsoftアカウントで認証してください。コードは認証用の一時情報なので共有しないでください。Mineflayerの認証キャッシュは`MC_AUTH_CACHE_DIR`に保存します（既定値: `./.minecraft-auth`）。このフォルダーには認証トークンが含まれるため、共有・コミットしないでください。別アカウントへ切り替えるときは、`MC_USERNAME`を新しい固有値に変更して認証キャッシュを分けてください。

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

旧ローカル起動（`npm start`）では、30分ごとに近距離の探索またはプレイヤー・友好Mobへの接近を自律実行します。ブロック破壊やブロック操作を伴う目標は自律選択しません。Jevでゲーム状態を判断する安全な自律行動はコンテナ起動（`npm run start:container`）で利用できます。周期は`AUTONOMY_INTERVAL_MS`で調整できます。

## テスト

`npm test`でコマンド判定とチャット応答の整形を確認できます。

## 行動ログ

ボットの接続、コマンド、移動・建築の開始と結果、Gemini APIの成功・失敗を`logs/bot-activity-YYYY-MM-DD.jsonl`へ日別のJSON Lines形式で追記します。UTCで週が切り替わると、完了した週（月曜から日曜）を`logs/bot-activity-week-YYYY-MM-DD.jsonl.gz`へ圧縮し、圧縮成功後に日別の元ファイルを削除します。チャット本文やGeminiの返答内容は記録しません。保存先のベースパスは`ACTIVITY_LOG_PATH`で変更できます。`logs/`はGit管理対象外です。

## Jev付きコンテナBot (Mineflayer + Discord)

Cloudflare Workerは30分間隔の監視用途で、MineflayerやDiscord Gatewayの常時接続には使えません。両方の接続とJev判定を常時稼働させる場合は、リポジトリをRender Background Worker、Railway、Fly.ioなどのNode.jsコンテナへデプロイします。`Dockerfile`はNode.js 22でTypeScriptをビルドし、`src/bot/app.ts`を起動します。

必須のコンテナ環境変数:

- `MC_SERVER_HOST`, `MC_SERVER_PORT`, `MC_USERNAME`
- Microsoft認証を使う場合は`MC_AUTH=microsoft`と`MC_AUTH_CACHE_DIR=/data/minecraft-auth`を設定し、`/data`にRailway Volumeをマウントします。
- `JEV_API_KEY`
- Jevによる安全な自律行動は`AUTONOMY_INTERVAL_MS`（既定30分）ごとに計画し、プレイヤーが`AUTONOMY_IDLE_AFTER_MS`（既定6秒）以上操作していない場合に実行します。
- Discord連携には`DISCORD_TOKEN`, `DISCORD_CHANNEL_ID`を設定し、Discord Developer PortalでMessage Content Intentを有効にします。
- Geminiによる生成応答には`GEMINI_API_KEY`を設定します。未設定時もJevの固定応答とフィルタリングは動作し、LLM生成が必要な場合は簡易フォールバックを返します。
- 任意設定: `MC_AUTH`, `MC_VERSION`, `GEMINI_MODEL`, `SERVER_RULES_TEXT`, `COMMAND_HELP_TEXT`

既存のローカル設定との互換性のため、`MC_SERVER_HOST`/`MC_SERVER_PORT`が未指定の場合は`MC_HOST`/`MC_PORT`も読み込みます。コンテナ環境では`MC_SERVER_*`の使用を推奨します。

Jevは両方のチャット入力を評価します。無効/Noul、`spam_or_abuse`、またはtoxicityが0.7を超える入力は返信も転送もしません。安全な発言のみ相手のプラットフォームへ転送し、MinecraftではBotへの呼びかけ時、Discordでは指定チャンネルの発言時に限って応答します。ルール・コマンド案内は固定文で返し、Geminiは`casual_chat`かつ`need_llm > 0.6`の場合だけ呼び出します。デプロイ先には`JEV_API_KEY`、`DISCORD_TOKEN`、必要なら`GEMINI_API_KEY`をSecretとして登録し、Minecraftホスト/ポートをWorker監視設定と同じ値にします。

ローカル確認は`npm run build:container`と`npm run start:container`、コンテナ実行は`docker build -t minecraft-ai-bot .`および環境変数を設定して`docker run --env-file .env minecraft-ai-bot`です。既存の`npm start`は従来のNode.jsボットを起動します。

### Railwayへデプロイ

1. Railwayで「New Project」→「Deploy from GitHub repo」からこのリポジトリを接続します。ルートの`railway.json`が`Dockerfile`ビルド、1レプリカ、常時稼働、失敗時再起動を設定します。
2. Microsoft認証キャッシュをデプロイ間で保持するには、プロジェクトキャンバスでVolumeを作成してBotサービスに接続し、Mount Pathを`/data`にします。サービスのVariablesに`MC_AUTH_CACHE_DIR=/data/minecraft-auth`を登録します。Railway Volumeはコンテナの再デプロイ間でデータを保持します。
3. サービスのVariablesに以下を登録します。APIキーやDiscordトークンはRailwayのVariablesへ直接入力し、Gitへコミットしないでください。

```text
MC_SERVER_HOST=your-minecraft-server.example
MC_SERVER_PORT=25565
MC_USERNAME=JevAIBot
MC_AUTH=microsoft
MC_AUTH_CACHE_DIR=/data/minecraft-auth
MC_RECONNECT_INTERVAL_MS=10000
MC_PING_TIMEOUT_MS=5000
JEV_API_KEY=<Jev API key>
DISCORD_TOKEN=<Discord bot token>
DISCORD_CHANNEL_ID=<Discord channel ID>
DISCORD_LOG_CHANNEL_ID=<optional Discord log channel ID>
GEMINI_API_KEY=<Gemini API key>
NODE_ENV=production
```

`JEV_API_KEY`、`MC_SERVER_HOST`は必須です。Discord連携には`DISCORD_TOKEN`と`DISCORD_CHANNEL_ID`を両方設定し、Discord Developer PortalでMessage Content Intentを有効にします。`GEMINI_API_KEY`は任意で、未設定時は高精度LLMの代わりに簡易フォールバック応答を使います。
`MC_AUTH`は`offline`（既定）、`microsoft`、`mojang`から選べます。`MC_USERNAME`を変更するときはRailway Variablesを更新してサービスを再起動してください。`MC_RECONNECT_INTERVAL_MS`は再接続バックオフの基本値（既定10000ms）、`MC_PING_TIMEOUT_MS`は再接続前のMinecraft TCP status pingのタイムアウト（既定5000ms）、`MC_RECONNECT_RESET_AFTER_MS`は接続が安定したと判断してバックオフをリセットするまでの時間（既定120000ms）です。`AUTONOMY_INTERVAL_MS`はJevに自律行動を相談する間隔（既定30分）、`AUTONOMY_IDLE_AFTER_MS`はプレイヤーの操作後に自律行動を控える時間（既定6秒）です。必要なら`DISCORD_LOG_CHANNEL_ID`を追加するとkick、切断、エラー、再接続予定をそのチャンネルにも記録します。
4. DeploymentsのビルドログでDockerイメージのビルド完了を確認し、実行ログに`[discord] Logged in as ...`および`[minecraft] spawned: connected successfully`が出ることを確認します。Volumeと`MC_AUTH_CACHE_DIR`を設定して起動した後、最初の一度だけMicrosoftのデバイス認証を完了します。認証キャッシュはトークンを含むため、Volumeへのアクセスを制限し、内容をログやGitへ出さないでください。切断後は10秒、20秒、30秒と間隔を増やして最大60秒で再接続し、毎回ログイン前にMinecraft TCP status pingを行います。サーバー停止中はログインを試さず30秒ごとに再確認します。短時間でkickされる場合に再試行が10秒へ戻り続けないよう、バックオフは既定2分間安定接続できた後にリセットします。Jev自律行動で許可しているのは周囲の探索、近くのプレイヤー/友好Mobへの接近、危険Mobからの退避、観察・待機のみです。pathfinderの採掘とドア操作を無効にし、保護プラグイン導入前はブロック破壊を伴うタスクを実行しません。

## Cloudflare Workers 監視

`wrangler.toml`のCron Triggerで30分ごとにMinecraft Java Status Pingを行い、結果・最終成功日時をKVへ保存します。`GET /status`で現在の保存状態をJSON取得できます。OFFLINE中は監視だけを続け、OFFLINEからONLINEへの復帰時に`DISCORD_WEBHOOK_URL`が設定されていればWebhook通知します。

初回デプロイ手順:

1. `npm install`を実行し、Cloudflareへ`npx wrangler login`でログインします。
2. `npx wrangler kv namespace create MY_BOT_KV`を実行し、表示されたIDを`wrangler.toml`の`MY_BOT_KV`の`id`へ設定します。
3. `wrangler.toml`の`MC_SERVER_HOST`をサーバーの公開ホスト名/IPへ変更します。`MC_SERVER_PORT`と`CHECK_TIMEOUT_MS`も必要に応じて設定します。
4. 任意で`npx wrangler secret put DISCORD_WEBHOOK_URL`を実行し、Discord Webhook URLをSecretとして登録します。
5. `npm run worker:typecheck`で型検査し、`npm run worker:deploy`でデプロイします。ローカル開発は`npm run worker:dev`です。
6. デプロイ先の`https://<worker>.<account>.workers.dev/status`を開いて状態を確認します。

このWorkerは監視・KV状態管理・復帰時のWebhook通知を行います。Mineflayer/Discord Gatewayの常時接続とJev/Gemini会話処理は上記のコンテナBotが担当し、Cloudflare Worker単独ではそれらを起動・維持しません。またWorkerの`/status`は読み取り専用で、外部からチェックを強制実行しません。