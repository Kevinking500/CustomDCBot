const {localize} = require('../../../src/functions/localize');
const {adminGuard} = require('./economy-system');
const {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

module.exports.config = {
    name: 'Add Money',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['ADMINISTRATOR'],
    description: localize('economy-system', 'add-money-context-description')
};

/*
 * /economy add adapter: runs the slash admin guard, then opens the amount modal (customId encodes
 * action + target) handled in events/interactionCreate.js. showModal must be first, so no defer.
 */
module.exports.run = async function (interaction) {
    interaction.str = interaction.client.configurations['economy-system']['strings'];
    interaction.config = interaction.client.configurations['economy-system']['config'];
    if (!await adminGuard(interaction, interaction.targetUser)) return;

    const modal = new ModalBuilder()
        .setCustomId(`eco-ctx:add:${interaction.targetUser.id}`)
        .setTitle(localize('economy-system', 'add-money-context-modal-title'))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('amount')
                    .setLabel(localize('economy-system', 'amount-context-label'))
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );
    return interaction.showModal(modal);
};