const { Client, GatewayIntentBits, Partials, ActivityType, REST, Routes, SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const axios = require('axios'); // 画像URLダウンロード用

// --- 1. Render用ダミーサーバー ---
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("Bot Status: Online (Multimodal & Generation Enabled)");
  res.end();
}).listen(8080);

// --- 2. 設定の読み込み ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID; // DiscordのClient IDが必要です

if (!DISCORD_TOKEN || !GEMINI_API_KEY || !CLIENT_ID) {
  console.error("Error: Missing Environment Variables (DISCORD_TOKEN, GEMINI_API_KEY, or CLIENT_ID)");
  process.exit(1);
}

// --- 3. 各種リストの設定 ---

// AIへの事前情報 (システムプロンプト)
const SYSTEM_INSTRUCTION = `
あなたは「ぷくたいくん」という名前のキャラクターです。
- IQ1のとてもおバカで可愛らしい性格です。
- 語尾は「ぷくー」「～たい！」「～ぷく」などを使います。
- 難しい言葉はわからず、ひらがなを多めに使います。
- たい焼きが大好きで、食べることばかり考えています。
- 画像を見せられたら、おバカなりに一生懸命説明します。
- 絵を描くときは、たい焼きの絵を描きがちです。
`;

// テキスト・画像解析用モデル（優先順）
const TEXT_MODEL_LIST = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemini-3.1-flash-lite",
];

// 画像生成用モデル（優先順）
const IMAGE_MODEL_LIST = [
  "imagen-4-generate",
  "imagen-4-ultra-generate",
  "imagen-4-fast-generate",
];

// --- 4. 初期化 ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// --- 5. スラッシュコマンドの定義 ---
const commands = [
  // /setsumei [画像 attachment]
  new SlashCommandBuilder()
    .setName('setsumei')
    .setDescription('ぷくたいくんが画像の内容を説明しますぷく！')
    .addAttachmentOption(option => 
      option.setName('image').setDescription('説明してほしい画像を選択するぷく').setRequired(true)),
  
  // /make [プロンプト string]
  new SlashCommandBuilder()
    .setName('make')
    .setDescription('ぷくたいくんが頑張って絵を描くぷく！')
    .addStringOption(option => 
      option.setName('prompt').setDescription('どんな絵を描くか教えてぷく').setRequired(true)),
]
  .map(command => command.toJSON());

// --- 6. 汎用ユーティリティ関数 ---

// エラーが再試行可能か判別する
function isRetryableError(error) {
  const msg = error.message;
  return msg.includes("429") || msg.includes("500") || msg.includes("503") || msg.includes("404");
}

// 画像URLをBufferに変換する
async function downloadImage(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary');
}

// Base64またはURLからDiscord用Attachmentを作成する
async function createAttachment(imageData, modelName) {
  try {
    // URLの場合 (httpからはじまる)
    if (typeof imageData === 'string' && imageData.startsWith('http')) {
      const buffer = await downloadImage(imageData);
      return new AttachmentBuilder(buffer, { name: `generated_${modelName}.png` });
    }
    // Base64の場合 (すでにBufferに変換されている前提、または文字列)
    else {
      const buffer = Buffer.from(imageData, 'base64');
      return new AttachmentBuilder(buffer, { name: `generated_${modelName}.png` });
    }
  } catch (e) {
    console.error("Attachment Creation Error:", e);
    return null;
  }
}

// --- 7. イベントハンドラ ---

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('たい焼きお絵かきぷく', { type: ActivityType.Playing });

  // 起動時にコマンドをDiscordに登録する
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

// コマンド実行時の処理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // --- /setsumei (画像解析) の処理 ---
  if (commandName === 'setsumei') {
    await interaction.deferReply(); // 処理が長いので待機させる

    const attachment = interaction.options.getAttachment('image');
    if (!attachment.contentType.startsWith('image/')) {
      return interaction.editReply("ぷくー！それは画像じゃないぷく！");
    }

    let success = false;

    // テキスト・画像解析モデルでフォールバック
    for (const modelName of TEXT_MODEL_LIST) {
      try {
        console.log(`Trying /setsumei with: ${modelName}`);
        
        // システムプロンプト付きでモデル初期化
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: SYSTEM_INSTRUCTION 
        });

        // 画像データをダウンロード
        const imageBuffer = await downloadImage(attachment.url);
        
        const prompt = "この画像について、ぷくたいくんらしく説明してぷく。";

        // マルチモーダルリクエスト
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType: attachment.contentType
            }
          }
        ]);
        const text = result.response.text();

        if (text) {
          await interaction.editReply(text);
          success = true;
          break;
        }
      } catch (error) {
        console.error(`Error with ${modelName} in /setsumei:`, error.message);
        if (!isRetryableError(error)) {
          await interaction.editReply(`ぷくー！重大なエラーだぷく...: ${error.message}`);
          success = true; 
          break;
        }
      }
    }

    if (!success) {
      await interaction.editReply("みんなおなかいっぱいで画像が見れないぷく...。");
    }
  }

  // --- /make (画像生成) の処理 ---
  else if (commandName === 'make') {
    await interaction.deferReply(); // 画像生成は時間がかかるので必須

    const userPrompt = interaction.options.getString('prompt');
    const finalPrompt = `ぷくたいくんが描いた絵: ${userPrompt} (たい焼き要素を少し入れてください)`;
    
    let success = false;

    // 画像生成モデルでフォールバック
    for (const modelName of IMAGE_MODEL_LIST) {
      try {
        console.log(`Trying /make with: ${modelName}`);
        
        // Imagen 4系の初期化
        const model = genAI.getGenerativeModel({ model: modelName });

        // 画像生成リクエスト (Imagen 4の標準的な書き方)
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
          generationConfig: {
            // 生成数やアスペクト比などの設定（Imagen 4のデフォルトを想定）
            numberOfImages: 1,
            aspectRatio: "1:1",
          },
        });

        const response = result.response;
        
        // Imagen 4のレスポンス形式に対応（Base64またはURL）
        // SDKのバージョンにより、response.images[0] または response.generatedImages[0] に入ります
        let generatedImageData;
        if (response.images && response.images.length > 0) {
          generatedImageData = response.images[0];
        } else if (response.generatedImages && response.generatedImages.length > 0) {
          generatedImageData = response.generatedImages[0];
        }

        if (generatedImageData) {
          // imageData.base64 または imageData.url を自動判別
          const rawData = generatedImageData.base64 || generatedImageData.url || generatedImageData;

          const discordAttachment = await createAttachment(rawData, modelName);

          if (discordAttachment) {
            const embed = new EmbedBuilder()
              .setTitle(`「${userPrompt}」を描いたぷく！`)
              .setDescription(`${modelName} が頑張ったぷく。たい焼きおいしいぷく。`)
              .setImage(`attachment://${discordAttachment.name}`)
              .setColor(0xFFA500); // オレンジ色

            await interaction.editReply({ embeds: [embed], files: [discordAttachment] });
            success = true;
            break;
          }
        }
      } catch (error) {
        console.error(`Error with ${modelName} in /make:`, error.message);
        
        // 404 (モデル未対応) なども含めて再試行
        if (!isRetryableError(error)) {
          await interaction.editReply(`ぷくー！絵が描けないぷく...: ${error.message}`);
          success = true; 
          break;
        }
      }
    }

    if (!success) {
      await interaction.editReply("みんな絵の具がなくなっちゃったぷく...。");
    }
  }
});

// プログラム全体のクラッシュ防止
process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
});

// Discordにログイン
client.login(DISCORD_TOKEN);
