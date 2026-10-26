migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Adicionar campo 'role' se ainda não existir
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          values: ['admin', 'operador'],
          maxSelect: 1,
        }),
      )
    }

    // 2. Adicionar campo 'active' (bool) se ainda não existir (padrão true para usuários)
    // Conforme regra do PocketBase, NUNCA colocar required: true em BoolField
    if (!users.fields.getByName('active')) {
      users.fields.add(
        new BoolField({
          name: 'active',
          required: false,
        }),
      )
    }

    // Atualizar regras de list/view da coleção users para permitir que admins vejam outros usuários
    // ou cada usuário veja a si mesmo
    users.listRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.viewRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    // update: o próprio usuário pode atualizar seu próprio perfil, mas NÃO mudar seu role ou status active
    // admins podem atualizar via hook de superuser ou regra se necessário
    users.updateRule =
      "@request.auth.id != '' && ((id = @request.auth.id && @request.body.role:changed = false && @request.body.active:changed = false) || @request.auth.role = 'admin')"

    app.save(users)

    // 3. Atualizar daniel@impave.com.br para role 'admin' e active true
    try {
      const daniel = app.findAuthRecordByEmail('_pb_users_auth_', 'daniel@impave.com.br')
      daniel.set('role', 'admin')
      daniel.set('active', true)
      app.save(daniel)
    } catch (_) {}

    // 4. Garantir que o service user também esteja ativo
    try {
      const svc = app.findAuthRecordByEmail('_pb_users_auth_', 'garantias-service@impave.com.br')
      svc.set('role', 'admin')
      svc.set('active', true)
      app.save(svc)
    } catch (_) {}

    // 5. Garantir que outros usuários existentes tenham role 'operador' se não tiverem role
    try {
      const allUsers = app.findRecordsByFilter(
        '_pb_users_auth_',
        "role = '' || role = null",
        '',
        100,
        0,
      )
      for (let i = 0; i < allUsers.length; i++) {
        const u = allUsers[i]
        if (
          u.getString('email') === 'daniel@impave.com.br' ||
          u.getString('email') === 'garantias-service@impave.com.br'
        ) {
          u.set('role', 'admin')
        } else {
          u.set('role', 'operador')
        }
        u.set('active', true)
        app.save(u)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const roleField = users.fields.getByName('role')
      if (roleField) {
        users.fields.removeByName('role')
      }
      const activeField = users.fields.getByName('active')
      if (activeField) {
        users.fields.removeByName('active')
      }
      users.listRule = 'id = @request.auth.id'
      users.viewRule = 'id = @request.auth.id'
      users.updateRule = 'id = @request.auth.id'
      app.save(users)
    } catch (_) {}
  },
)
