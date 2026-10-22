migrate(
  (app) => {
    let user
    try {
      user = app.findAuthRecordByEmail('_pb_users_auth_', 'daniel@impave.com.br')
    } catch (_) {
      // Usuário não existe, cria agora
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      user = new Record(users)
      user.setEmail('daniel@impave.com.br')
      user.set('name', 'Daniel Impave')
    }

    // Redefine a senha para o valor padrão anunciado (Skip@Pass) e garante verified=true
    user.setPassword('Skip@Pass')
    user.setVerified(true)
    app.save(user)
  },
  (app) => {
    // Reversão opcional (não precisa reverter a redefinição de senha em rollback)
  },
)
