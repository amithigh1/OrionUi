/* Orion.chat.connect(chatEl, client, opts?) -> disconnect()
 * Thin adapter wiring an <o-chat> element to a realtime client (Orion.ws / Orion.sse /
 * Orion.signalr's HubConnection, or any Emitter-shaped object with on()/send()/invoke()).
 * Real backends have their own message shapes, so treat this as a template — copy it into
 * your app and adjust the event names / payload mapping.
 */
O.chat = O.chat || {};
/**
 * opts: { messageEvent='chat:message', typingEvent='chat:typing', readEvent='chat:read', sendEvent='chat:send' }
 * Incoming `messageEvent` payload: { conversationId, ...message }
 * Incoming `typingEvent` payload:  { conversationId, userId, typing }
 * Incoming `readEvent` payload:    { conversationId }
 * Outgoing: client.invoke(sendEvent, { conversationId, message }) when available (SignalR),
 *           else client.send({ conversationId, message }).
 */
O.chat.connect = function (chatEl, client, opts = {}) {
  if (!chatEl || !client) return noop;
  const sendEvent = opts.sendEvent || 'chat:send';
  const offs = [];
  const wire = (name, fn) => { if (client && isFn(client.on)) offs.push(client.on(name, fn)); };

  wire(opts.messageEvent || 'chat:message', data => { if (data && data.conversationId != null) chatEl.addMessage(data.conversationId, { status: 'delivered', ...data }); });
  wire(opts.typingEvent || 'chat:typing', data => { if (data && data.conversationId != null) chatEl.setTyping(data.userId, !!data.typing, data.conversationId); });
  wire(opts.readEvent || 'chat:read', data => { if (data && data.conversationId != null) chatEl.markRead(data.conversationId); });

  const prevOnSend = chatEl.onSend;
  chatEl.onSend = async ({ conversationId, message }) => {
    const payload = { conversationId, message };
    if (isFn(client.invoke)) return client.invoke(sendEvent, payload);
    if (isFn(client.send)) { const ok = client.send(payload); if (ok === false) throw new Error('Orion.chat.connect: send failed (client not open)'); return; }
    throw new Error('Orion.chat.connect: client has no send()/invoke() method');
  };

  return function disconnect() {
    offs.forEach(f => { try { f(); } catch {} });
    chatEl.onSend = prevOnSend;
  };
};
