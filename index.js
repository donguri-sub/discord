const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

// Webサーバー (Render等の生存確認用)
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end("Bot is running!");
}).listen(8080);

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // これがPortal側でONである必要があります
  ],
  partials: [Partials.Channel],
});

let model;
try {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  // モデル名を実在するものに修正
  model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
  console.log("Gemini model initialized.");
} catch (e) {
  console.error("Gemini Init Error:", e);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  // ボット自身の発言、またはメンションがない場合は無視
  if (message.author.bot || !message.mentions.has(client.user)) return;

  // メンション部分を削除してテキストだけを取り出す
  const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!prompt) return message.reply("何か話しかけてね！");

  await message.react('🤔');

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text(); // テキストを取得

    if (!text) {
      await message.reply("返答を生成できませんでした。");
    } else {
      // Discordの2000文字制限に配慮
      await message.reply(text.substring(0, 2000));
    }
  } catch (error) {
    console.error("Gemini Error:", error);
    await message.reply(`エラーが起きたよ：${error.message}`);
  } finally {
    // リアクションを消す
    const reaction = message.reactions.cache.get('🤔');
    if (reaction) reaction.users.remove(client.user.id).catch(() => null);
  }
});

client.login(DISCORD_TOKEN);
