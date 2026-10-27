migrate(
  (app) => {
    // 1. Apagar todos os registros da collection clients (autorizado explicitamente pelo usuário)
    try {
      app.db().newQuery('DELETE FROM clients').execute()
    } catch (_) {}

    // 2. Localizar collection clients
    const clients = app.findCollectionByNameOrId('clients')

    // 3. Remover índices antigos que faziam referência a campos que serão excluídos/renomeados
    const oldIndexes = [
      'idx_clients_erp_code',
      'idx_clients_name',
      'idx_clients_document',
      'idx_clients_phone',
      'idx_clients_email',
      'idx_clients_nome_cliente',
      'idx_clients_razao_social',
      'idx_clients_cnpj_cpf',
      'idx_clients_cod_cliente',
      'idx_clients_cidade',
    ]
    for (let i = 0; i < oldIndexes.length; i++) {
      try {
        clients.removeIndex(oldIndexes[i])
      } catch (_) {}
    }

    // 4. Remover campos legados que não fazem parte do novo layout
    const oldFieldNames = [
      'erp_code',
      'name',
      'email',
      'document',
      'phone',
      'address',
      'city',
      'state',
    ]
    for (let i = 0; i < oldFieldNames.length; i++) {
      const field = clients.fields.getByName(oldFieldNames[i])
      if (field) {
        clients.fields.removeByName(oldFieldNames[i])
      }
    }

    // 5. Adicionar os novos campos exatamente como solicitado:
    // cod_cliente, nome_cliente, razao_social, cnpj_cpf, contato1, contato2,
    // email1, email2, email3, estado, cidade, bairro
    const newFields = [
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

    for (let i = 0; i < newFields.length; i++) {
      const f = newFields[i]
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

    // 6. Garantir índices de busca rápida nos novos campos
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

    // 7. Manter / reafirmar regras de acesso (incluindo permissão de leitura para garantias-service@impave.com.br)
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
    // Reversão básica (não recria dados apagados)
    const clients = app.findCollectionByNameOrId('clients')
    const fieldsToRemove = [
      'cod_cliente',
      'nome_cliente',
      'razao_social',
      'cnpj_cpf',
      'contato1',
      'contato2',
      'email1',
      'email2',
      'email3',
      'estado',
      'cidade',
      'bairro',
    ]
    for (let i = 0; i < fieldsToRemove.length; i++) {
      if (clients.fields.getByName(fieldsToRemove[i])) {
        clients.fields.removeByName(fieldsToRemove[i])
      }
    }
    app.save(clients)
  },
)
