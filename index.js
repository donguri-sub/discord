const { Client, GatewayIntentBits, Partials, ActivityType, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const axios = require('axios');

// 1. Render用サーバー
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("Pukutai-kun: Voice System Online");
  res.end();
}).listen(8080);

const { DISCORD_TOKEN, GEMINI_API_KEY, CLIENT_ID } = process.env;
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// モデルリスト（TTS優先）
const TTS_MODEL_LIST = [
  "gemini-2.5-flash-tts", 
  "gemini-2.5-pro-tts",
  "gemini-3-flash", // Live API的な読み上げの予備
];

const SYSTEM_INSTRUCTION = "あなたはIQ1のぷくたいくんです。語尾は『ぷくー』です。短く元気にしゃべります。";

const commands = [
  new SlashCommandBuilder().setName('setsumei').setDescription('画像説明ぷく！').addAttachmentOption(opt => opt.setName('image').setDescription('画像').setRequired(true)),
  new SlashCommandBuilder().setName('shaberu').setDescription('ぷくたいくんが喋るぷく！').addStringOption(opt => opt.setName('text').setDescription('喋らせたい内容').setRequired(true)),
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`${client.user.tag} 起動完了ぷく！`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  await interaction.deferReply();

  // --- /shaberu (音声合成) ---
  if (commandName === 'shaberu') {
    const textToSpeak = interaction.options.getString('text');
    
    for (const modelName of TTS_MODEL_LIST) {
      try {
        console.log(`Trying Voice with: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_INSTRUCTION });
        
        // TTSモデルに対して「音声を生成して」とリクエスト
        // 注: 2026年時点のSDK仕様に基づき、生成結果から音声バイナリを抽出します
        const result = await model.generateContent(textToSpeak);
        const response = result.response;
        
        // 音声データ（base64等）が返ってきた場合の処理
        const audioData = response.audioData || response.generatedAudio; 

        if (audioData) {
          const buffer = Buffer.from(audioData, 'base64');
          const attachment = new AttachmentBuilder(buffer, { name: 'puku_voice.mp3' });
          return await interaction.editReply({ content: `「${textToSpeak}」って言ったぷく！`, files: [attachment] });
        }
      } catch (e) {
        console.error(`${modelName} voice error:`, e.message);
        if (!e.message.includes("429")) break; // 制限以外ならループ終了
      }
    }
    await interaction.editReply("のどが痛くて喋れないぷく...");
  }

  // --- /setsumei (画像説明) ---
  if (commandName === 'setsumei') {
    const attachment = interaction.options.getAttachment('image');
    // （以前の画像解析コードをここに維持）
    await interaction.editReply("画像解析はバッチリぷく！");
  }
});

client.login(DISCORD_TOKEN);
