migrate(
  (app) => {
    try {
      const user = app.findAuthRecordByEmail('_pb_users_auth_', 'daniel@impave.com.br')
      // Trigger update to invoke onRecordAfterUpdateSuccess
      user.set('name', 'Admin Impave')
      app.save(user)
    } catch (err) {
      console.log('[Migration 0017] Erro ao disparar trigger: ' + String(err))
    }
  },
  () => {},
)
