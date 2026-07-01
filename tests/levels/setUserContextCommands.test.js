/*
 * USER context-menu admin adapters for levels: "Set User XP" and "Set User Level". Each is a thin
 * adapter that mirrors the /manage-levels edit-xp|edit-level set subcommand: it enforces the same
 * allowCheats gate, then opens a modal collecting the value (the modal customId encodes the
 * target user). The shared runXPAction/runLevelAction cores are exercised by the submit-handler
 * test, not here. Description localize keys are stubbed, so nothing depends on them resolving.
 */
const setXP = require('../../modules/levels/commands/set-user-xp');
const setLevel = require('../../modules/levels/commands/set-user-level');

function makeInteraction(allowCheats = true, targetId = 't1') {
    return {
        targetUser: {id: targetId},
        client: {configurations: {levels: {config: {allowCheats}}}},
        showModal: jest.fn().mockResolvedValue(),
        reply: jest.fn().mockResolvedValue()
    };
}

describe('config shapes', () => {
    test.each([
        ['Set User XP', setXP, 'set-user-xp:'],
        ['Set User Level', setLevel, 'set-user-level:']
    ])('%s is a USER context command requiring ADMINISTRATOR', (name, command) => {
        expect(command.config.name).toBe(name);
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toEqual(['ADMINISTRATOR']);
    });
});

describe.each([
    ['Set User XP', setXP, 'set-user-xp'],
    ['Set User Level', setLevel, 'set-user-level']
])('%s adapter', (name, command, prefix) => {
    test('shows a modal whose customId encodes the target user when cheats are enabled', async () => {
        const interaction = makeInteraction(true, 'abc');
        await command.run(interaction);
        expect(interaction.showModal).toHaveBeenCalledTimes(1);
        const json = interaction.showModal.mock.calls[0][0].toJSON();
        expect(json.custom_id).toBe(`${prefix}:abc`);
    });

    test('refuses (no modal) and replies ephemerally when allowCheats is off', async () => {
        const interaction = makeInteraction(false);
        await command.run(interaction);
        expect(interaction.showModal).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });
});
