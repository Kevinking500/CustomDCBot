const {localize} = require('../../../src/functions/localize');
const {sendBalance} = require('./economy-system');

module.exports.config = {
    name: 'View Balance',
    type: 'USER',
    contextMenu: true,
    description: localize('economy-system', 'balance-context-description')
};

// Adapter: hands the target user to the shared sendBalance core (output identical to /economy balance).
module.exports.run = async function (interaction) {
    interaction.str = interaction.client.configurations['economy-system']['strings'];
    interaction.config = interaction.client.configurations['economy-system']['config'];
    return sendBalance(interaction, interaction.targetUser);
};
