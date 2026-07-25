/*
 * Tests for the eco-ctx modal-submit branch in economy-system/events/interactionCreate.js.
 *
 * The customId encodes the action and target as eco-ctx:<action>:<targetUserId>. The handler
 * re-resolves str/config, re-runs the shared admin guard, validates the amount is a positive
 * integer (rejecting otherwise), defers ephemerally, then calls the matching shared core
 * (addMoney / removeMoney / setMoney) with the resolved target user and amount.
 */
const mockBuyShopItem = jest.fn();
const mockAddMoney = jest.fn().mockResolvedValue('added');
const mockRemoveMoney = jest.fn().mockResolvedValue('removed');
const mockSetMoney = jest.fn().mockResolvedValue('set');
const mockAdminGuard = jest.fn().mockResolvedValue(true);

jest.mock('../../modules/economy-system/economy-system', () => ({buyShopItem: (...a) => mockBuyShopItem(...a)}));
jest.mock('../../modules/economy-system/commands/economy-system', () => ({
    addMoney: (...a) => mockAddMoney(...a),
    removeMoney: (...a) => mockRemoveMoney(...a),
    setMoney: (...a) => mockSetMoney(...a),
    adminGuard: (...a) => mockAdminGuard(...a)
}));
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));
jest.mock('../../src/functions/helpers', () => ({embedType: (s) => ({content: s})}));

const handler = require('../../modules/economy-system/events/interactionCreate');

const config = {publicCommandReplies: false};
const strings = {};

function makeClient(targetUser = {
    id: 't1',
    tag: 'T#1'
}) {
    return {
        botReadyAt: Date.now(),
        config: {guildID: 'g1'},
        users: {
            cache: {get: jest.fn(() => targetUser)},
            fetch: jest.fn().mockResolvedValue(targetUser)
        },
        configurations: {
            'economy-system': {
                config,
                strings
            }
        }
    };
}

function makeInteraction(customId, amount = '50') {
    return {
        guild: {id: 'g1'},
        customId,
        isModalSubmit: () => true,
        isSelectMenu: () => false,
        fields: {getTextInputValue: jest.fn(() => amount)},
        reply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    mockBuyShopItem.mockClear();
    mockAddMoney.mockClear();
    mockRemoveMoney.mockClear();
    mockSetMoney.mockClear();
    mockAdminGuard.mockClear().mockResolvedValue(true);
});

describe('eco-ctx modal submit', () => {
    const cores = {
        add: () => mockAddMoney,
        remove: () => mockRemoveMoney,
        set: () => mockSetMoney
    };

    test.each(['add', 'remove', 'set'])('%s: guards, defers, and calls the shared core with target + amount', async (action) => {
        const target = {
            id: 'victim',
            tag: 'V#1'
        };
        const client = makeClient(target);
        const interaction = makeInteraction(`eco-ctx:${action}:victim`, '42');

        await handler.run(client, interaction);

        expect(mockAdminGuard).toHaveBeenCalledWith(interaction, target);
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(cores[action]()).toHaveBeenCalledWith(interaction, target, 42);
        expect(mockBuyShopItem).not.toHaveBeenCalled();
    });

    test('rejects a non-numeric amount without deferring or calling the core', async () => {
        const interaction = makeInteraction('eco-ctx:add:victim', 'banana');
        await handler.run(makeClient(), interaction);
        expect(interaction.reply).toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('context-invalid-amount');
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(mockAddMoney).not.toHaveBeenCalled();
    });

    test('rejects a zero / negative amount', async () => {
        const interaction = makeInteraction('eco-ctx:add:victim', '0');
        await handler.run(makeClient(), interaction);
        expect(mockAddMoney).not.toHaveBeenCalled();
        const neg = makeInteraction('eco-ctx:set:victim', '-5');
        await handler.run(makeClient(), neg);
        expect(mockSetMoney).not.toHaveBeenCalled();
    });

    test('rejects a non-integer amount', async () => {
        const interaction = makeInteraction('eco-ctx:remove:victim', '1.5');
        await handler.run(makeClient(), interaction);
        expect(mockRemoveMoney).not.toHaveBeenCalled();
    });

    test('does not run the core when the admin guard fails', async () => {
        mockAdminGuard.mockResolvedValue(false);
        const interaction = makeInteraction('eco-ctx:add:victim', '10');
        await handler.run(makeClient(), interaction);
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(mockAddMoney).not.toHaveBeenCalled();
    });

    test('replies when the target user can not be resolved', async () => {
        const client = makeClient(null);
        client.users.cache.get.mockReturnValue(null);
        client.users.fetch.mockResolvedValue(null);
        const interaction = makeInteraction('eco-ctx:add:ghost', '10');
        await handler.run(client, interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('context-user-not-found');
        expect(mockAddMoney).not.toHaveBeenCalled();
    });

    test('ignores an unknown eco-ctx action', async () => {
        const interaction = makeInteraction('eco-ctx:bogus:victim', '10');
        await handler.run(makeClient(), interaction);
        expect(mockAddMoney).not.toHaveBeenCalled();
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('non eco-ctx select menu still routes to the shop handler', async () => {
        const interaction = {
            guild: {id: 'g1'},
            customId: 'economy-system_shop-select',
            isModalSubmit: () => false,
            isSelectMenu: () => true,
            values: ['item-1'],
            deferReply: jest.fn().mockResolvedValue()
        };
        await handler.run(makeClient(), interaction);
        expect(mockBuyShopItem).toHaveBeenCalledWith(interaction, 'item-1', null);
    });
});