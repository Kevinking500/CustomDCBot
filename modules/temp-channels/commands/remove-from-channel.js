const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
const {
    userRemove,
    resolveOwnedTempChannel
} = require('../channel-settings');

module.exports.config = {
    name: 'Remove from Channel',
    type: 'USER',
    contextMenu: true,
    description: localize('temp-channels', 'remove-from-channel-context-description')
};

/*
 * Thin adapter for the temp-channels "remove user" flow. Everyone can invoke it, but it is
 * creator-only via resolveOwnedTempChannel (channel the menu was invoked in must be a temp
 * channel owned by the invoker, otherwise notInChannel). On success we hand off to the shared
 * userRemove core with the 'context' caller, which reads interaction.targetUser and produces
 * output identical to the /temp-channel remove-user subcommand and the remove-user flows.
 */
module.exports.run = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
    const vc = await resolveOwnedTempChannel(interaction, 'context');
    if (!vc) return interaction.editReply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
    return userRemove(interaction, 'context');
};