migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('clients')
    if (!col.fields.getByName('erp_code')) {
      col.fields.add(
        new TextField({
          name: 'erp_code',
          required: false,
        }),
      )
      app.save(col)
    }

    try {
      col.addIndex('idx_clients_erp_code', false, 'erp_code', '')
      app.save(col)
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('clients')
      const field = col.fields.getByName('erp_code')
      if (field) {
        col.fields.removeByName('erp_code')
      }
      try {
        col.removeIndex('idx_clients_erp_code')
      } catch (_) {}
      app.save(col)
    } catch (_) {}
  },
)
