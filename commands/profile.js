import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View your or another member's MLBB profile")
  .addUserOption(opt =>
    opt.setName("user").setDescription("The user to view").setRequired(false)
  );

export async function execute(interaction, db) {
  const target = interaction.options.getUser("user") || interaction.user;
  const player = await db.get("SELECT * FROM players WHERE userId = ?", [target.id]);

  if (!player) {
    return interaction.reply({
      content: `❌ No MLBB profile found for **${target.username}**.`,
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`${target.username}'s MLBB Profile`)
    .addFields(
      { name: "🆔 Player ID", value: player.mlbbId || "Unknown", inline: true },
      { name: "🏷️ Nickname", value: player.mlbbNickname || "Unknown", inline: true }
    )
    .setColor("Aqua")
    .setThumbnail(target.displayAvatarURL())
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
