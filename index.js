const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

// 1. Render用Webサーバー (これがないとデプロイ失敗します)
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write("Bot is online");
  res.end();
}).listen(8080);

// 2. 環境変数の取得
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DISCORD_TOKEN || !GEMINI_API_KEY) {
  console.error("環境変数が設定されていません。RenderのDashboardを確認してください。");
  process.exit(1);
}

// 3. Gemini API 初期化 (最新モデル gemini-2.5-flash を指定)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// 4. Discord Bot 初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('Gemini 2.5 | メンションで会話', { type: ActivityType.Custom });
});

// 5. メッセージイベント
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("なにか話しかけてね！");

  await message.react('🤔');

  try {
    // 最新のSDKに合わせた呼び出し方
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    // 2000文字制限対策
    if (text.length > 2000) {
      await message.reply(text.substring(0, 1900) + "...\n(長文のため省略しました)");
    } else {
      await message.reply(text);
    }

  } catch (error) {
    // ログに詳細なエラーを出力（RenderのLogsで確認可能になります）
    console.error("--- Gemini API Error Detailed ---");
    console.error(error.message);
    
    await message.reply("エラーが発生しました。時間を置いて試すか、APIキーの設定を確認してください。");
  } finally {
    const reaction = message.reactions.cache.get('🤔');
    if (reaction) reaction.users.remove(client.user.id).catch(() => null);
  }
});

client.login(DISCORD_TOKEN);
