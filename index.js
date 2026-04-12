// --- 起動ログ (Renderのログに必ず出るはず) ---
console.log(">>> [SYSTEM] Starting Pukutai-kun Process...");

const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const axios = require('axios');

// 1. Render用ダミーサーバー (これがないとデプロイに失敗します)
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Pukutai-kun is Online");
}).listen(8080);

// 2. 環境変数
const { DISCORD_TOKEN, GEMINI_API_KEY, CLIENT_ID } = process.env;

// 3. Botクライアント初期化 (Intentsは全て指定)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // メンションの中身を読み取る
  ],
  partials: [Partials.Channel],
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

const SYSTEM_INSTRUCTION = "あなたはIQ1のぷくたいくんです。語尾は『ぷくー』です。ひらがなで短く喋ります。";

// 4. スラッシュコマンド定義
const commands = [
  new SlashCommandBuilder()
    .setName('setsumei')
    .setDescription('画像をおバカに説明するぷく！')
    .addAttachmentOption(opt => opt.setName('image').setDescription('画像を選択').setRequired(true)),
].map(c => c.toJSON());

// 5. ログイン時：コマンドをDiscordに強制登録
client.once('ready', async () => {
  console.log(`>>> [SUCCESS] Logged in as: ${client.user.tag}`);
  try {
    console.log('>>> [INFO] Registering Commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('>>> [SUCCESS] Commands Registered.');
  } catch (error) {
    console.error('>>> [ERROR] Failed to register commands:', error);
  }
});

// 6. メンション雑談の処理
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return; // 自分や他のBotは無視
  if (!msg.mentions.has(client.user)) return; // メンションがなければ無視

  console.log(`>>> [LOG] Mention from ${msg.author.tag}: ${msg.content}`);

  try {
    await msg.channel.sendTyping(); // 入力中...を表示
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: SYSTEM_INSTRUCTION });
    const prompt = msg.content.replace(`<@${client.user.id}>`, '').trim() || "こんにちは";
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    await msg.reply(responseText || "ぷくー？（なにか言ったぷく？）");
  } catch (error) {
    console.error('>>> [ERROR] Chat failed:', error.message);
    await msg.reply("ぷしゅー...（あたまが痛いぷく）");
  }
});

// 7. スラッシュコマンド（画像説明）の処理
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  console.log(`>>> [LOG] Command received: /${interaction.commandName}`);

  if (interaction.commandName === 'setsumei') {
    try {
      await interaction.deferReply(); // 「考えている」状態にする

      const attachment = interaction.options.getAttachment('image');
      if (!attachment.contentType?.startsWith('image/')) {
        return await interaction.editReply("それは画像じゃないぷく！");
      }

      // 画像をダウンロード
      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      const imgBuffer = Buffer.from(response.data);

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: SYSTEM_INSTRUCTION });
      
      const result = await model.generateContent([
        "この画像についてぷくたいくんらしく説明してぷく！",
        {
          inlineData: {
            data: imgBuffer.toString('base64'),
            mimeType: attachment.contentType
          }
        }
      ]);

      await interaction.editReply(result.response.text());
    } catch (error) {
      console.error('>>> [ERROR] Vision failed:', error.message);
      if (!interaction.replied) await interaction.editReply("おめめが痛くて見えないぷく...");
    }
  }
});

// 8. 異常終了のトラップ
process.on('unhandledRejection', error => {
  console.error('>>> [CRITICAL ERROR] Unhandled Promise Rejection:', error);
});

client.login(DISCORD_TOKEN).catch(e => console.error(">>> [LOGIN ERROR]", e));
