const { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder, AttachmentBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const fetch = require('node-fetch'); // node-fetchをインストールしてください (npm install node-fetch)
const fs = require('fs');
const path = require('path');

// 1. Render用ダミーサーバー (Web Serviceを維持)
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("ぷくたいくん Bot: Online (Image Generation & Analysis Enabled)");
  res.end();
}).listen(8080);

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// --- AIへの事前情報 (システムプロンプト) ---
const SYSTEM_INSTRUCTION = `
あなたは「ぷくたいくん」という名前のキャラクターです。
以下の設定を守って会話してください：
- IQ1のとてもおバカで可愛らしい性格です。
- 語尾は「ぷくー」「～たい！」「～ぷく」などを使います。
- 難しい言葉はわからず、ひらがなを多めに使います。
- たい焼きが大好きで、食べることばかり考えています。
`;

// --- モデルリスト ---
const TEXT_IMAGE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemini-3.1-flash-lite",
];

const IMAGE_GEN_MODELS = [
  "imagen-4-fast-generate", // 速度優先
  "imagen-4-generate",      // 標準
  "imagen-4-ultra-generate" // 高品質
];

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// スラッシュコマンドの定義
const commands = [
  new SlashCommandBuilder()
    .setName('setsumei')
    .setDescription('ぷくたいくんが画像について説明するぷく！')
    .addAttachmentOption(option => 
      option.setName('image').setDescription('説明してほしい画像だぷく！').setRequired(true)),
  new SlashCommandBuilder()
    .setName('make')
    .setDescription('ぷくたいくんが頑張って絵を描くぷく！')
    .addStringOption(option => 
      option.setName('prompt').setDescription('どんな絵を描いてほしいか教えてね！').setRequired(true)),
]
  .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// 起動時にコマンドを登録
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('ぷくぷくたい焼き', { type: ActivityType.Playing });

  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

// コマンド実行時のイベント
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // --- /setsumei コマンド (画像解析) ---
  if (commandName === 'setsumei') {
    await interaction.deferReply(); // 返答を保留 (時間がかかるため)
    const attachment = interaction.options.getAttachment('image');
    if (!attachment.contentType.startsWith('image/')) {
      return interaction.editReply('ぷくー！これは画像じゃないぷく！画像をちょうだいぷく！');
    }

    let success = false;
    for (const modelName of TEXT_IMAGE_MODELS) {
      try {
        console.log(`Trying analysis model: ${modelName}`);
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: SYSTEM_INSTRUCTION 
        });

        // 画像データを取得
        const response = await fetch(attachment.url);
        const buffer = await response.buffer();
        const imagePart = {
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: attachment.contentType
          },
        };

        const prompt = "この画像に何が写っているか、ぷくたいくんとして説明してね。";
        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text();

        if (text) {
          const embed = new EmbedBuilder()
            .setTitle('ぷくたいくんの画像説明ぷく！')
            .setDescription(text)
            .setImage(attachment.url)
            .setColor('#F08080'); // たい焼き色
          await interaction.editReply({ embeds: [embed] });
          success = true;
          break;
        }
      } catch (error) {
        console.error(`Error with ${modelName}:`, error.message);
        if (!error.message.includes("429") && !error.message.includes("500") && !error.message.includes("503") && !error.message.includes("404")) {
          await interaction.editReply(`重大なエラーが発生しました: ${error.message}`);
          success = true;
          break;
        }
      }
    }
    if (!success) await interaction.editReply("ごめんぷく...みんなおなかいっぱいで説明できないぷく。");

  // --- /make コマンド (画像生成) ---
  } else if (commandName === 'make') {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    
    // 画像生成用のシステムプロンプト (高品質な画像を生成させるための指示)
    const finalPrompt = `A high-quality, cute drawing based on the user's request: ${prompt}. (The user requested in Japanese: ${prompt}). (Make it cute and vibrant, like a sticker.)`;

    let success = false;
    for (const modelName of IMAGE_GEN_MODELS) {
      try {
        console.log(`Trying generation model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const result = await model.generateContent(finalPrompt);
        const response = result.response;
        const text = response.text();

        // Imagenのレスポンス形式に合わせてデータを抽出 (SDKのバージョンによって異なる可能性があります)
        // ここでは、生成された画像のURLまたはBase64データが返ってくると仮定
        // (実際のSDKの仕様に合わせて調整が必要です)
        if (text && text.startsWith('data:image')) {
            // Base64データの場合
            const base64Data = text.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const attachment = new AttachmentBuilder(buffer, { name: 'pukutai-art.png' });
            await interaction.editReply({ content: `ぷくー！頑張って描いたぷく！ 「${prompt}」だぷく！`, files: [attachment] });
            success = true;
            break;
        } else if (text && text.startsWith('http')) {
            // URLの場合
            const embed = new EmbedBuilder()
                .setTitle(`ぷくたいくんが描いた「${prompt}」だぷく！`)
                .setImage(text)
                .setColor('#87CEEB'); // 空色
            await interaction.editReply({ embeds: [embed] });
            success = true;
            break;
        } else {
            console.log("No image data found in response.");
        }

      } catch (error) {
        console.error(`Error with ${modelName}:`, error.message);
        // Imagenのエラーハンドリング (429/500/503/404なら次へ)
        if (!error.message.includes("429") && !error.message.includes("500") && !error.message.includes("503") && !error.message.includes("404")) {
          await interaction.editReply(`重大なエラーが発生しました: ${error.message}`);
          success = true;
          break;
        }
      }
    }
    if (!success) await interaction.editReply("ごめんぷく...みんなおなかいっぱいで絵を描けないぷく。");
  }
});

// 通常のメッセージ（メンション）への反応（テキスト生成・フォールバック付き）
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.mentions.has(client.user)) return;
  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("何か話しかけてね！");
  await message.react('🤔');

  let success = false;
  for (const modelName of TEXT_IMAGE_MODELS) {
    try {
      console.log(`Trying text model: ${modelName}`);
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
      if (!error.message.includes("429") && !error.message.includes("500") && !error.message.includes("503") && !error.message.includes("404")) {
        await message.reply(`重大なエラーが発生しました: ${error.message}`);
        success = true;
        break;
      }
    }
  }
  if (!success) await message.reply("ごめんぷく...みんなおなかいっぱいで動けないぷく。");
  const reaction = message.reactions.cache.get('🤔');
  if (reaction) reaction.users.remove(client.user.id).catch(() => null);
});

client.login(DISCORD_TOKEN);
