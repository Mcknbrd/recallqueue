import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("View match statistics for yourself or another member")
  .addUserOption(opt =>
    opt.setName("user").setDescription("User to check").setRequired(false)
  );

export async function execute(interaction, db) {
  const target = interaction.options.getUser("user") || interaction.user;
  const matches = await db.all("SELECT * FROM matches");

  const playerMatches = matches.filter(m =>
    JSON.parse(m.playerIds).includes(target.id)
  );

  if (playerMatches.length === 0) {
    return interaction.reply({
      content: `❌ No matches found for **${target.username}**.`,
      ephemeral: false,
    });
  }

  const total = playerMatches.length;
  const wins = playerMatches.filter(m => m.result === "win").length;
  const losses = playerMatches.filter(m => m.result === "loss").length;
  const globalWinrate = total ? ((wins / total) * 100).toFixed(1) : "0";

  const fives = playerMatches.filter(m => m.type === "5q");
  const trios = playerMatches.filter(m => m.type === "trio");

  const fiveWinrate = fives.length
    ? ((fives.filter(m => m.result === "win").length / fives.length) * 100).toFixed(1)
    : "0";
  const trioWinrate = trios.length
    ? ((trios.filter(m => m.result === "win").length / trios.length) * 100).toFixed(1)
    : "0";

  const embed = new EmbedBuilder()
    .setTitle(`${target.username}'s Match Stats`)
    .addFields(
      { name: "🌐 Global Games", value: `${total}`, inline: true },
      { name: "🏆 Global Winrate", value: `${globalWinrate}%`, inline: true },
      { name: "💥 5Q Games", value: `${fives.length}`, inline: true },
      { name: "💥 5Q Winrate", value: `${fiveWinrate}%`, inline: true },
      { name: "🎯 Trio Games", value: `${trios.length}`, inline: true },
      { name: "🎯 Trio Winrate", value: `${trioWinrate}%`, inline: true }
    )
    .setColor("Aqua")
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
