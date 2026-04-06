const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

// --- 1. Render用ダミーサーバー (Web Serviceを維持するため) ---
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("Bot Status: Online");
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

// --- 4. Gemini 2.5 Flash の初期化 ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// 起動時のログ
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('Gemini 2.5 Flash', { type: ActivityType.Custom });
});

// メッセージ受信イベント
client.on('messageCreate', async (message) => {
  // Bot自身の発言、またはメンションがない場合は無視
  if (message.author.bot || !message.mentions.has(client.user)) return;

  // メンション部分を削ってプロンプト（命令文）を取り出す
  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("何か話しかけてね！");

  // 「考え中」のリアクション
  await message.react('🤔');

  try {
    // Geminiにリクエスト送信
    // 最新仕様では generateContent(prompt) で待機するのが最も確実です
    const result = await model.generateContent(prompt);
    
    // レスポンスの取得 (result.response を直接操作)
    const response = result.response;
    const text = response.text();

    if (text) {
      await message.reply(text);
    } else {
      await message.reply("AIから返答が返ってきませんでした。");
    }

  } catch (error) {
    console.error("Gemini Execution Error:", error);
    
    // エラー詳細をDiscordに表示（デバッグ用）
    let errorMessage = "エラーが発生しました。";
    if (error.message.includes("403")) {
      errorMessage += "\n原因: APIキーが無効か、保存されていない可能性があります。";
    } else if (error.message.includes("location")) {
      errorMessage += "\n原因: Renderのサーバー場所(Region)が制限されています。SettingsからFrankfurt等に変更してください。";
    } else {
      errorMessage += `\n詳細: \`\`\`${error.message}\`\`\``;
    }
    
    await message.reply(errorMessage);
  } finally {
    // 最後にリアクションを消す
    const reaction = message.reactions.cache.get('🤔');
    if (reaction) reaction.users.remove(client.user.id).catch(() => null);
  }
});

// プログラム全体のクラッシュ防止
process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
});

// Discordにログイン
client.login(DISCORD_TOKEN);
