migrate(
  (app) => {
    let clients
    try {
      clients = app.findCollectionByNameOrId('clients')
    } catch (_) {
      return
    }

    const field = clients.fields.getByName('cod_cliente')

    // Se o campo já for number, nada a fazer
    if (field && field.type === 'number') {
      return
    }

    // 1. Remover índice antigo em cod_cliente se existir
    try {
      clients.removeIndex('idx_clients_cod_cliente')
    } catch (_) {}
    try {
      app.save(clients)
    } catch (_) {}

    // 2. Adicionar campo temporário numérico cod_cliente_num se não existir
    if (!clients.fields.getByName('cod_cliente_num')) {
      clients.fields.add(
        new NumberField({
          name: 'cod_cliente_num',
          required: false,
          onlyInt: true,
        }),
      )
      app.save(clients)
    }

    // 3. Migrar dados existentes de cod_cliente (texto) para cod_cliente_num (número inteiro)
    // Converte de forma segura: remove pontos e espaços, parse para inteiro;
    // se não for numérico ou vazio -> 0 ou NULL.
    // Em SQLite, REPLACE(REPLACE(TRIM(cod_cliente), '.', ''), ' ', '') retira os pontos de milhar (ex: '303.854' -> '303854')
    try {
      app
        .db()
        .newQuery(`
        UPDATE clients
        SET cod_cliente_num = CASE
          WHEN cod_cliente IS NOT NULL AND TRIM(cod_cliente) != '' THEN
            CAST(REPLACE(REPLACE(TRIM(cod_cliente), '.', ''), ' ', '') AS INTEGER)
          ELSE NULL
        END
      `)
        .execute()
    } catch (err) {
      console.log('[Migration 0050] Erro ao copiar dados para cod_cliente_num:', err)
    }

    // 4. Remover campo cod_cliente antigo (text)
    clients = app.findCollectionByNameOrId('clients')
    if (clients.fields.getByName('cod_cliente')) {
      clients.fields.removeByName('cod_cliente')
      app.save(clients)
    }

    // 5. Adicionar novo campo cod_cliente como NumberField
    clients = app.findCollectionByNameOrId('clients')
    if (!clients.fields.getByName('cod_cliente')) {
      clients.fields.add(
        new NumberField({
          name: 'cod_cliente',
          required: false,
          onlyInt: true,
        }),
      )
      app.save(clients)
    }

    // 6. Copiar valores de cod_cliente_num para o novo cod_cliente numérico
    try {
      app
        .db()
        .newQuery(`
        UPDATE clients
        SET cod_cliente = cod_cliente_num
      `)
        .execute()
    } catch (err) {
      console.log('[Migration 0050] Erro ao restaurar dados para cod_cliente:', err)
    }

    // 7. Remover campo temporário cod_cliente_num
    clients = app.findCollectionByNameOrId('clients')
    if (clients.fields.getByName('cod_cliente_num')) {
      clients.fields.removeByName('cod_cliente_num')
      app.save(clients)
    }

    // 8. Recriar índice idx_clients_cod_cliente no campo numérico
    clients = app.findCollectionByNameOrId('clients')
    try {
      clients.addIndex('idx_clients_cod_cliente', false, 'cod_cliente', '')
      app.save(clients)
    } catch (_) {}
  },
  (app) => {
    // Reversão opcional: não há necessidade de reverter para texto
  },
)
