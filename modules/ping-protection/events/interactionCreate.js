const { Modal, TextInputComponent, MessageActionRow, MessageButton } = require('discord.js'); 
const { fetchPingHistory, fetchModHistory, deleteAllUserData, getLeaverStatus } = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');
const { formatDate, embedType } = require('../../../src/functions/helpers');

// Interactions handler
module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    
    if (interaction.isButton() && interaction.customId.startsWith('ping-protection_')) {
        
        if (interaction.customId.startsWith('ping-protection_hist-page_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3]);
            const limit = 8;

            const { total, history } = await fetchPingHistory(client, userId, targetPage, limit);
            const totalPages = Math.ceil(total / limit) || 1;
            
            const user = await client.users.fetch(userId).catch(() => ({ username: 'Unknown User', displayAvatarURL: () => null }));

            let description = "";
            const leaverData = await getLeaverStatus(client, userId);
            if (leaverData) {
                description += `⚠️ ${localize('ping-protection', 'embed-leaver-warning', { t: formatDate(leaverData.leftAt) })}\n\n`;
            }

            if (history.length === 0) {
                description += localize('ping-protection', 'no-data-found');
            } else {
                const lines = history.map((entry, index) => {
                    const ts = Math.floor(new Date(entry.createdAt).getTime() / 1000);
                    let targetString = "Unknown";
                    if (entry.targetId) {
                        targetString = entry.isRole ? `<@&${entry.targetId}>` : `<@${entry.targetId}>`; 
                    } else {
                        targetString = "Detected";
                    }
                    return `${(targetPage - 1) * limit + index + 1}. **Pinged ${targetString}** at <t:${ts}:f> (<t:${ts}:R>)\n[Jump to Message](${entry.messageUrl})`;
                });
                description += lines.join('\n\n');
            }

            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`ping-protection_hist-page_${userId}_${targetPage - 1}`).setLabel('Back').setStyle('PRIMARY').setDisabled(targetPage <= 1),
                new MessageButton().setCustomId('ping_protection_page_count').setLabel(`${targetPage}/${totalPages}`).setStyle('SECONDARY').setDisabled(true),
                new MessageButton().setCustomId(`ping-protection_hist-page_${userId}_${targetPage + 1}`).setLabel('Next').setStyle('PRIMARY').setDisabled(targetPage >= totalPages)
            );

            const replyOptions = embedType({
                title: localize('ping-protection', 'embed-history-title', { u: user.username }),
                thumbnail: user.displayAvatarURL({ dynamic: true }),
                description: description,
                color: 'ORANGE'
            });

            replyOptions.components = [row];
            await interaction.update(replyOptions);
            return; 
        }

        // Handles panel buttons
        const [prefix, action, userId] = interaction.customId.split('_');
        const isAdmin = interaction.member.permissions.has('ADMINISTRATOR') || 
                        (client.config.admins || []).includes(interaction.user.id);

        if (!isAdmin) {
            return interaction.reply({ content: localize('ping-protection', 'no-permission'), ephemeral: true });
        }
        // Handles history button
        if (action === 'history') {
            const page = 1;
            const limit = 15;
            const { total, history } = await fetchPingHistory(client, userId, page, limit);
            const totalPages = Math.ceil(total / limit) || 1;
            const leaverData = await getLeaverStatus(client, userId);
            const user = client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => ({ username: userId, displayAvatarURL: () => null }));

            let description = "";
            if (leaverData) {
                description += `⚠️ ${localize('ping-protection', 'embed-leaver-warning', { t: formatDate(leaverData.leftAt) })}\n\n`;
            }

            if (history.length === 0) {
                description += localize('ping-protection', 'no-data-found');
            } else {
                const lines = history.map((entry, index) => {
                    const ts = Math.floor(new Date(entry.createdAt).getTime() / 1000);
                    let targetString = "Unknown";
                    if (entry.targetId) {
                        targetString = entry.isRole ? `<@&${entry.targetId}>` : `<@${entry.targetId}>`; 
                    } else {
                        targetString = "Detected"; 
                    }
                    return `${(page - 1) * limit + index + 1}. **Pinged ${targetString}** at <t:${ts}:f> (<t:${ts}:R>)\n[Jump to Message](${entry.messageUrl})`;
                });
                description += lines.join('\n\n');
            }

            const row = new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`ping-protection_hist-page_${userId}_${page - 1}`).setLabel('Back').setStyle('PRIMARY').setDisabled(true),
                new MessageButton().setCustomId('ping_protection_page_count').setLabel(`${page}/${totalPages}`).setStyle('SECONDARY').setDisabled(true),
                new MessageButton().setCustomId(`ping-protection_hist-page_${userId}_${page + 1}`).setLabel('Next').setStyle('PRIMARY').setDisabled(totalPages <= 1)
            );

            const replyOptions = embedType({
                title: localize('ping-protection', 'embed-history-title', { u: user.username }),
                thumbnail: user.displayAvatarURL({ dynamic: true }),
                description: description,
                color: 'ORANGE'
            });

            replyOptions.components = [row];
            replyOptions.ephemeral = false;
            await interaction.reply(replyOptions);
        }
        // Handled actions history button
        else if (action === 'actions') {
            const history = await fetchModHistory(client, userId, 15);
            const user = client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => ({ username: userId, displayAvatarURL: () => null }));
            
            let description = "";
            if (history.length === 0) {
                description = localize('ping-protection', 'no-data-found');
            } else {
                const lines = history.map((entry, index) => {
                    const duration = entry.actionDuration ? ` (${entry.actionDuration}m)` : '';
                    const reasonText = entry.reason || localize('ping-protection', 'no-reason') || 'No reason';
                    return `${index + 1}. **${entry.type}${duration}** - ${formatDate(entry.createdAt)}\n${localize('ping-protection', 'label-reason')}: ${reasonText}`;
                });
                description = lines.join('\n\n') + `\n\n*${localize('ping-protection', 'actions-retention-note')}*`;
            }

            const replyOptions = embedType({
                title: localize('ping-protection', 'embed-actions-title', { u: user.username }),
                thumbnail: user.displayAvatarURL({ dynamic: true }),
                description: description,
                color: 'RED'
            });

            replyOptions.ephemeral = false;
            await interaction.reply(replyOptions);
        }
        // Handles delete data button & confirmation
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

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ping-protection_confirm-delete_')) {
        const userId = interaction.customId.split('_')[2];
        const userInput = interaction.fields.getTextInputValue('confirmation_text');
        const requiredPhrase = localize('ping-protection', 'modal-phrase', { locale: interaction.locale }); 

        if (userInput === requiredPhrase) {
            await deleteAllUserData(client, userId);
            await interaction.reply({ content: `✅ ${localize('ping-protection', 'log-manual-delete', {u: userId})}`, ephemeral: true });
        } else {
            await interaction.reply({ content: `❌ ${localize('ping-protection', 'modal-failed')}`, ephemeral: true });
        }
    }
};