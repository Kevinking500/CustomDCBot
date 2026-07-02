const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const {run: runHug} = require('./hug');

module.exports.config = {
    name: 'Hug',
    type: 'USER',
    contextMenu: true,
    description: localize('fun', 'hug-context-description')
};

/*
 * Thin adapter: the /hug run() reads its recipient from interaction.options.getUser('user').
 * We delegate to that exact run() with a proxy whose options.getUser returns the context-menu
 * targetUser, so the rendered hug (message + gif) is identical to the slash command, including
 * the self-target guard the original enforces.
 */
module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const proxy = Object.create(interaction);
    proxy.options = {getUser: () => interaction.targetUser};
    return runHug(proxy);
};
