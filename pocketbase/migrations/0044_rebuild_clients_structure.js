migrate(
  (app) => {
    // 1. Apagar com segurança todos os registros existentes na coleção clients
    try {
      app.db().newQuery('DELETE FROM clients').execute()
    } catch (_) {}

    // 2. Localizar coleção clients
    let clients
    try {
      clients = app.findCollectionByNameOrId('clients')
    } catch (_) {
      // Se não existir, cria a nova coleção do zero
      const newClientsCol = new Collection({
        name: 'clients',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.email = 'garantias-service@impave.com.br')",
        viewRule:
          "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.email = 'garantias-service@impave.com.br')",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && owner = @request.auth.id",
        deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          { name: 'cod_cliente', type: 'text', required: false },
          { name: 'nome_cliente', type: 'text', required: true, min: 2 },
          { name: 'razao_social', type: 'text', required: false },
          { name: 'cnpj_cpf', type: 'text', required: false },
          { name: 'contato1', type: 'text', required: false },
          { name: 'contato2', type: 'text', required: false },
          { name: 'email1', type: 'text', required: false },
          { name: 'email2', type: 'text', required: false },
          { name: 'email3', type: 'text', required: false },
          { name: 'estado', type: 'text', required: false },
          { name: 'cidade', type: 'text', required: false },
          { name: 'bairro', type: 'text', required: false },
        ],
        indexes: [
          'CREATE INDEX idx_clients_owner ON clients (owner)',
          'CREATE INDEX idx_clients_created ON clients (created)',
          'CREATE INDEX idx_clients_cod_cliente ON clients (cod_cliente)',
          'CREATE INDEX idx_clients_nome_cliente ON clients (nome_cliente)',
          'CREATE INDEX idx_clients_razao_social ON clients (razao_social)',
          'CREATE INDEX idx_clients_cnpj_cpf ON clients (cnpj_cpf)',
          'CREATE INDEX idx_clients_cidade ON clients (cidade)',
        ],
      })
      app.save(newClientsCol)
      return
    }

    // 3. Garantir limpeza de campos legados se ainda existirem
    const legacyFields = [
      'erp_code',
      'name',
      'email',
      'document',
      'phone',
      'address',
      'city',
      'state',
    ]
    for (let i = 0; i < legacyFields.length; i++) {
      if (clients.fields.getByName(legacyFields[i])) {
        clients.fields.removeByName(legacyFields[i])
      }
    }

    // 4. Garantir presença de todos os campos da estrutura CSV
    const targetFields = [
      { name: 'cod_cliente', required: false },
      { name: 'nome_cliente', required: true, min: 2 },
      { name: 'razao_social', required: false },
      { name: 'cnpj_cpf', required: false },
      { name: 'contato1', required: false },
      { name: 'contato2', required: false },
      { name: 'email1', required: false },
      { name: 'email2', required: false },
      { name: 'email3', required: false },
      { name: 'estado', required: false },
      { name: 'cidade', required: false },
      { name: 'bairro', required: false },
    ]

    for (let i = 0; i < targetFields.length; i++) {
      const f = targetFields[i]
      if (!clients.fields.getByName(f.name)) {
        clients.fields.add(
          new TextField({
            name: f.name,
            required: Boolean(f.required),
            min: f.min || 0,
          }),
        )
      }
    }

    // 5. Garantir índices de performance
    try {
      clients.addIndex('idx_clients_cod_cliente', false, 'cod_cliente', '')
    } catch (_) {}
    try {
      clients.addIndex('idx_clients_nome_cliente', false, 'nome_cliente', '')
    } catch (_) {}
    try {
      clients.addIndex('idx_clients_razao_social', false, 'razao_social', '')
    } catch (_) {}
    try {
      clients.addIndex('idx_clients_cnpj_cpf', false, 'cnpj_cpf', '')
    } catch (_) {}
    try {
      clients.addIndex('idx_clients_cidade', false, 'cidade', '')
    } catch (_) {}

    // 6. Regras de acesso preservando o serviço do projeto irmão garantias
    const readRule =
      "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.email = 'garantias-service@impave.com.br')"
    clients.listRule = readRule
    clients.viewRule = readRule
    clients.createRule = "@request.auth.id != ''"
    clients.updateRule = "@request.auth.id != '' && owner = @request.auth.id"
    clients.deleteRule = "@request.auth.id != '' && owner = @request.auth.id"

    app.save(clients)
  },
  (app) => {
    // Reversão
  },
)
