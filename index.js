// --- 3. モデルの優先順位リスト ---
// 制限が来たら上から順番に試していきます
const MODEL_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.0-flash", // 画像にある Gemini 2 Flash
  "gemini-3.0-flash", // 画像にある Gemini 3 Flash
  "gemini-1.5-flash"  
];

// --- 4. メッセージ受信イベント ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.mentions.has(client.user)) return;

  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!prompt) return message.reply("何か話しかけてね！");

  await message.react('🤔');

  let success = false;
  
  // モデルリストを順番にループして試す
  for (const modelName of MODEL_PRIORITY) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (text) {
        await message.reply(text);
        success = true;
        break; // 成功したらループを抜ける
      }
    } catch (error) {
      // 429エラー(制限)またはその他のエラーの場合、次のモデルへ
      console.error(`Model ${modelName} failed:`, error.message);
      
      if (error.message.includes("429")) {
        console.log(`Model ${modelName} is rate limited. Trying next model...`);
        continue; // 次のモデルを試す
      } else {
        // 制限以外の致命的なエラー（キーの間違い等）ならここでストップ
        await message.reply(`エラーが発生しました: ${error.message}`);
        break;
      }
    }
  }

  if (!success) {
    await message.reply("全てのモデルの利用制限に達したか、エラーにより返答できませんでした。少し時間を置いてみてね。");
  }

  // リアクションを消す
  const reaction = message.reactions.cache.get('🤔');
  if (reaction) reaction.users.remove(client.user.id).catch(() => null);
});
