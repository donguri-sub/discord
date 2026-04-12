const { Client, GatewayIntentBits, Partials, ActivityType, REST, Routes, SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');

const { GoogleGenerativeAI } = require('@google/generative-ai');

const http = require('http');

const axios = require('axios');



// --- 1. Render用ダミーサーバー ---

http.createServer((req, res) => {

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

  res.write("Bot Status: Online");

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



// システムプロンプト

const SYSTEM_INSTRUCTION = "あなたは「ぷくたいくん」です。IQ1のおバカなキャラで、語尾は「ぷくー」です。たい焼きが大好きです。";



const TEXT_MODEL_LIST = ["gemini-2.5-flash", "gemini-3-flash", "gemini-1.5-flash"];

const IMAGE_MODEL_LIST = ["imagen-4-generate", "imagen-4-ultra-generate", "imagen-4-fast-generate"];



const commands = [

  new SlashCommandBuilder().setName('setsumei').setDescription('画像説明ぷく！').addAttachmentOption(opt => opt.setName('image').setDescription('画像').setRequired(true)),

  new SlashCommandBuilder().setName('make').setDescription('絵を描くぷく！').addStringOption(opt => opt.setName('prompt').setDescription('なに描く？').setRequired(true)),

].map(c => c.toJSON());



// ヘルパー：画像URLをBufferにする

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



  // --- /setsumei (画像説明) ---

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



  // --- /make (画像生成: Imagen 4 対応版) ---

  if (commandName === 'make') {

    const userPrompt = interaction.options.getString('prompt');

    for (const modelName of IMAGE_MODEL_LIST) {

      try {

        const model = genAI.getGenerativeModel({ model: modelName });

        // Imagen 4では generationConfig 内の不必要なフィールドを削除

        const result = await model.generateContent(userPrompt);

        const response = result.response;

        

        // Responseから画像を抽出

        const imgData = response.images?.[0] || response.generatedImages?.[0];

        if (!imgData) continue;



        const raw = imgData.base64 || imgData.url;

        const buffer = raw.startsWith('http') ? await downloadImage(raw) : Buffer.from(raw, 'base64');

        const file = new AttachmentBuilder(buffer, { name: 'puku_art.png' });



        return await interaction.editReply({ content: `「${userPrompt}」描いたぷくー！`, files: [file] });

      } catch (e) { console.error(modelName, e.message); }

    }

    await interaction.editReply("絵の具がなくなったぷく...");

  }

});



client.login(DISCORD_TOKEN);
