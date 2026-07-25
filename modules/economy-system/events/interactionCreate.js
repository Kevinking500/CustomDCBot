const {buyShopItem} = require('../economy-system');
const {localize} = require('../../../src/functions/localize');

// Maps the eco-ctx modal action to the shared core, so context commands and slash subcommands share logic.
const ECO_CTX_ACTIONS = {
    add: 'addMoney',
    remove: 'removeMoney',
    set: 'setMoney'
};

module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    if (!interaction.guild || interaction.guild.id !== client.config.guildID) return;

    /*
     * Modal submit from the Add/Remove/Set Balance context commands (customId eco-ctx:<action>:<userId>).
     * Runs before the select-menu early return so it is not swallowed; re-checks the admin guard and
     * validates the amount, then calls the shared core so the result matches the /economy subcommand.
     */
    if (typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit() && interaction.customId.startsWith('eco-ctx:')) {
        const parts = interaction.customId.split(':');
        const action = parts[1];
        const targetUserId = parts[2];
        const coreName = ECO_CTX_ACTIONS[action];
        if (!coreName) return;

        interaction.str = client.configurations['economy-system']['strings'];
        interaction.config = client.configurations['economy-system']['config'];

        const targetUser = client.users.cache.get(targetUserId) || await client.users.fetch(targetUserId).catch(() => null);
        if (!targetUser) return interaction.reply({
            content: '⚠️ ' + localize('economy-system', 'context-user-not-found'),
            ephemeral: !interaction.config['publicCommandReplies']
        });

        const command = require('../commands/economy-system');
        if (!await command.adminGuard(interaction, targetUser)) return;

        const raw = interaction.fields.getTextInputValue('amount').trim();
        const amount = Number(raw);
        if (!Number.isInteger(amount) || amount <= 0) return interaction.reply({
            content: '⚠️ ' + localize('economy-system', 'context-invalid-amount'),
            ephemeral: !interaction.config['publicCommandReplies']
        });

        await interaction.deferReply({ephemeral: !interaction.config['publicCommandReplies']});
        return command[coreName](interaction, targetUser, amount);
    }

    if (!interaction.isSelectMenu()) return;
    if (interaction.customId !== 'economy-system_shop-select') return;
    await interaction.deferReply({ephemeral: true});
    console.log(interaction.values);
    buyShopItem(interaction, interaction.values[0], null);
};
