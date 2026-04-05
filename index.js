const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

// --- 1. Render用のWebサーバー (URLアクセス用) ---
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("Bot is running!");
  res.end();
}).listen(8080);

// --- 2. 設定の読み込み ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- 3. Discord Botの初期化 ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// --- 4. Geminiの初期化 (エラー対策) ---
let model;
try {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  // モデル名を最新の正確な名称に
  model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  console.log("Gemini model initialized.");
} catch (e) {
  console.error("Gemini Init Error:", e);
}

// 起動確認
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('Gemini 2.5 Flash', { type: ActivityType.Playing });
});

// メッセージ反応
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.mentions.has(client.user)) return;

  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("何か話しかけてね！");

  await message.react('🤔');

  try {
    // 最新のSDKに合わせた生成リクエスト
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    await message.reply(text || "返答が空でした。");
  } catch (error) {
    console.error("Gemini Error:", error);
    await message.reply(`エラーが発生しました：${error.message}`);
  } finally {
    const reaction = message.reactions.cache.get('🤔');
    if (reaction) reaction.users.remove(client.user.id).catch(() => null);
  }
});

// エラーで落ちないように監視
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(DISCORD_TOKEN).catch(err => {
  console.error("Discord Login Error:", err);
});
