# Minecraft AI Bot

Mineflayer、Gemini、Jevを組み合わせたMinecraftサーバー向けBotです。チャットコマンドや明示的な指示に応答し、プレイヤーとの会話、自律行動、サーバー状態監視を行います。

> 現在も開発中です。特にMineflayer Pathfinderによる移動は地形やサーバー設定に左右され、常に目的地へ到達することを保証しません。公開サーバーで使う前に、テスト環境で動作と権限を確認してください。

## 特徴

- MineflayerをNode.jsコンテナで常時接続し、ゲーム内のコマンドや安全な自律行動を処理
- GeminiはBotに向けた通常会話に使用
- Jevは`Jev: ここに来て`のような明示的な指示だけを判定し、既定で1日3回（UTC）に制限
- Minecraftへのプレイヤーログイン時に挨拶
- Cloudflare WorkerでMinecraftサーバーを30分ごとに監視し、状態をKVへ保存。OFFLINEからONLINEへの復帰時は任意でDiscord Webhook通知

LLM API、Railway、Cloudflareなどの料金は各サービスのプランと利用状況によって異なります。無料・低額での運用を保証するものではありません。

## アーキテクチャ

```text
Minecraft / Discord
        |
        v
Mineflayer Bot (Node.jsコンテナ)
  |-- ! コマンド、移動、ゲーム内操作 -> Mineflayer
  |-- Bot宛ての通常会話             -> Gemini（任意）
  `-- Jev: 付きの明示的な指示       -> Jev（既定3回/UTC日）

Cloudflare Worker（独立した監視サービス）
  `-- 30分ごとのMinecraft Status Ping -> KVへ状態保存 -> 復帰時Discord Webhook（任意）
```

WorkerはBotプロセスを起動・再接続しません。MineflayerとDiscord Gatewayは常時稼働するNode.jsコンテナで動作します。

## 必要なもの

- Node.js 22以降、またはDocker
- 接続可能なMinecraft JavaサーバーとBot用アカウント
- Jev APIキー（Bot起動に必須）
- Gemini APIキー（会話生成を使う場合）
- Discord Bot TokenとチャンネルID（Discord連携を使う場合）

Minecraft、Jev、Gemini、Discordの各アカウント・サービスを利用する際は、それぞれの利用規約とサーバー運営者のルールに従ってください。

## ローカルで起動

```sh
git clone https://github.com/fk2000/minecraft-ai-bot.git
cd minecraft-ai-bot
npm ci
cp .env.example .env
```

`.env`を編集し、少なくとも以下を設定します。実際の値やAPIキーは公開Issue、チャット、Gitへ貼らないでください。

```dotenv
MC_SERVER_HOST=your-minecraft-server.example
MC_SERVER_PORT=25565
MC_USERNAME=your_bot_account
MC_AUTH=offline
JEV_API_KEY=your_jev_api_key
```

認証が必要なサーバーでは`MC_AUTH=microsoft`を設定します。初回はデバイス認証を完了してください。認証キャッシュは`MC_AUTH_CACHE_DIR`（既定`./.minecraft-auth`）に保存されます。トークンを含むため、このディレクトリを共有・コミットしないでください。

コンテナ版をビルドして起動します。

```sh
npm run build:container
npm run start:container
```

Gemini会話には`GEMINI_API_KEY`、Discord連携には`DISCORD_TOKEN`と`DISCORD_CHANNEL_ID`を設定します。Discord Developer PortalでMessage Content Intentを有効にしてください。Discord接続を有効にした場合、Botは指定チャンネルのメッセージを扱います。

> `npm start`は従来のNode.js実装を起動します。現在のコンテナ版を試す場合は`npm run start:container`を使ってください。

## コマンド

コンテナ版は`!`で始まる入力を会話としてGeminiへ渡さず、コマンドとして処理します。

| コマンド | 動作 |
| --- | --- |
| `!help` | コマンド一覧を表示 |
| `!ping` | `pong`と返信 |
| `!come` | Minecraftチャットの発言者、またはDiscord利用時に見つかったプレイヤーへ移動 |
| `!stop` | 現在の移動、採掘・使用操作、建築を停止 |
| `!build` | 条件を満たす場所に板材32個で小屋を建築 |
| `!goals` | コンテナ版で選べる行動を表示 |
| `!goal survive\|socialize\|explore\|observe\|rest` | 許可された安全な行動を実行。ゲーム状況により実行できない場合があります |
| `!hold [アイテム名]` | 所持アイテムを手に持つ |
| `!weather clear\|rain\|thunder` | 開発者アカウントのみ。天気を変更 |
| `!difficulty peaceful\|easy\|normal\|hard` | 開発者アカウントのみ。難易度を変更 |

`!`なしの「ここに来て」「ここにきて」「こっち来て」もMinecraftチャットでは直接移動指示として扱います。Pathfinderが経路を見つけられない場合や発言者の位置を取得できない場合、Botはチャットで失敗を通知します。

## Jev・Gemini・自律行動

- 自律行動の選択はMineflayer内のローカルルールで行い、既定6秒ごとに状況を確認します。プレイヤー操作直後は自律行動を控えます。
- Jev判定は`Jev: 指示`の形式に限られます。既定上限は`JEV_DAILY_LIMIT=3`回/UTC日で、上限は永続化されます。通常会話や自律行動ではJev APIを呼びません。
- MinecraftチャットでBotに話しかけると、Geminiが設定されている場合に会話応答を生成します。Gemini未設定時は簡易応答にフォールバックします。
- 行動の安全性・到達性はサーバー、地形、Mineflayerの状態に依存します。Botに管理者権限を与える場合は、必要な権限だけに限定し、十分にテストしてください。

## Railwayへデプロイ

このリポジトリにはDockerfileとRailway設定がありますが、公開済みのRailway Template URLや1-click Deployリンクは設定していません。Railwayで「Deploy from GitHub Repo」からリポジトリを選び、以下をサービスのVariablesへ登録してください。

必須:

- `MC_SERVER_HOST`, `MC_USERNAME`, `JEV_API_KEY`
- Microsoft認証では`MC_AUTH=microsoft`と`MC_AUTH_CACHE_DIR=/data/minecraft-auth`

任意:

- `MC_SERVER_PORT`（既定`25565`）、`MC_VERSION`、`MC_AUTH`
- `GEMINI_API_KEY`、`GEMINI_MODEL`
- `DISCORD_TOKEN`、`DISCORD_CHANNEL_ID`、`DISCORD_LOG_CHANNEL_ID`
- `JEV_DAILY_LIMIT`（既定`3`）、`JEV_USAGE_STATE_PATH`
- `AUTONOMY_INTERVAL_MS`、`AUTONOMY_IDLE_AFTER_MS`
- `NIGHT_SLEEP_CHECK_INTERVAL_MS`、`BED_SEARCH_DISTANCE`

Microsoft認証を使う場合はRailway Volumeを`/data`へマウントしてください。認証キャッシュとJev利用数をデプロイ後も保持できるよう、保存先を永続Volume上にします。APIキーとTokenはSecretとして登録し、イメージやログに出力しないでください。ビルド後、実行ログでDiscordログイン（設定した場合）と`[minecraft] spawned: connected successfully`を確認します。

## Cloudflare Workerで状態監視

WorkerはMineflayer Botとは別に動作します。30分ごとにMinecraft Java Status Pingを行い、状態をKVへ保存します。`GET /status`で保存済みの状態を返します。サーバーがOFFLINEからONLINEへ戻った場合、`DISCORD_WEBHOOK_URL`が設定されていれば通知します。

1. `npx wrangler login`でCloudflareにログインします。
2. `npx wrangler kv namespace create MY_BOT_KV`を実行し、返されたNamespace IDを`wrangler.toml`に設定します。
3. `wrangler.toml`の`MC_SERVER_HOST`と`MC_SERVER_PORT`を自分のサーバーに合わせます。
4. 必要であれば`npx wrangler secret put DISCORD_WEBHOOK_URL`でWebhook URLをSecretとして登録します。
5. `npm run worker:typecheck`で型チェックし、`npm run worker:deploy`でデプロイします。

このWorkerはチェックを実行するだけで、Botコンテナを起動したり、Mineflayerの再接続を制御したりしません。

## 開発・テスト

```sh
npm test
npm run worker:typecheck
```

コマンド解析、行動ロジック、Jevの日次上限などのテストを実行します。

## リポジトリ構成

```text
src/
  bot/       Mineflayer・DiscordコンテナBot
  jev/       Jev APIクライアント、判定、日次上限
  mc/        Minecraft状態確認
  index.ts   Cloudflare Workerエントリーポイント
Dockerfile   コンテナビルド
wrangler.toml Cloudflare Worker設定
```

## 貢献・サポート

不具合報告や機能提案は[GitHub Issues](https://github.com/fk2000/minecraft-ai-bot/issues)、変更提案はPull Requestで歓迎します。報告時は再現手順、期待した結果、実際の結果、関連ログ（Token・ユーザー識別情報・サーバー接続先などを伏せたもの）を記載してください。

## ライセンス

ライセンス情報は現在このリポジトリに登録されていません。ライセンスが明記されるまでは、利用・再配布の権利を推定しないでください。
