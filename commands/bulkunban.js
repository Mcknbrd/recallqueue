// commands/bulkunban.js
// Safe paginated unban tool: preview ban list, page through, unban current page with confirmation.
// Usage: /bulkunban
// Requires Ban Members permission or configured admin role.

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("bulkunban")
  .setDescription("ADMIN: Review server bans and unban users page-by-page (safe).")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function execute(client, interaction, db, updateQueueEmbed, config) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const member = interaction.member;
  const adminRoleId = config.adminRoleId || null;

  const hasPerms =
    member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    (adminRoleId && member.roles.cache.has(adminRoleId));

  if (!hasPerms)
    return interaction.editReply("❌ You don’t have permission to use this command.");

  let bans;
  try {
    bans = await guild.bans.fetch();
  } catch (err) {
    console.error("Failed to fetch bans:", err);
    return interaction.editReply("❌ Could not fetch the ban list. Make sure I have permission to view bans.");
  }

  if (!bans.size)
    return interaction.editReply("✅ There are no banned users on this server.");

  const banList = Array.from(bans.values()).map(b => ({
    id: b.user.id,
    tag: `${b.user.username}#${b.user.discriminator}`,
    reason: b.reason || "No reason provided",
  }));

  const pages = chunkArray(banList, 10);
  let pageIndex = 0;

  const buildEmbed = (page) => {
    const list = pages[page] || [];
    return new EmbedBuilder()
      .setTitle(`🔒 Server Ban List — Page ${page + 1}/${pages.length}`)
      .setDescription(
        list
          .map(
            (u, i) =>
              `**${i + 1 + page * 10}.** ${u.tag} — ${u.id}\n> Reason: ${u.reason}`
          )
          .join("\n\n") || "_No bans on this page._"
      )
      .setColor("DarkBlue")
      .setFooter({ text: `Total bans: ${banList.length}` })
      .setTimestamp();
  };

  const makeRows = (confirmMode = false) => {
    const nav = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("bu_prev")
        .setLabel("⬅️ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0),
      new ButtonBuilder()
        .setCustomId("bu_next")
        .setLabel("Next ➡️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex >= pages.length - 1)
    );

    const actions = new ActionRowBuilder();

    if (confirmMode) {
      actions.addComponents(
        new ButtonBuilder()
          .setCustomId("bu_confirm_unban")
          .setLabel("✅ Confirm Unban Page")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("bu_confirm_cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      );
    } else {
      actions.addComponents(
        new ButtonBuilder()
          .setCustomId("bu_unban_page")
          .setLabel("Unban Page")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("bu_cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      );
    }

    return [nav, actions];
  };

  const message = await interaction.editReply({
    embeds: [buildEmbed(pageIndex)],
    components: makeRows(),
  });

  const filter = (i) =>
    i.user.id === interaction.user.id &&
    [
      "bu_prev",
      "bu_next",
      "bu_unban_page",
      "bu_cancel",
      "bu_confirm_unban",
      "bu_confirm_cancel",
    ].includes(i.customId);

  const collector = message.createMessageComponentCollector({
    filter,
    time: 5 * 60_000,
  });

  collector.on("collect", async (btn) => {
    try {
      // Previous page
      if (btn.customId === "bu_prev") {
        await btn.deferUpdate();
        pageIndex = Math.max(0, pageIndex - 1);
        await message.edit({ embeds: [buildEmbed(pageIndex)], components: makeRows() });
        return;
      }

      // Next page
      if (btn.customId === "bu_next") {
        await btn.deferUpdate();
        pageIndex = Math.min(pages.length - 1, pageIndex + 1);
        await message.edit({ embeds: [buildEmbed(pageIndex)], components: makeRows() });
        return;
      }

      // Cancel
      if (btn.customId === "bu_cancel") {
        await btn.deferUpdate();
        await message.edit({
          content: "❌ Operation cancelled.",
          embeds: [],
          components: [],
        });
        collector.stop("cancelled");
        return;
      }

      // Enter confirm mode
      if (btn.customId === "bu_unban_page") {
        await btn.deferUpdate();
        const count = pages[pageIndex].length;
        await message.edit({
          content: `⚠️ You are about to unban **${count}** users from this page.\nThis action cannot be undone.\nClick **Confirm Unban Page** to proceed.`,
          embeds: [buildEmbed(pageIndex)],
          components: makeRows(true),
        });
        return;
      }

      // Cancel confirm
      if (btn.customId === "bu_confirm_cancel") {
        await btn.deferUpdate();
        await message.edit({
          content: "",
          embeds: [buildEmbed(pageIndex)],
          components: makeRows(false),
        });
        return;
      }

      // Confirm unban
      if (btn.customId === "bu_confirm_unban") {
        await btn.deferReply({ ephemeral: true });

        const toUnban = pages[pageIndex] || [];
        if (!toUnban.length)
          return btn.editReply("⚠️ No users to unban on this page.");

        const delayMs = Number(config.unbanDelayMs || 1500);
        const logChan =
          guild.channels.cache.get(config.modLogChannelId) ||
          guild.channels.cache.get(config.matchHistoryChannelId);

        const results = [];

        for (const u of toUnban) {
          try {
            await guild.bans.remove(u.id, `Bulk unban by ${interaction.user.tag}`);
            results.push(`✅ ${u.tag}`);
            if (logChan && logChan.isTextBased()) {
              const e = new EmbedBuilder()
                .setTitle("🟢 Bulk Unban Logged")
                .addFields(
                  { name: "Target", value: `${u.tag} — ${u.id}` },
                  {
                    name: "Executor",
                    value: `${interaction.user.tag} (${interaction.user.id})`,
                  }
                )
                .setColor("Green")
                .setTimestamp();
              logChan.send({ embeds: [e] }).catch(() => {});
            }
          } catch (err) {
            console.error("Failed to unban", u.id, err);
            results.push(`❌ ${u.tag} — ${err.message || "Error"}`);
          }
          await new Promise((res) => setTimeout(res, delayMs));
        }

        await btn.editReply({
          content: `✅ Unban complete for this page:\n${results.join("\n")}`,
          ephemeral: true,
        });

        // Refresh embed
        const refreshed = await guild.bans.fetch().catch(() => null);
        const refreshedList = refreshed
          ? Array.from(refreshed.values()).map((b) => ({
              id: b.user.id,
              tag: `${b.user.username}#${b.user.discriminator}`,
              reason: b.reason || "No reason provided",
            }))
          : [];
        const newPages = chunkArray(refreshedList, 10);
        const newIndex = Math.min(pageIndex, newPages.length - 1);

        if (!newPages.length) {
          await message.edit({
            content: "✅ All bans cleared.",
            embeds: [],
            components: [],
          });
          collector.stop("done");
          return;
        }

        await message.edit({
          content: "",
          embeds: [buildEmbed(newIndex)],
          components: makeRows(),
        });
        pageIndex = newIndex;
        return;
      }
    } catch (err) {
      console.error("bulkunban interaction error:", err);
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time") {
      try {
        await message.edit({
          content: "⌛ Operation timed out. Re-run `/bulkunban` to continue.",
          embeds: [],
          components: [],
        });
      } catch {}
    }
  });
}
