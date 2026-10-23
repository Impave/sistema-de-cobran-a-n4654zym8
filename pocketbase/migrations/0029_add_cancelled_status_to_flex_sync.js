migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('flex_sync')
    const statusField = col.fields.getByName('status')

    if (statusField) {
      statusField.values = ['pending', 'running', 'cancelling', 'cancelled', 'done', 'error']
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('flex_sync')
      const statusField = col.fields.getByName('status')
      if (statusField) {
        statusField.values = ['pending', 'running', 'done', 'error']
        app.save(col)
      }
    } catch (_) {}
  },
)
