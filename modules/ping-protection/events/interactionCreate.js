const { Modal, TextInputComponent, MessageActionRow } = require('discord.js'); 
const { deleteAllUserData, generateHistoryResponse, generateActionsResponse } = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');
// Interaction handler
module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    
    if (interaction.isButton() && interaction.customId.startsWith('ping-protection_')) {
        
        // Ping history pagination
        if (interaction.customId.startsWith('ping-protection_hist-page_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3]);

            const replyOptions = await generateHistoryResponse(client, userId, targetPage);
            await interaction.update(replyOptions);
            return; 
        }

        if (interaction.customId.startsWith('ping-protection_mod-page_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3]);
            
            const replyOptions = await generateActionsResponse(client, userId, targetPage);
            await interaction.update(replyOptions);
            return;
        }

        // Panel buttons
        const [prefix, action, userId] = interaction.customId.split('_');
        
        const isAdmin = interaction.member.permissions.has('ADMINISTRATOR') || 
                        (client.config.admins || []).includes(interaction.user.id);

        if (['history', 'actions', 'delete'].includes(action)) {
             if (!isAdmin) return interaction.reply({ 
                content: localize('ping-protection', 'no-permission'), 
                ephemeral: true });
        }

        if (action === 'history') {
            const replyOptions = await generateHistoryResponse(client, userId, 1);
            replyOptions.ephemeral = false;
            await interaction.reply(replyOptions);
        }

        else if (action === 'actions') {
            const replyOptions = await generateActionsResponse(client, userId, 1);
            replyOptions.ephemeral = false;
            await interaction.reply(replyOptions);
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

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ping-protection_confirm-delete_')) {
        const userId = interaction.customId.split('_')[2];
        const userInput = interaction.fields.getTextInputValue('confirmation_text');
        const requiredPhrase = localize('ping-protection', 'modal-phrase', { locale: interaction.locale }); 

        if (userInput === requiredPhrase) {
            await deleteAllUserData(client, userId);
            await interaction.reply({ 
                content: `✅ ${localize('ping-protection', 'log-manual-delete', {u: userId})}`, 
                ephemeral: true });
        } else {
            await interaction.reply({ 
                content: `❌ ${localize('ping-protection', 'modal-failed')}`, 
                ephemeral: true });
        }
    }
};