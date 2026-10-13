migrate(
  (app) => {
    // 1. Coleção clients
    const clientsCollection = new Collection({
      name: 'clients',
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
          name: 'name',
          type: 'text',
          required: true,
          min: 2,
        },
        {
          name: 'email',
          type: 'email',
          required: false,
        },
        {
          name: 'document',
          type: 'text',
          required: false,
        },
        {
          name: 'phone',
          type: 'text',
          required: false,
        },
        {
          name: 'address',
          type: 'text',
          required: false,
        },
        {
          name: 'city',
          type: 'text',
          required: false,
        },
        {
          name: 'state',
          type: 'text',
          required: false,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_clients_owner ON clients (owner)',
        'CREATE INDEX idx_clients_created ON clients (created)',
      ],
    })

    app.save(clientsCollection)

    // 2. Coleção charges
    const chargesCollection = new Collection({
      name: 'charges',
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
          name: 'client',
          type: 'relation',
          required: true,
          collectionId: clientsCollection.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'description',
          type: 'text',
          required: true,
          min: 2,
        },
        {
          name: 'number',
          type: 'text',
          required: true,
        },
        {
          name: 'amount',
          type: 'number',
          required: true,
          min: 0.01,
        },
        {
          name: 'due_date',
          type: 'date',
          required: true,
        },
        {
          name: 'paid_at',
          type: 'date',
          required: false,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pending', 'paid', 'overdue', 'cancelled'],
          maxSelect: 1,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_charges_owner ON charges (owner)',
        'CREATE INDEX idx_charges_client ON charges (client)',
        'CREATE INDEX idx_charges_status ON charges (status)',
        'CREATE INDEX idx_charges_due_date ON charges (due_date)',
        'CREATE INDEX idx_charges_created ON charges (created)',
      ],
    })

    app.save(chargesCollection)
  },
  (app) => {
    try {
      const charges = app.findCollectionByNameOrId('charges')
      app.delete(charges)
    } catch (_) {}

    try {
      const clients = app.findCollectionByNameOrId('clients')
      app.delete(clients)
    } catch (_) {}
  },
)
