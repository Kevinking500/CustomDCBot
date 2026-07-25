/**
 * Registry of bot-managed "persistent" messages that the auto-delete module must
 * never remove.
 *
 * Several modules post a message that is meant to live in a channel - sticky
 * messages, live (auto-updating) messages, reaction-role panels, and so on. If
 * that same channel also has the auto-delete module enabled, auto-delete has no
 * way of telling such a message apart from ordinary chatter and deletes it. To
 * avoid that, the posting module registers the message id here and auto-delete
 * consults the registry before deleting anything.
 *
 * The registry hangs off the shared `client` (`client.protectedMessages`) so it
 * is visible to every module and shares the client lifecycle. It is stored as a
 * Map of channelId -> Set<messageId>.
 *
 * @module protectedMessages
 */

/**
 * Lazily fetches (creating if needed) the registry Map on the client.
 * @param {Object} client The bot client
 * @returns {Map<String, Set<String>>}
 * @private
 */
function getRegistry(client) {
    if (!client.protectedMessages) client.protectedMessages = new Map();
    return client.protectedMessages;
}

/**
 * Marks a message as protected so auto-delete will skip it.
 * @param {Object} client The bot client
 * @param {String} channelId Channel the message lives in
 * @param {String} messageId The message to protect
 * @returns {void}
 */
function protectMessage(client, channelId, messageId) {
    if (!client || !channelId || !messageId) return;
    const registry = getRegistry(client);
    let set = registry.get(channelId);
    if (!set) {
        set = new Set();
        registry.set(channelId, set);
    }
    set.add(messageId);
}

/**
 * Removes the protection from a message (e.g. once it has been deleted/replaced
 * by the owning module). Prunes the channel bucket once it becomes empty.
 * @param {Object} client The bot client
 * @param {String} channelId Channel the message lives in
 * @param {String} messageId The message to stop protecting
 * @returns {void}
 */
function unprotectMessage(client, channelId, messageId) {
    if (!client || !channelId || !messageId) return;
    if (!client.protectedMessages) return;
    const set = client.protectedMessages.get(channelId);
    if (!set) return;
    set.delete(messageId);
    if (set.size === 0) client.protectedMessages.delete(channelId);
}

/**
 * Whether a message is currently protected from auto-delete.
 * @param {Object} client The bot client
 * @param {String} channelId Channel the message lives in
 * @param {String} messageId The message to check
 * @returns {Boolean}
 */
function isMessageProtected(client, channelId, messageId) {
    if (!client || !client.protectedMessages) return false;
    const set = client.protectedMessages.get(channelId);
    return Boolean(set && set.has(messageId));
}

/**
 * Startup providers. Each persistent-message module that stores its message ids
 * in the database registers a provider here at load time. Before the auto-delete
 * module performs its startup sweep it calls loadProtectedMessages(), which runs
 * every provider and rebuilds the in-memory registry from the persisted ids. This
 * closes the boot-time race where a panel would otherwise be swept before its
 * module had a chance to re-register it at runtime.
 *
 * Registration happens synchronously at require time (before the botReady event is
 * emitted), so the provider list is complete by the time loadProtectedMessages()
 * runs.
 * @type {Array<function(Object): (Promise<Array<{channelId: String, messageId: String}>>|Array<{channelId: String, messageId: String}>)>}
 * @private
 */
const providers = [];

/**
 * Registers a startup provider that yields the protected message ids for one
 * module. The provider receives the client and returns (or resolves to) an array
 * of {channelId, messageId} entries.
 * @param {Function} provider
 * @returns {void}
 */
function registerProtectedMessageProvider(provider) {
    if (typeof provider !== 'function') return;
    providers.push(provider);
}

/**
 * Runs every registered provider and populates the registry from the persisted
 * ids. A provider that throws or returns a non-array is skipped so one bad module
 * cannot break the startup sweep.
 * @param {Object} client The bot client
 * @returns {Promise<void>}
 */
async function loadProtectedMessages(client) {
    for (const provider of providers) {
        let entries;
        try {
            entries = await provider(client);
        } catch {
            entries = null;
        }
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
            if (entry) protectMessage(client, entry.channelId, entry.messageId);
        }
    }
}

/**
 * Drops all registered providers. Used by tests to isolate the provider list.
 * @returns {void}
 */
function clearProtectedMessageProviders() {
    providers.length = 0;
}

module.exports = {
    protectMessage,
    unprotectMessage,
    isMessageProtected,
    registerProtectedMessageProvider,
    loadProtectedMessages,
    clearProtectedMessageProviders
};
