const { Client, GatewayIntentBits, Partials, ActivityType, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const axios = require('axios');

// --- 1. Render用ダミーサーバー ---
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("Bot Status: Online (TTS Enabled)");
  res.end();
}).listen(8080);

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

const SYSTEM_INSTRUCTION = "あなたは「ぷくたいくん」です。IQ1のおバカなキャラで、語尾は「ぷくー」です。たい焼きが大好きです。";

// テキスト・画像解析用
const TEXT_MODEL_LIST = ["gemini-2.5-flash", "gemini-3-flash", "gemini-1.5-flash"];
// 音声生成用（TTS優先）
const TTS_MODEL_LIST = ["gemini-2.5-flash-tts", "gemini-3-flash"];

const commands = [
  new SlashCommandBuilder().setName('setsumei').setDescription('画像説明ぷく！').addAttachmentOption(opt => opt.setName('image').setDescription('画像').setRequired(true)),
  new SlashCommandBuilder().setName('shaberu').setDescription('ぷくたいくんがおしゃべりするぷく！').addStringOption(opt => opt.setName('text').setDescription('しゃべってほしい内容').setRequired(true)),
].map(c => c.toJSON());

async function downloadImage(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data, 'binary');
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Commands Registered.');
  } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  await interaction.deferReply();

  // --- /setsumei (画像説明) はそのまま維持 ---
  if (commandName === 'setsumei') {
    const attachment = interaction.options.getAttachment('image');
    for (const modelName of TEXT_MODEL_LIST) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_INSTRUCTION });
        const imgBuffer = await downloadImage(attachment.url);
        const result = await model.generateContent(["この画像をおバカに説明してぷく", { inlineData: { data: imgBuffer.toString('base64'), mimeType: attachment.contentType } }]);
        return await interaction.editReply(result.response.text());
      } catch (e) { console.error(modelName, e.message); }
    }
    await interaction.editReply("エラーだぷく...");
  }

  // --- /shaberu (音声生成) ---
  if (commandName === 'shaberu') {
    const userText = interaction.options.getString('text');
    
    for (const modelName of TTS_MODEL_LIST) {
      try {
        console.log(`Trying TTS with: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_INSTRUCTION });

        // 音声出力を要求するリクエスト
        const result = await model.generateContent([
          { text: `${userText} と、ぷくたいくんらしく喋ってぷく！` }
        ]);

        const response = result.response;
        // APIから返された音声データを取得
        const audioData = response.audioData || response.executableResponses?.[0]?.audio;

        if (audioData) {
          const audioBuffer = Buffer.from(audioData, 'base64');
          const attachment = new AttachmentBuilder(audioBuffer, { name: 'puku_voice.mp3' });
          
          return await interaction.editReply({ 
            content: `「${userText}」って喋ったぷく！再生してみてぷくー！`, 
            files: [attachment] 
          });
        }
      } catch (e) {
        console.error(`${modelName} TTS Error:`, e.message);
        // 429等の場合は次のモデル（Gemini 3 Flash等）へ
      }
    }
    await interaction.editReply("のどが痛くて喋れないぷく...");
  }
});

client.login(DISCORD_TOKEN);
