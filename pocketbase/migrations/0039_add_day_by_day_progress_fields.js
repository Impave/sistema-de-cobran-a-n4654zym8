migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('flex_sync')

      // Aumenta current_step para 500 se necessário para comportar textos mais detalhados
      const currentStepField = col.fields.getByName('current_step')
      if (currentStepField) {
        currentStepField.max = 500
      }

      // sync_start_date (texto DD/MM/AAAA)
      if (!col.fields.getByName('sync_start_date')) {
        col.fields.add(
          new TextField({
            name: 'sync_start_date',
            max: 20,
          }),
        )
      }

      // total_days (número de dias no intervalo)
      if (!col.fields.getByName('total_days')) {
        col.fields.add(
          new NumberField({
            name: 'total_days',
            onlyInt: true,
          }),
        )
      }

      // processed_days (número de dias já processados)
      if (!col.fields.getByName('processed_days')) {
        col.fields.add(
          new NumberField({
            name: 'processed_days',
            onlyInt: true,
          }),
        )
      }

      // current_day_date (data do dia atualmente sendo processado DD/MM/AAAA)
      if (!col.fields.getByName('current_day_date')) {
        col.fields.add(
          new TextField({
            name: 'current_day_date',
            max: 20,
          }),
        )
      }

      // sync_mode (single_date | day_by_day)
      if (!col.fields.getByName('sync_mode')) {
        col.fields.add(
          new TextField({
            name: 'sync_mode',
            max: 30,
          }),
        )
      }

      app.save(col)
      console.log(
        '[Migration 0039] Campos de progresso diário adicionados à collection flex_sync com sucesso.',
      )
    } catch (e) {
      console.log('[Migration 0039] Erro ao atualizar flex_sync schema:', String(e))
      throw e
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('flex_sync')
      if (col.fields.getByName('sync_start_date')) col.fields.removeByName('sync_start_date')
      if (col.fields.getByName('total_days')) col.fields.removeByName('total_days')
      if (col.fields.getByName('processed_days')) col.fields.removeByName('processed_days')
      if (col.fields.getByName('current_day_date')) col.fields.removeByName('current_day_date')
      if (col.fields.getByName('sync_mode')) col.fields.removeByName('sync_mode')
      app.save(col)
    } catch (_) {}
  },
)
