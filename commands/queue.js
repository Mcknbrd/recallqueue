export async function execute(interaction, db, updateQueueEmbed) {
  const sub = interaction.options.getSubcommand();

  if (sub === "show") {
    const queue = await db.all("SELECT userId FROM queue ORDER BY joinedAt ASC");
    const text = queue.length
      ? queue.map((u, i) => `${i + 1}. <@${u.userId}>`).join("\n")
      : "_No one in queue._";
    await interaction.reply({ content: `**Current Queue:**\n${text}`, ephemeral: true });
  }

  if (sub === "clear") {
    await db.run("DELETE FROM queue;");
    await updateQueueEmbed(interaction.guild);
    await interaction.reply({ content: "Queue cleared ✅", ephemeral: true });
  }
}
