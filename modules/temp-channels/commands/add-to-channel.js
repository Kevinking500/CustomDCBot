const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
const {
    userAdd,
    resolveOwnedTempChannel
} = require('../channel-settings');

module.exports.config = {
    name: 'Add to Channel',
    type: 'USER',
    contextMenu: true,
    description: localize('temp-channels', 'add-to-channel-context-description')
};

/*
 * Thin adapter for the temp-channels "add user" flow. Everyone can invoke it, but it is
 * creator-only: resolveOwnedTempChannel matches the channel the menu was invoked in against the
 * invoker as creatorID, so a non-creator (or a non-temp channel) gets the notInChannel reply and
 * we never touch the channel. On success we hand off to the shared userAdd core with the
 * 'context' caller, which reads interaction.targetUser and produces output identical to the
 * /temp-channel add-user subcommand and the add-user button/select flows.
 */
module.exports.run = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
    const vc = await resolveOwnedTempChannel(interaction, 'context');
    if (!vc) return interaction.editReply(embedType(interaction.client.configurations['temp-channels']['config']['notInChannel'], {}, {ephemeral: true}));
    return userAdd(interaction, 'context');
};