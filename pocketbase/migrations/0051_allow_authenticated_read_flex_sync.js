migrate(
  (app) => {
    const flexSync = app.findCollectionByNameOrId('flex_sync')

    // Permitir que qualquer usuário autenticado liste e visualize o histórico de sincronização.
    // As regras de create, update e delete permanecem protegidas.
    flexSync.listRule = "@request.auth.id != ''"
    flexSync.viewRule = "@request.auth.id != ''"

    app.save(flexSync)
  },
  (app) => {
    const flexSync = app.findCollectionByNameOrId('flex_sync')

    // Reverter para regra anterior se necessário
    flexSync.listRule = "@request.auth.id != '' && owner = @request.auth.id"
    flexSync.viewRule = "@request.auth.id != '' && owner = @request.auth.id"

    app.save(flexSync)
  },
)
