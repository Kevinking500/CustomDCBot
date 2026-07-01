const {localize} = require('../../../src/functions/localize');
const {MessageFlags} = require('discord.js');
const {
    isSupervisor,
    buildPromoteSelect
} = require('../context-actions');

module.exports.config = {
    name: 'Promote User',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['MANAGE_GUILD'],
    description: localize('staff-management-system', 'promote-user-context-description')
};

/*
 * Thin adapter for the /staff-management promote subcommand. MANAGE_GUILD is only a coarse Discord
 * gate; the real gate is the module's runtime SUPERVISOR check, enforced here before the select is
 * shown (and again inside promoteUser). The slash flow picks the new rank as a ROLE option, so we
 * reply ephemerally with a role select whose customId encodes the target user id; the select
 * submit in events/interactionCreate.js runs the shared promoteUser core with the chosen role.
 */
module.exports.run = async function (interaction) {
    if (!isSupervisor(interaction.client, interaction.member)) return interaction.reply({
        content: localize('staff-management-system', 'err-gen-no-perm'),
        flags: MessageFlags.Ephemeral
    });
    return interaction.reply(buildPromoteSelect(interaction.targetUser.id));
};