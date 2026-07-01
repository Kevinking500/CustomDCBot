const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const {run: runKiss} = require('./kiss');

module.exports.config = {
    name: 'Kiss',
    type: 'USER',
    contextMenu: true,
    description: localize('fun', 'kiss-context-description')
};

/*
 * Thin adapter: the /kiss run() reads its recipient from interaction.options.getUser('user').
 * We delegate to that exact run() with a proxy whose options.getUser returns the context-menu
 * targetUser, so the rendered kiss (message + gif) is identical to the slash command, including
 * the self-target guard the original enforces.
 */
module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const proxy = Object.create(interaction);
    proxy.options = {getUser: () => interaction.targetUser};
    return runKiss(proxy);
};
