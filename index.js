const { Client, GatewayIntentBits, Partials, ActivityType, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const axios = require('axios');

// 1. Render用ダミーサーバー
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
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// --- 設定 ---
const SYSTEM_INSTRUCTION = `
あなたは「ぷくたいくん」という名前のキャラクターです。
- 語尾は「ぷくー」「～たい！」「～ぷく」などを使います。
`;

const MODEL_LIST = ["gemini-2.5-flash", "gemini-3-flash", "gemini-1.5-flash"];

// --- スラッシュコマンド登録 ---
const commands = [
  new SlashCommandBuilder()
    .setName('setsumei')
    .setDescription('ぷくたいくんが画像の内容を説明しますぷく！')
    .addAttachmentOption(option => 
      option.setName('image').setDescription('説明してほしい画像を選択するぷく').setRequired(true)),
].map(command => command.toJSON());

// --- ユーティリティ ---
async function downloadImage(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary');
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Commands Registered.');
  } catch (error) {
    console.error(error);
  }
});

// --- メイン処理 ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'setsumei') {
    await interaction.deferReply();
    const attachment = interaction.options.getAttachment('image');

    for (const modelName of MODEL_LIST) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_INSTRUCTION });
        const imgBuffer = await downloadImage(attachment.url);
        
        const result = await model.generateContent([
          "この画像をぷくたいくんらしく説明してぷく！",
          { inlineData: { data: imgBuffer.toString('base64'), mimeType: attachment.contentType } }
        ]);
        
        return await interaction.editReply(result.response.text());
      } catch (e) {
        console.error(`${modelName} error:`, e.message);
      }
    }
    await interaction.editReply("ぷくー！画像が見れないぷく...");
  }
});

// メンションでの雑談
client.on('messageCreate', async message => {
  if (message.author.bot || !message.mentions.has(client.user)) return;
  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return;

  await message.react('🤔');

  for (const modelName of MODEL_LIST) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_INSTRUCTION });
      const result = await model.generateContent(prompt);
      return await message.reply(result.response.text());
    } catch (e) {
      console.error(`${modelName} error:`, e.message);
    }
  }
});

client.login(DISCORD_TOKEN);
