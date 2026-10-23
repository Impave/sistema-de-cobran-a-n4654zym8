migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('flex_sync')

    if (!col.fields.getByName('created_count')) {
      col.fields.add(
        new NumberField({
          name: 'created_count',
          onlyInt: true,
        }),
      )
    }

    if (!col.fields.getByName('updated_count')) {
      col.fields.add(
        new NumberField({
          name: 'updated_count',
          onlyInt: true,
        }),
      )
    }

    if (!col.fields.getByName('current_step')) {
      col.fields.add(
        new TextField({
          name: 'current_step',
          max: 100,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('flex_sync')
      if (col.fields.getByName('created_count')) {
        col.fields.removeByName('created_count')
      }
      if (col.fields.getByName('updated_count')) {
        col.fields.removeByName('updated_count')
      }
      if (col.fields.getByName('current_step')) {
        col.fields.removeByName('current_step')
      }
      app.save(col)
    } catch (_) {}
  },
)
