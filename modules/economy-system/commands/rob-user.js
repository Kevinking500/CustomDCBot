const {localize} = require('../../../src/functions/localize');
const {robUser} = require('./economy-system');

module.exports.config = {
    name: 'Rob User',
    type: 'USER',
    contextMenu: true,
    description: localize('economy-system', 'rob-context-description')
};

// /economy rob adapter: hands the target user to the shared robUser core (no amount, no modal).
module.exports.run = async function (interaction) {
    interaction.str = interaction.client.configurations['economy-system']['strings'];
    interaction.config = interaction.client.configurations['economy-system']['config'];
    return robUser(interaction, interaction.targetUser);
};
