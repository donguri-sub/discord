// --- モデルの優先順位リスト ---
// 制限がかかった場合、上から順番に試していきます
const MODEL_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2-flash",
  "gemini-3-flash",
  "gemini-1.5-flash"
];

// --- メッセージ受信イベント内の処理 ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.mentions.has(client.user)) return;

  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("なにか話しかけてね！");

  await message.react('🤔');

  let success = false;
  
  // 利用可能なモデルを順番に試すループ
  for (const modelName of MODEL_PRIORITY) {
    try {
      console.log(`Trying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (text) {
        await message.reply(text);
        success = true;
        break; // 成功したらループを抜ける
      }
    } catch (error) {
      // 429エラー（レートリミット）の場合のみ次を試す
      if (error.message.includes("429") || error.message.includes("Too Many Requests")) {
        console.warn(`${modelName} is rate limited. Trying next model...`);
        continue; 
      } else {
        // それ以外の致命的なエラー（キー間違い等）は即座に終了
        console.error(`Fatal error with ${modelName}:`, error);
        await message.reply(`エラーが発生しました: ${error.message}`);
        success = true; // ループを止めるため
        break;
      }
    }
  }

  if (!success) {
    await message.reply("ごめんね、全てのモデルで制限がかかっちゃったみたい。少し時間を置いてから送ってみて！");
  }

  // リアクションを消す
  const reaction = message.reactions.cache.get('🤔');
  if (reaction) reaction.users.remove(client.user.id).catch(() => null);
});
