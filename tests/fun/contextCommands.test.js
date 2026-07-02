/*
 * The Hug/Pat/Slap/Kiss USER context-menu commands are thin adapters: each delegates to its
 * own slash command's run() with a proxy interaction whose options.getUser returns the
 * context-menu targetUser. These tests verify the declaration (USER, everyone) and that the
 * adapter calls the underlying run() with a getUser that resolves to targetUser, so the output
 * is identical to the slash command. We do not depend on the description key resolving (the
 * global localize stub returns a placeholder string for any key).
 */
jest.mock('../../modules/fun/commands/hug', () => ({run: jest.fn().mockResolvedValue('hugged')}));
jest.mock('../../modules/fun/commands/pat', () => ({run: jest.fn().mockResolvedValue('patted')}));
jest.mock('../../modules/fun/commands/slap', () => ({run: jest.fn().mockResolvedValue('slapped')}));
jest.mock('../../modules/fun/commands/kiss', () => ({run: jest.fn().mockResolvedValue('kissed')}));

const {
    allowingChannel,
    denyingChannel
} = require('../__helpers__/permissionChannel');

const CASES = [
    {
        name: 'Hug',
        adapter: '../../modules/fun/commands/hug-user',
        target: '../../modules/fun/commands/hug'
    },
    {
        name: 'Pat',
        adapter: '../../modules/fun/commands/pat-user',
        target: '../../modules/fun/commands/pat'
    },
    {
        name: 'Slap',
        adapter: '../../modules/fun/commands/slap-user',
        target: '../../modules/fun/commands/slap'
    },
    {
        name: 'Kiss',
        adapter: '../../modules/fun/commands/kiss-user',
        target: '../../modules/fun/commands/kiss'
    }
];

describe.each(CASES)('$name USER context command', ({
                                                        name,
                                                        adapter,
                                                        target
                                                    }) => {
    const command = require(adapter);
    const {run: underlying} = require(target);

    beforeEach(() => underlying.mockClear());

    test('declares a USER context command available to everyone', () => {
        expect(command.config.name).toBe(name);
        expect(command.config.type).toBe('USER');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toBeUndefined();
    });

    test('delegates to the slash run() with options.getUser resolving to targetUser', async () => {
        const targetUser = {id: 'target-123'};
        const interaction = {
            user: {id: 'author'},
            member: {id: 'author'},
            channel: allowingChannel(),
            targetUser
        };
        const result = await command.run(interaction);

        expect(underlying).toHaveBeenCalledTimes(1);
        const proxy = underlying.mock.calls[0][0];
        expect(proxy.options.getUser('user', true)).toBe(targetUser);
        // The proxy preserves the rest of the interaction (author, client, reply helpers).
        expect(proxy.user).toBe(interaction.user);
        expect(proxy.targetUser).toBe(targetUser);
        expect(result).toBe(await underlying.mock.results[0].value);
    });

    test('replies ephemerally and does NOT delegate when the member cannot send in the channel', async () => {
        const interaction = {
            user: {id: 'author'},
            member: {id: 'author'},
            channel: denyingChannel(),
            targetUser: {id: 'target-123'},
            reply: jest.fn().mockResolvedValue()
        };
        await command.run(interaction);

        expect(underlying).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('command.no-send-permission');
    });
});