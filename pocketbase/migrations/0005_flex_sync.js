migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('flex_sync')
      return // já existe
    } catch (_) {}

    const collection = new Collection({
      name: 'flex_sync',
      type: 'base',
      listRule: "@request.auth.id != '' && owner = @request.auth.id",
      viewRule: "@request.auth.id != '' && owner = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pending', 'running', 'done', 'error'],
          maxSelect: 1,
        },
        { name: 'started_at', type: 'date' },
        { name: 'finished_at', type: 'date' },
        { name: 'count', type: 'number', onlyInt: true },
        { name: 'imported', type: 'number', onlyInt: true },
        { name: 'sample', type: 'json', maxSize: 2000000 },
        { name: 'error', type: 'text', max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_flex_sync_owner ON flex_sync (owner)',
        'CREATE INDEX idx_flex_sync_status ON flex_sync (status)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('flex_sync')
      app.delete(collection)
    } catch (_) {}
  },
)
