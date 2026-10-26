// pocketbase/migrations/0041_add_client_search_indexes.js
migrate(
  (app) => {
    const clients = app.findCollectionByNameOrId('clients')
    // Adiciona índices idempotentes para buscas rápidas por nome, documento e telefone
    try {
      clients.addIndex('idx_clients_name', false, 'name', '')
    } catch (_) {}
    try {
      clients.addIndex('idx_clients_document', false, 'document', '')
    } catch (_) {}
    try {
      clients.addIndex('idx_clients_phone', false, 'phone', '')
    } catch (_) {}
    try {
      clients.addIndex('idx_clients_email', false, 'email', '')
    } catch (_) {}
    app.save(clients)
  },
  (app) => {
    const clients = app.findCollectionByNameOrId('clients')
    try {
      clients.removeIndex('idx_clients_name')
    } catch (_) {}
    try {
      clients.removeIndex('idx_clients_document')
    } catch (_) {}
    try {
      clients.removeIndex('idx_clients_phone')
    } catch (_) {}
    try {
      clients.removeIndex('idx_clients_email')
    } catch (_) {}
    app.save(clients)
  },
)
