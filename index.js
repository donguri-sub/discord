// 必要なライブラリを読み込む
const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

// --- 1. Render用の簡易Webサーバー設定 (スリープ防止&デプロイ成功用) ---
// Renderはこのポート(8080)を監視し、アクセスがあると「生きている」と判断します。
http.createServer((req, res) => {
  res.write("Bot is running!");
  res.end();
}).listen(8080);
console.log("Web server is running on port 8080 for Render.");


// --- 2. 各種APIキーの設定 (環境変数から読み込む) ---
// ローカルでのテスト用。Renderでは不要。
// require('dotenv').config(); 

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DISCORD_TOKEN || !GEMINI_API_KEY) {
  console.error("Error: DISCORD_TOKEN or GEMINI_API_KEY is not set in environment variables.");
  process.exit(1); // キーがない場合はエラーを出して終了
}

// --- 3. Gemini AI の初期化 ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// 使用するモデルを指定 (gemini-pro はテキスト生成に最適)
const model = genAI.getGenerativeModel({ model: "gemini-pro"});


// --- 4. Discord Bot の初期化 ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // メッセージの内容を読むために必須
  ],
  partials: [Partials.Channel],
});


// Botが準備完了した時のイベント
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  // ステータスを設定
  client.user.setActivity('Gemini AI | メンションで会話', { type: ActivityType.Playing });
});


// メッセージを受け取った時のイベント
client.on('messageCreate', async (message) => {
  // ボット自身のメッセージ、またはメンションされていないメッセージは無視
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  // メンション部分(@Bot名)を取り除く
  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();

  if (!prompt) {
    message.reply("何か話しかけてみてね！");
    return;
  }

  // 「考え中...」というリアクションをする
  await message.react('🤔');

  try {
    // Discordのテキストチャンネルは文字数制限(2000文字)があるため、
    // 長くなりすぎないように設定（必要に応じて調整してください）
    const generationConfig = {
        maxOutputTokens: 800, // 返答の最大トークン数
    };

    // --- Geminiにプロンプトを送信して返答を取得 ---
    const result = await model.generateContent(prompt, generationConfig);
    const response = await result.response;
    const text = response.text();

    // --- Discordに返信 ---
    // もしGeminiの返答が空だった場合のフォールバック
    if (!text) {
        await message.reply("ごめんね、うまく言葉が出てこなかったよ。");
    } else {
        // 2000文字を超える場合は分割して送信するなどの処理が必要ですが、
        // 今回はシンプルにするためそのまま送信します (maxOutputTokensで制限済み)
        await message.reply(text);
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    await message.reply("エラーが発生しちゃった。APIキーの設定や、プロンプトの内容を確認してみてね。");
  } finally {
    // リアクションを消す
    message.reactions.cache.get('🤔').users.remove(client.user.id);
  }
});


// Botにログイン
client.login(DISCORD_TOKEN);
