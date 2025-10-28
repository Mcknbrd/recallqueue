import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("Shows a player's recent match history.")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Select whose history to view (defaults to yourself).")
  );

export async function execute(interaction, db, updateQueueEmbed, config) {
  await interaction.deferReply({ ephemeral: false });

  try {
    const target = interaction.options.getUser("user") || interaction.user;
    const userId = target.id;
    const logChannel = interaction.guild.channels.cache.get(config.matchHistoryChannelId);

    if (!logChannel)
      return interaction.editReply("⚠️ Couldn't find the match-history channel in this server.");

    // Pull latest 20 matches
    const matches = await db.all(
      `SELECT id, type, result, finishedAt, logMessageId, playerIds
       FROM matches
       ORDER BY finishedAt DESC
       LIMIT 50`
    );

    const recent = [];
    for (const m of matches) {
      const players = JSON.parse(m.playerIds || "[]");
      if (!players.includes(userId)) continue;

      // 🔍 Verify the log message still exists
      let logMsg = null;
      if (m.logMessageId) {
        logMsg = await logChannel.messages.fetch(m.logMessageId).catch(() => null);
      }

      if (!logMsg) {
        // 🧹 Clean stale DB row
        await db.run("DELETE FROM matches WHERE id = ?", [m.id]);
        continue;
      }

      const emoji =
        m.result === "win" ? "✅" :
        m.result === "loss" ? "❌" :
        "⚪";

      const time = new Date(m.finishedAt).toLocaleString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const line = `${emoji} ${m.type.toUpperCase()} — ${time} → [View Match](https://discord.com/channels/${interaction.guild.id}/${config.matchHistoryChannelId}/${m.logMessageId})`;
      recent.push(line);
    }

    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Recent Matches`)
      .setColor("Blue")
      .setDescription(
        recent.length
          ? recent.join("\n")
          : "_No valid match logs found._"
      )
      .setFooter({ text: "Automatically synced with #match-history" });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("/history error:", err);
    await interaction.editReply("❌ Error retrieving match history.");
  }
}
