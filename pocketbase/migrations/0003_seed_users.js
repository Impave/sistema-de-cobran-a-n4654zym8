migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'daniel@impave.com.br')
      return // já existe
    } catch (_) {}

    const record = new Record(users)
    record.setEmail('daniel@impave.com.br')
    record.setPassword('Skip@Pass')
    record.setVerified(true)
    record.set('name', 'Daniel Impave')
    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', 'daniel@impave.com.br')
      app.delete(record)
    } catch (_) {}
  },
)
