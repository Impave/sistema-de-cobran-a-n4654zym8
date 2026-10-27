migrate(
  (app) => {
    const clients = app.findCollectionByNameOrId('clients')

    // Permitir que qualquer usuário autenticado liste e visualize todos os clientes.
    // Preserva o acesso já existente (usuários autenticados em geral e o usuário garantias-service@impave.com.br).
    clients.listRule = "@request.auth.id != ''"
    clients.viewRule = "@request.auth.id != ''"

    // createRule, updateRule, deleteRule permanecem inalteradas:
    // createRule: "@request.auth.id != ''"
    // updateRule: "@request.auth.id != '' && owner = @request.auth.id"
    // deleteRule: "@request.auth.id != '' && owner = @request.auth.id"

    app.save(clients)
  },
  (app) => {
    const clients = app.findCollectionByNameOrId('clients')

    // Reverter para regra anterior se necessário
    const previousRule =
      "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.email = 'garantias-service@impave.com.br')"
    clients.listRule = previousRule
    clients.viewRule = previousRule

    app.save(clients)
  },
)
