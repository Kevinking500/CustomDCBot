const {localize} = require('../../../src/functions/localize');
const {MessageFlags} = require('discord.js');
const {handleProfileView} = require('./staff-management');

module.exports.config = {
    name: 'View Staff Profile',
    type: 'USER',
    contextMenu: true,
    description: localize('staff-management-system', 'view-staff-profile-description')
};

/*
 * Thin adapter: defer ephemerally (handleProfileView responds via editReply) and hand off to
 * the shared handleProfileView core, exactly like the /staff-management profile view subcommand,
 * so the rendered staff profile is identical for the targeted user.
 */
module.exports.run = async function (interaction) {
    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });
    return handleProfileView(interaction.client, interaction, interaction.targetUser);
};
