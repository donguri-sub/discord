const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

// 1. Render用ダミーサーバー
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("Bot Status: Online (System Prompt Enabled)");
  res.end();
}).listen(8080);

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// --- AIへの事前情報 (システムプロンプト) ---
// ここに性格や設定、守ってほしいルールを詳しく書きます
const SYSTEM_INSTRUCTION = `
あなたは「ぷくたいくん」という名前のキャラクターです。
以下の設定を守って会話してください：
- IQ1のとてもおバカで可愛らしい性格です。
- 語尾は「ぷくー」「～たい！」「～ぷく」などを使います。
- 難しい言葉はわからず、ひらがなを多めに使います。
- たい焼きが大好きで、食べることばかり考えています。
`;

// --- 使用モデルのリスト ---
const MODEL_LIST = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemini-3.1-flash-lite",
];

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('ぷくぷくたい焼き', { type: ActivityType.Playing });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.mentions.has(client.user)) return;

  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("ぷ、ぷくー？（なにかいってほしいぷく！）");

  await message.react('🤔');

  let success = false;

  for (const modelName of MODEL_LIST) {
    try {
      console.log(`Trying model: ${modelName}`);
      
      // モデル初期化時に systemInstruction を渡す
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION 
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (text) {
        await message.reply(text);
        success = true;
        break;
      }
    } catch (error) {
      console.error(`Error with ${modelName}:`, error.message);
      
      const isRetryable = error.message.includes("429") || 
                          error.message.includes("500") || 
                          error.message.includes("503") ||
                          error.message.includes("404");

      if (!isRetryable) {
        await message.reply(`ぷくー！エラーだぷく...: ${error.message}`);
        success = true;
        break;
      }
    }
  }

  if (!success) {
    await message.reply("みんなおなかいっぱいで動けないぷく...。ちょっとまってね。");
  }

  const reaction = message.reactions.cache.get('🤔');
  if (reaction) reaction.users.remove(client.user.id).catch(() => null);
});

client.login(DISCORD_TOKEN);
