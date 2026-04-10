// deploy-commands.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// --- 自分のBotの情報に書き換えてください ---
const token = process.env.DISCORD_TOKEN; // Render環境変数から読み込む
const clientId = '1490301256537997362'; // PortalのGeneral Informationにある「Application ID」
const guildId = '1172554715641426000';   // Discordでサーバー名を右クリックして「IDをコピー」

// コマンドの定義
const commands = [
  // /explain コマンド (画像添付必須)
  new SlashCommandBuilder()
    .setName('explain')
    .setDescription('添付された画像についてぷくたいくんが説明するぷく！')
    .addAttachmentOption(option => 
      option.setName('image')
        .setDescription('説明してほしい画像をアップロードするぷく！')
        .setRequired(true)), // 必須にする

  // /generate コマンド (プロンプト必須)
  new SlashCommandBuilder()
    .setName('generate')
    .setDescription('ぷくたいくんが新しい画像を描くぷく！')
    .addStringOption(option => 
      option.setName('prompt')
        .setDescription('どんな画像を描くか教えてぷく！')
        .setRequired(true)), // 必須にする
]
  .map(command => command.toJSON());

// REST APIを使ってコマンドを登録
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    // サーバー固有のコマンドとして登録 (反映が速い)
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
