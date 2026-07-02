/*
 * Modal-submit branches in levels/events/interactionCreate.js for the "Set User XP" and
 * "Set User Level" context commands. They re-enforce the allowCheats gate, validate the numeric
 * value, resolve the target member, and call the shared runXPAction/runLevelAction cores with a
 * constant ()=>value transform (set semantics). messageCreate and manage-levels are mocked so
 * these tests cover only the submit wiring.
 */
jest.mock('../../modules/levels/events/messageCreate', () => ({
    calculateLevelXP: jest.fn(),
    displayLevel: jest.fn(),
    isMaxLevel: jest.fn()
}));
jest.mock('../../modules/levels/commands/manage-levels', () => ({
    runXPAction: jest.fn().mockResolvedValue('xp'),
    runLevelAction: jest.fn().mockResolvedValue('level')
}));

const {
    runXPAction,
    runLevelAction
} = require('../../modules/levels/commands/manage-levels');
const handler = require('../../modules/levels/events/interactionCreate');

function makeInteraction({
                             customId,
                             value = '42',
                             allowCheats = true,
                             member = {user: {id: 'm1'}}
                         } = {}) {
    return {
        client: {
            botReadyAt: Date.now(),
            configurations: {levels: {config: {allowCheats}}}
        },
        customId,
        isModalSubmit: () => true,
        isButton: () => false,
        fields: {getTextInputValue: jest.fn().mockReturnValue(value)},
        guild: {members: {fetch: jest.fn().mockResolvedValue(member)}},
        reply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    runXPAction.mockClear();
    runLevelAction.mockClear();
});

describe('Set User XP / Level modal submit', () => {
    test('calls runXPAction with a set transform and resolved member', async () => {
        const member = {user: {id: 'm7'}};
        const interaction = makeInteraction({
            customId: 'set-user-xp:m7',
            value: '250',
            member
        });
        const client = {configurations: {levels: {config: {allowCheats: true}}}};
        await handler.run(client, interaction);
        expect(interaction.guild.members.fetch).toHaveBeenCalledWith('m7');
        expect(runXPAction).toHaveBeenCalledTimes(1);
        const [passedInteraction, transform, passedMember] = runXPAction.mock.calls[0];
        expect(passedInteraction).toBe(interaction);
        expect(transform()).toBe(250);
        expect(passedMember).toBe(member);
        expect(runLevelAction).not.toHaveBeenCalled();
    });

    test('calls runLevelAction with a set transform for the level customId', async () => {
        const member = {user: {id: 'm8'}};
        const interaction = makeInteraction({
            customId: 'set-user-level:m8',
            value: '12',
            member
        });
        await handler.run({configurations: {levels: {config: {allowCheats: true}}}}, interaction);
        expect(runLevelAction).toHaveBeenCalledTimes(1);
        const [, transform] = runLevelAction.mock.calls[0];
        expect(transform()).toBe(12);
        expect(runXPAction).not.toHaveBeenCalled();
    });

    test('rejects a non-numeric value ephemerally', async () => {
        const interaction = makeInteraction({
            customId: 'set-user-xp:m1',
            value: 'not-a-number'
        });
        await handler.run({configurations: {levels: {config: {allowCheats: true}}}}, interaction);
        expect(runXPAction).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('refuses when allowCheats is off', async () => {
        const interaction = makeInteraction({customId: 'set-user-xp:m1'});
        await handler.run({configurations: {levels: {config: {allowCheats: false}}}}, interaction);
        expect(runXPAction).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('replies when the member can not be resolved', async () => {
        const interaction = makeInteraction({customId: 'set-user-xp:gone'});
        interaction.guild.members.fetch = jest.fn().mockRejectedValue(new Error('not found'));
        await handler.run({configurations: {levels: {config: {allowCheats: true}}}}, interaction);
        expect(runXPAction).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('ignores unrelated modal submits (falls through to button guard)', async () => {
        const interaction = makeInteraction({customId: 'whatever:1'});
        await handler.run({configurations: {levels: {config: {allowCheats: true}}}}, interaction);
        expect(runXPAction).not.toHaveBeenCalled();
        expect(runLevelAction).not.toHaveBeenCalled();
    });
});