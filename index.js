const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const axios = require('axios');

// --- 1. Render用ダミーサーバー ---
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("Bot Status: Online (Chat & Image Analysis)");
  res.end();
}).listen(8080);

const { DISCORD_TOKEN, GEMINI_API_KEY, CLIENT_ID } = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // メンションの内容を読むために必須
  ],
  partials: [Partials.Channel],
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// システムプロンプト
const SYSTEM_INSTRUCTION = "あなたは「ぷくたいくん」です。IQ1のおバカなキャラで、語尾は「ぷくー」「～たい！」「～ぷく」です。たい焼きが大好きです。";

// 使用するモデル候補
const MODEL_LIST = ["gemini-2.5-flash", "gemini-3-flash", "gemini-1.5-flash"];

// スラッシュコマンド登録（/setsumeiのみ）
const commands = [
  new SlashCommandBuilder()
    .setName('setsumei')
    .setDescription('ぷくたいくんが画像の内容を説明するぷく！')
    .addAttachmentOption(opt => opt.setName('image').setDescription('画像').setRequired(true)),
].map(c => c.toJSON());

// 画像ダウンロード用ヘルパー
async function downloadImage(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data, 'binary');
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  try {
    // スラッシュコマンドの更新
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Commands Registered.');
  } catch (e) { console.error('Command Register Error:', e); }
});

// --- 2. メンションでの会話処理 ---
client.on('messageCreate', async (message) => {
  // ボット自身やメンションがない場合は無視
  if (message.author.bot || !message.mentions.has(client.user)) return;

  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("ぷくー？（なにかいってほしいぷく！）");

  await message.react('🤔');

  for (const modelName of MODEL_LIST) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_INSTRUCTION });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text) {
        return await message.reply(text);
      }
    } catch (e) {
      console.error(`${modelName} chat error:`, e.message);
    }
  }
  await message.reply("あたまがぷしゅーってなったぷく...");
});

// --- 3. /setsumei コマンドの処理 ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setsumei') {
    await interaction.deferReply();
    const attachment = interaction.options.getAttachment('image');

    if (!attachment.contentType?.startsWith('image/')) {
      return interaction.editReply("ぷくー！それは画像じゃないぷく！");
    }

    for (const modelName of MODEL_LIST) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_INSTRUCTION });
        const imgBuffer = await downloadImage(attachment.url);
        
        const result = await model.generateContent([
          "この画像をおバカに説明してぷく！",
          {
            inlineData: {
              data: imgBuffer.toString('base64'),
              mimeType: attachment.contentType
            }
          }
        ]);

        return await interaction.editReply(result.response.text());
      } catch (e) {
        console.error(`${modelName} vision error:`, e.message);
      }
    }
    await interaction.editReply("おめめがいたくて見えないぷく...");
  }
});

client.login(DISCORD_TOKEN);
