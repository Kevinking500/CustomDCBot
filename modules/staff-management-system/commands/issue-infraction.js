const {localize} = require('../../../src/functions/localize');
const {MessageFlags} = require('discord.js');
const {
    isSupervisor,
    buildInfractionModal
} = require('../context-actions');

module.exports.config = {
    name: 'Issue Infraction',
    type: 'USER',
    contextMenu: true,
    defaultMemberPermissions: ['MANAGE_GUILD'],
    description: localize('staff-management-system', 'issue-infraction-context-description')
};

/*
 * Thin adapter for the /staff-management infraction issue subcommand. MANAGE_GUILD is only a
 * coarse Discord gate; the real gate is the module's runtime SUPERVISOR check, enforced here
 * before a modal is shown (and again inside issueInfraction). The modal collects the same fields
 * the slash flow does (type / reason / optional expiry); its customId encodes the target user id
 * so the submit handler in events/interactionCreate.js can run the shared issueInfraction core.
 * showModal must be the first response, so we must NOT defer.
 */
module.exports.run = async function (interaction) {
    if (!isSupervisor(interaction.client, interaction.member)) return interaction.reply({
        content: localize('staff-management-system', 'err-gen-no-perm'),
        flags: MessageFlags.Ephemeral
    });
    const modal = buildInfractionModal(interaction.client, interaction.targetUser.id);
    if (!modal) return interaction.reply({
        content: localize('staff-management-system', 'ctx-infract-no-types'),
        flags: MessageFlags.Ephemeral
    });
    return interaction.showModal(modal);
};