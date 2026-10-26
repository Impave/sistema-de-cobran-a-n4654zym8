// pocketbase/hooks/users_admin.js
// ATENÇÃO: NENHUMA variável ou função no top-level pode ser referenciada dentro de callbacks
// PocketBase JSVM executa callbacks em pools isolados. Todas as funções auxiliares e variáveis
// devem ser declaradas INLINE dentro do corpo de cada callback.

// --------------------------------------------------------------------------
// 1. ROTA POST /backend/v1/users/create
// Criação de usuário por administrador
// --------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/users/create', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado.' })
  }

  // Verificar se o usuário autenticado é admin
  const userRole = authUser.getString('role')
  if (userRole !== 'admin') {
    return e.json(403, {
      success: false,
      message: 'Acesso não autorizado. Apenas administradores podem criar usuários.',
    })
  }

  let body = {}
  try {
    if (reqInfo && reqInfo.body && typeof reqInfo.body === 'object') {
      body = reqInfo.body
    }
  } catch (_) {}

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : ''
  const role = body.role === 'admin' ? 'admin' : 'operador'

  if (!name || name.length < 2) {
    return e.json(400, {
      success: false,
      message: 'O nome completo é obrigatório e deve ter no mínimo 2 caracteres.',
    })
  }

  if (!email || !email.includes('@')) {
    return e.json(400, { success: false, message: 'Informe um endereço de e-mail válido.' })
  }

  if (!password || password.length < 8) {
    return e.json(400, { success: false, message: 'A senha deve ter no mínimo 8 caracteres.' })
  }

  if (password !== passwordConfirm) {
    return e.json(400, { success: false, message: 'As senhas informadas não coincidem.' })
  }

  // Verificar se o e-mail já existe
  try {
    const existing = $app.findAuthRecordByEmail('_pb_users_auth_', email)
    if (existing) {
      return e.json(400, {
        success: false,
        message: 'Este endereço de e-mail já está em uso por outro usuário.',
      })
    }
  } catch (_) {
    // Não encontrado, prossegue
  }

  try {
    const usersCol = $app.findCollectionByNameOrId('_pb_users_auth_')
    const newRecord = new Record(usersCol)
    newRecord.setEmail(email)
    newRecord.setPassword(password)
    newRecord.setVerified(true)
    newRecord.set('name', name)
    newRecord.set('role', role)
    newRecord.set('active', true)
    $app.save(newRecord)

    return e.json(201, {
      success: true,
      message: 'Usuário criado com sucesso.',
      user: {
        id: newRecord.id,
        name: newRecord.getString('name'),
        email: newRecord.getString('email'),
        role: newRecord.getString('role') || 'operador',
        active: newRecord.getBool('active'),
        created: newRecord.getString('created'),
      },
    })
  } catch (err) {
    console.log('[UsersAdmin create] Erro ao criar usuário:', String(err))
    return e.json(500, { success: false, message: 'Erro ao cadastrar usuário: ' + String(err) })
  }
})

// --------------------------------------------------------------------------
// 2. ROTA POST /backend/v1/users/update/{id}
// Atualização de nome, role e status ativo/inativo por administrador
// --------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/users/update/{id}', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado.' })
  }

  const userRole = authUser.getString('role')
  if (userRole !== 'admin') {
    return e.json(403, {
      success: false,
      message: 'Acesso não autorizado. Apenas administradores podem atualizar usuários.',
    })
  }

  const targetId = e.request.pathValue('id')
  if (!targetId) {
    return e.json(400, { success: false, message: 'ID de usuário não informado.' })
  }

  let targetRecord
  try {
    targetRecord = $app.findRecordById('_pb_users_auth_', targetId)
  } catch (_) {
    return e.json(404, { success: false, message: 'Usuário não encontrado.' })
  }

  let body = {}
  try {
    if (reqInfo && reqInfo.body && typeof reqInfo.body === 'object') {
      body = reqInfo.body
    }
  } catch (_) {}

  const targetEmail = targetRecord.getString('email')

  // Proteção 1: Não permitir alterar status nem função do usuário de serviço
  if (targetEmail === 'garantias-service@impave.com.br') {
    if (body.active === false || (body.role && body.role !== 'admin')) {
      return e.json(400, {
        success: false,
        message: 'O usuário de serviço do sistema não pode ser desativado nem rebaixado de função.',
      })
    }
  }

  // Proteção 2: Não permitir desativar a si mesmo nem remover seu próprio papel de admin
  if (targetRecord.id === authUser.id) {
    if (body.active === false) {
      return e.json(400, {
        success: false,
        message: 'Você não pode desativar seu próprio usuário.',
      })
    }
    if (body.role && body.role !== 'admin') {
      return e.json(400, {
        success: false,
        message: 'Você não pode remover seu próprio privilégio de administrador.',
      })
    }
  }

  if (typeof body.name === 'string' && body.name.trim().length >= 2) {
    targetRecord.set('name', body.name.trim())
  }

  if (body.role === 'admin' || body.role === 'operador') {
    targetRecord.set('role', body.role)
  }

  if (typeof body.active === 'boolean') {
    targetRecord.set('active', body.active)
  }

  try {
    $app.save(targetRecord)
    return e.json(200, {
      success: true,
      message: 'Usuário atualizado com sucesso.',
      user: {
        id: targetRecord.id,
        name: targetRecord.getString('name'),
        email: targetRecord.getString('email'),
        role: targetRecord.getString('role') || 'operador',
        active: targetRecord.getBool('active'),
        updated: targetRecord.getString('updated'),
      },
    })
  } catch (err) {
    console.log('[UsersAdmin update] Erro ao salvar usuário:', String(err))
    return e.json(500, { success: false, message: 'Erro ao atualizar usuário: ' + String(err) })
  }
})

// --------------------------------------------------------------------------
// 3. ROTA POST /backend/v1/users/reset-password/{id}
// Redefinição de senha por administrador
// --------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/users/reset-password/{id}', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado.' })
  }

  const userRole = authUser.getString('role')
  if (userRole !== 'admin') {
    return e.json(403, {
      success: false,
      message: 'Acesso não autorizado. Apenas administradores podem redefinir senhas.',
    })
  }

  const targetId = e.request.pathValue('id')
  if (!targetId) {
    return e.json(400, { success: false, message: 'ID de usuário não informado.' })
  }

  let targetRecord
  try {
    targetRecord = $app.findRecordById('_pb_users_auth_', targetId)
  } catch (_) {
    return e.json(404, { success: false, message: 'Usuário não encontrado.' })
  }

  const targetEmail = targetRecord.getString('email')
  if (targetEmail === 'garantias-service@impave.com.br') {
    return e.json(400, {
      success: false,
      message: 'A senha do usuário de serviço do sistema não pode ser redefinida por esta tela.',
    })
  }

  let body = {}
  try {
    if (reqInfo && reqInfo.body && typeof reqInfo.body === 'object') {
      body = reqInfo.body
    }
  } catch (_) {}

  const newPassword = typeof body.password === 'string' ? body.password : ''
  const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : ''

  if (!newPassword || newPassword.length < 8) {
    return e.json(400, { success: false, message: 'A nova senha deve ter no mínimo 8 caracteres.' })
  }

  if (passwordConfirm && newPassword !== passwordConfirm) {
    return e.json(400, { success: false, message: 'As senhas informadas não coincidem.' })
  }

  try {
    targetRecord.setPassword(newPassword)
    $app.save(targetRecord)

    return e.json(200, {
      success: true,
      message: 'Senha do usuário alterada com sucesso.',
    })
  } catch (err) {
    console.log('[UsersAdmin reset-password] Erro ao alterar senha:', String(err))
    return e.json(500, { success: false, message: 'Erro ao alterar senha: ' + String(err) })
  }
})

// --------------------------------------------------------------------------
// 4. Bloqueio de login para usuários inativos (onRecordAuthRequest)
// --------------------------------------------------------------------------
onRecordAuthRequest((e) => {
  e.next()
  // Se o registro autenticado for da coleção users, verificar se está ativo
  if (e.record && e.record.collection().name === 'users') {
    const isActive = e.record.getBool('active')
    // Se o campo active for explicitamente false, bloquear login
    if (isActive === false) {
      throw new ForbiddenError('Este usuário está inativo. Entre em contato com um administrador.')
    }
  }
})
