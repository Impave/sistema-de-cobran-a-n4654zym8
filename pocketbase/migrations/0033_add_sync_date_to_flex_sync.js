migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('flex_sync')

      // Aumenta current_step para 255 se estiver 100
      const currentStepField = col.fields.getByName('current_step')
      if (currentStepField) {
        currentStepField.max = 255
      }

      // Adiciona sync_date (texto DD/MM/AAAA)
      if (!col.fields.getByName('sync_date')) {
        col.fields.add(
          new TextField({
            name: 'sync_date',
            max: 20,
          }),
        )
      }

      // Adiciona is_full_sync (bool)
      if (!col.fields.getByName('is_full_sync')) {
        col.fields.add(
          new BoolField({
            name: 'is_full_sync',
          }),
        )
      }

      app.save(col)
    } catch (e) {
      console.log('[Migration 0033] Erro ao atualizar flex_sync schema:', String(e))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('flex_sync')
      if (col.fields.getByName('sync_date')) {
        col.fields.removeByName('sync_date')
      }
      if (col.fields.getByName('is_full_sync')) {
        col.fields.removeByName('is_full_sync')
      }
      app.save(col)
    } catch (_) {}
  },
)
