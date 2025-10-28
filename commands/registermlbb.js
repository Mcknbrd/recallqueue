import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("registermlbb")
  .setDescription("Register or update your Mobile Legends player ID")
  .addStringOption(opt =>
    opt.setName("id").setDescription("Your MLBB Player ID").setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName("nickname").setDescription("Your in-game nickname").setRequired(true)
  );

export async function execute(interaction, db) {
  const id = interaction.options.getString("id");
  const nickname = interaction.options.getString("nickname");
  const userId = interaction.user.id;

  await db.run(
    `INSERT INTO players (userId, mlbbId, mlbbNickname)
     VALUES (?, ?, ?)
     ON CONFLICT(userId)
     DO UPDATE SET mlbbId = excluded.mlbbId, mlbbNickname = excluded.mlbbNickname`,
    [userId, id, nickname]
  );

  await interaction.reply({
    content: `✅ Your MLBB profile has been saved!\n**Nickname:** ${nickname}\n**Player ID:** ${id}`,
    ephemeral: true,
  });
}