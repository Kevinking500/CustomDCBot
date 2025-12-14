const { Modal, TextInputComponent, MessageActionRow, MessageEmbed } = require('discord.js'); 
const { fetchPingHistory, fetchModHistory, deleteAllUserData, getLeaverStatus } = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');
const { formatDate } = require('../../../src/functions/helpers');

module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    
    // Handles embed buttons
    if (interaction.isButton() && interaction.customId.startsWith('ping-protection_')) {
        const [prefix, action, userId] = interaction.customId.split('_');

        const isAdmin = interaction.member.permissions.has('ADMINISTRATOR') || 
                        (client.config.admins || []).includes(interaction.user.id);

        if (!isAdmin) {
            return interaction.reply({ content: localize('ping-protection', 'no-permission'), ephemeral: true });
        }

       if (action === 'history') {
            const history = await fetchPingHistory(client, userId, 10);
            const leaverData = await getLeaverStatus(client, userId);
            const user = interaction.client.users.cache.get(userId) || { username: userId, displayAvatarURL: () => null }; // Fallback user object

            const embed = new MessageEmbed()
                .setTitle(localize('ping-protection', 'embed-history-title', { u: user.username }))
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setColor('ORANGE');

            let description = "";

            if (leaverData) {
                description += `⚠️ ${localize('ping-protection', 'embed-leaver-warning', { 
                    t: formatDate(leaverData.leftAt) 
                })}\n\n`;
            }

            if (history.length === 0) {
                description += localize('ping-protection', 'no-data-found');
            } else {
                const lines = history.map((entry, index) => {
                    return `${index + 1}. **[${formatDate(entry.timestamp)}]** [Jump to Message](${entry.messageUrl})`;
                });
                description += lines.join('\n');
            }

            embed.setDescription(description);

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (action === 'actions') {
            const history = await fetchModHistory(client, userId, 10);
            const user = interaction.client.users.cache.get(userId) || { username: userId, displayAvatarURL: () => null }; // Fallback user object
            
            const embed = new MessageEmbed()
                .setTitle(localize('ping-protection', 'embed-actions-title', { u: user.username }))
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setColor('RED');

            if (history.length === 0) {
                embed.setDescription(localize('ping-protection', 'no-data-found'));
            } else {
                const lines = history.map((entry, index) => {
                    const duration = entry.actionDuration ? ` (${Math.round(entry.actionDuration / 60000)}m)` : '';
                    return `${index + 1}. **${entry.actionType}${duration}** - ${formatDate(entry.timestamp)}\n${localize('ping-protection', 'label-reason')}: ${entry.reason}`;
                });
                embed.setDescription(lines.join('\n\n') + `\n\n*${localize('ping-protection', 'actions-retention-note')}*`);
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (action === 'delete') {
            const modal = new Modal()
                .setCustomId(`ping-protection_confirm-delete_${userId}`)
                .setTitle(localize('ping-protection', 'modal-title'));

            const input = new TextInputComponent()
                .setCustomId('confirmation_text')
                .setLabel(localize('ping-protection', 'modal-label')) 
                .setStyle('PARAGRAPH')
                .setPlaceholder(localize('ping-protection', 'modal-phrase'))
                .setRequired(true);

            const row = new MessageActionRow().addComponents(input);
            modal.addComponents(row);

            await interaction.showModal(modal);
        }
    }

    // Handles modal submission
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ping-protection_confirm-delete_')) {
        const userId = interaction.customId.split('_')[2];
        const userInput = interaction.fields.getTextInputValue('confirmation_text');

        const requiredPhrase = localize('ping-protection', 'modal-phrase', { locale: interaction.locale }); // IMPORTANT: Use user's locale

        if (userInput === requiredPhrase) {
            await deleteAllUserData(client, userId);
            await interaction.reply({ 
                content: `✅ ${localize('ping-protection', 'log-manual-delete', {u: userId})}`, 
                ephemeral: true 
            });
        } else {
            await interaction.reply({ 
                content: `❌ ${localize('ping-protection', 'modal-failed')}`, 
                ephemeral: true 
            });
        }
    }
};