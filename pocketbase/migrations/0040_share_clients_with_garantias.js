migrate(
  (app) => {
    // 1. Criar usuário de serviço exclusivo para o projeto de garantias
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const serviceEmail = 'garantias-service@impave.com.br'

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', serviceEmail)
      // Já existe, não recria
    } catch (_) {
      const record = new Record(users)
      record.setEmail(serviceEmail)
      record.setPassword('GarantiasImpave2026!Service')
      record.setVerified(true)
      record.set('name', 'Serviço Garantias Impave')
      app.save(record)
    }

    // 2. Atualizar as regras de list/view da collection clients
    // Permite leitura se:
    // - Usuário autenticado for o próprio dono do registro (@request.auth.id = owner)
    // - OU usuário autenticado for o service user do projeto garantias
    // Mantém create, update e delete estritamente protegidos para o dono do registro
    const clientsCol = app.findCollectionByNameOrId('clients')
    const readRule =
      "@request.auth.id != '' && (owner = @request.auth.id || @request.auth.email = 'garantias-service@impave.com.br')"

    clientsCol.listRule = readRule
    clientsCol.viewRule = readRule
    // createRule, updateRule, deleteRule permanecem inalteradas:
    // createRule: "@request.auth.id != ''"
    // updateRule: "@request.auth.id != '' && owner = @request.auth.id"
    // deleteRule: "@request.auth.id != '' && owner = @request.auth.id"
    app.save(clientsCol)
  },
  (app) => {
    // Reverter regras de clients
    try {
      const clientsCol = app.findCollectionByNameOrId('clients')
      clientsCol.listRule = "@request.auth.id != '' && owner = @request.auth.id"
      clientsCol.viewRule = "@request.auth.id != '' && owner = @request.auth.id"
      app.save(clientsCol)
    } catch (_) {}

    // Remover usuário de serviço se existir
    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', 'garantias-service@impave.com.br')
      app.delete(record)
    } catch (_) {}
  },
)
