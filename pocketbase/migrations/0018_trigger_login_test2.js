migrate(
  (app) => {
    try {
      const user = app.findAuthRecordByEmail('_pb_users_auth_', 'daniel@impave.com.br')
      user.set('name', 'Admin Impave 2')
      app.save(user)
    } catch (err) {
      console.log('[Migration 0018] Erro: ' + String(err))
    }
  },
  () => {},
)
