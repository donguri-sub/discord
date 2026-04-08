const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

// 1. Render用ダミーサーバー
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("Bot Status: Online (with Auto-Fallback)");
  res.end();
}).listen(8080);

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// --- 優先して使いたいモデルのリスト ---
const MODEL_LIST = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2-flash",
  "gemini-2-flash-lite",
  "gemini-3-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro", 
  "gemini-2.5-flash-lite",
];

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.mentions.has(client.user)) return;

  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("何か話しかけてね！");

  await message.react('🤔');

  let success = false;

  // モデルリストを順番に試すループ
  for (const modelName of MODEL_LIST) {
    try {
      console.log(`Trying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (text) {
        await message.reply(text);
        success = true;
        break; // 成功したらループを抜ける
      }
    } catch (error) {
      console.error(`Error with ${modelName}:`, error.message);
      
      // 制限(429)やサーバーエラー(500)以外の場合は、
      // 次を試しても無駄な可能性が高いのでエラーを出して終了
      if (!error.message.includes("429") && !error.message.includes("500") && !error.message.includes("503")) {
        await message.reply(`重大なエラーが発生しました: ${error.message}`);
        success = true; // ループを止めるためにtrue扱い
        break;
      }
      // 429エラー等の場合は次のモデルへ（コンソールに記録）
      console.log(`${modelName} is busy. Trying next model...`);
    }
  }

  if (!success) {
    await message.reply("ごめん！全てのモデルが制限中みたい。少し時間を空けてみてね。");
  }

  // リアクション削除
  const reaction = message.reactions.cache.get('🤔');
  if (reaction) reaction.users.remove(client.user.id).catch(() => null);
});

client.login(DISCORD_TOKEN);
