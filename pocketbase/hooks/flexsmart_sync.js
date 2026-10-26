// pocketbase/hooks/flexsmart_sync.js
// ATENÇÃO: NENHUMA variável ou função no top-level pode ser referenciada dentro de callbacks
// PocketBase JSVM executa callbacks em pools isolados. Todas as funções auxiliares e variáveis
// devem ser declaradas INLINE dentro do corpo de cada callback.

// --------------------------------------------------------------------------
// 1. ROTA POST /backend/v1/flexsmart/start-sync
// Inicia sincronização (modo day_by_day ou single_date)
// --------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/flexsmart/start-sync', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado' })
  }

  // Funções utilitárias inline
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

  const parseBrDateToUtcMidnight = (brStr) => {
    if (!brStr || typeof brStr !== 'string') return null
    const cleaned = brStr.trim()
    const parts = cleaned.split('/')
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const y = parseInt(parts[2], 10)
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return new Date(Date.UTC(y, m - 1, d))
      }
    }
    const isoParts = cleaned.split('-')
    if (isoParts.length === 3) {
      const y = parseInt(isoParts[0], 10)
      const m = parseInt(isoParts[1], 10)
      const d = parseInt(isoParts[2], 10)
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return new Date(Date.UTC(y, m - 1, d))
      }
    }
    return null
  }

  const formatUtcMidnightToBr = (dt) => {
    if (!dt || isNaN(dt.getTime())) return ''
    return pad2(dt.getUTCDate()) + '/' + pad2(dt.getUTCMonth() + 1) + '/' + dt.getUTCFullYear()
  }

  // Ler body de forma resiliente
  let reqBody = {}
  try {
    if (reqInfo && reqInfo.body && typeof reqInfo.body === 'object') {
      reqBody = reqInfo.body
    }
  } catch (_) {}

  // Determinar modo: day_by_day ou single_date
  const isDayByDay =
    reqBody.mode === 'day_by_day' ||
    reqBody.fullSync === true ||
    (reqBody.startDate &&
      typeof reqBody.startDate === 'string' &&
      reqBody.startDate.trim().length > 0)

  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000)

  let syncMode = 'single_date'
  let isFullSync = false
  let syncStartDate = ''
  let targetDate = ''
  let totalDays = 1
  let currentDayDate = ''

  if (isDayByDay) {
    syncMode = 'day_by_day'
    isFullSync = true
    const parsedStart =
      parseBrDateToUtcMidnight(reqBody.startDate) || new Date(Date.UTC(2026, 8, 1)) // 01/09/2026 default
    syncStartDate = formatUtcMidnightToBr(parsedStart)
    currentDayDate = syncStartDate
    targetDate = formatUtcMidnightToBr(todayUtc)

    // Calcular dias totais entre parsedStart e todayUtc
    const diffMs = todayUtc.getTime() - parsedStart.getTime()
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1
    totalDays = diffDays > 0 ? diffDays : 1
  } else {
    syncMode = 'single_date'
    isFullSync = false
    let chosenDate = yesterdayUtc
    if (reqBody.date && typeof reqBody.date === 'string') {
      const parsed = parseBrDateToUtcMidnight(reqBody.date)
      if (parsed) {
        chosenDate = parsed
      }
    }
    targetDate = formatUtcMidnightToBr(chosenDate)
    syncStartDate = targetDate
    currentDayDate = targetDate
    totalDays = 1
  }

  // Cancelar processos anteriores em execução ou pendentes do mesmo owner
  try {
    const runningJobs = $app.findRecordsByFilter(
      'flex_sync',
      `owner = '${authUser.id}' && (status = 'running' || status = 'pending' || status = 'cancelling')`,
      '-created',
      50,
      0,
    )
    for (let i = 0; i < runningJobs.length; i++) {
      const job = runningJobs[i]
      job.set('status', 'cancelled')
      job.set('current_step', 'Cancelado ao iniciar nova importação.')
      job.set('finished_at', new Date().toISOString())
      $app.save(job)
    }
  } catch (cleanErr) {
    console.log('[FlexSmart start-sync] Aviso ao limpar jobs antigos:', String(cleanErr))
  }

  // Criar novo registro de sync
  try {
    const collection = $app.findCollectionByNameOrId('flex_sync')
    const syncRecord = new Record(collection)
    syncRecord.set('owner', authUser.id)
    syncRecord.set('status', 'pending')
    syncRecord.set('started_at', new Date().toISOString())
    syncRecord.set('count', 0)
    syncRecord.set('imported', 0)
    syncRecord.set('created_count', 0)
    syncRecord.set('updated_count', 0)
    syncRecord.set('sync_mode', syncMode)
    syncRecord.set('is_full_sync', isFullSync)
    syncRecord.set('sync_start_date', syncStartDate)
    syncRecord.set('sync_date', targetDate)
    syncRecord.set('total_days', totalDays)
    syncRecord.set('processed_days', 0)
    syncRecord.set('current_day_date', currentDayDate)
    syncRecord.set(
      'current_step',
      syncMode === 'day_by_day'
        ? 'Iniciando carga dia a dia (' + syncStartDate + ' → hoje, ' + totalDays + ' dias)...'
        : 'Aguardando busca de clientes alterados desde ' + targetDate + '...',
    )
    $app.save(syncRecord)

    console.log(
      '[FlexSmart] Novo job de sincronização criado: ' +
        syncRecord.id +
        ' modo=' +
        syncMode +
        ' totalDays=' +
        totalDays +
        ' syncStartDate=' +
        syncStartDate +
        ' syncDate=' +
        targetDate,
    )

    return e.json(200, {
      success: true,
      syncId: syncRecord.id,
      status: 'pending',
      targetDate: targetDate,
      syncStartDate: syncStartDate,
      totalDays: totalDays,
      syncMode: syncMode,
      isFullSync: isFullSync,
      message:
        syncMode === 'day_by_day'
          ? 'Carga dia a dia criada com sucesso. Processamento sequencial dia a dia iniciado.'
          : 'Sincronização para data ' + targetDate + ' criada com sucesso.',
    })
  } catch (err) {
    console.log('[FlexSmart start-sync] Erro ao criar registro:', String(err))
    return e.json(500, {
      success: false,
      message: 'Erro interno ao inicializar sincronização: ' + String(err),
    })
  }
})

// --------------------------------------------------------------------------
// 2. ROTA POST /backend/v1/flexsmart/step-sync/{id}
// Executa 1 passo: no modo day_by_day avança 1 dia; no modo single_date executa o dia único.
// --------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/flexsmart/step-sync/{id}', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado' })
  }

  const syncId = e.request.pathValue('id')
  if (!syncId) {
    return e.json(400, { success: false, message: 'ID da sincronização não fornecido' })
  }

  let syncRecord
  try {
    syncRecord = $app.findRecordById('flex_sync', syncId)
  } catch (_) {
    return e.json(404, { success: false, message: 'Registro de sincronização não encontrado' })
  }

  if (syncRecord.getString('owner') !== authUser.id) {
    return e.json(403, { success: false, message: 'Acesso não autorizado a esta sincronização' })
  }

  const currentStatus = syncRecord.getString('status')
  if (currentStatus === 'cancelled' || currentStatus === 'cancelling') {
    return e.json(200, {
      success: true,
      status: 'cancelled',
      done: true,
      message: 'Sincronização interrompida pelo usuário.',
    })
  }
  if (currentStatus === 'done') {
    return e.json(200, {
      success: true,
      status: 'done',
      done: true,
      processedDays: syncRecord.getInt('processed_days'),
      totalDays: syncRecord.getInt('total_days'),
    })
  }
  if (currentStatus === 'error') {
    return e.json(200, {
      success: false,
      status: 'error',
      done: true,
      error: syncRecord.getString('error'),
    })
  }

  // Funções utilitárias inline para datas
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

  const parseBrDateToUtcMidnight = (brStr) => {
    if (!brStr || typeof brStr !== 'string') return null
    const cleaned = brStr.trim()
    const parts = cleaned.split('/')
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const y = parseInt(parts[2], 10)
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return new Date(Date.UTC(y, m - 1, d))
      }
    }
    const isoParts = cleaned.split('-')
    if (isoParts.length === 3) {
      const y = parseInt(isoParts[0], 10)
      const m = parseInt(isoParts[1], 10)
      const d = parseInt(isoParts[2], 10)
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return new Date(Date.UTC(y, m - 1, d))
      }
    }
    return null
  }

  const formatUtcMidnightToBr = (dt) => {
    if (!dt || isNaN(dt.getTime())) return ''
    return pad2(dt.getUTCDate()) + '/' + pad2(dt.getUTCMonth() + 1) + '/' + dt.getUTCFullYear()
  }

  const cleanDigits = (v) => {
    if (!v) return ''
    return String(v).replace(/\D/g, '')
  }

  const isValidEmail = (em) => {
    if (!em || typeof em !== 'string') return false
    const trimmed = em.trim()
    if (trimmed.length < 5 || trimmed.length > 254) return false
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(trimmed)
  }

  // Determinar o dia a processar neste passo
  const syncMode = syncRecord.getString('sync_mode') || 'single_date'
  const isDayByDay = syncMode === 'day_by_day' || syncRecord.getBool('is_full_sync')
  const totalDays = syncRecord.getInt('total_days') || 1
  let processedDays = syncRecord.getInt('processed_days') || 0

  let dayDateToFetch = ''
  if (isDayByDay) {
    const startDateStr = syncRecord.getString('sync_start_date') || '01/09/2026'
    const startUtc = parseBrDateToUtcMidnight(startDateStr) || new Date(Date.UTC(2026, 8, 1))
    const currentDayUtc = new Date(startUtc.getTime() + processedDays * 24 * 60 * 60 * 1000)
    dayDateToFetch = formatUtcMidnightToBr(currentDayUtc)
  } else {
    dayDateToFetch = syncRecord.getString('sync_date') || '25/10/2026'
  }

  // Atualizar status para running
  syncRecord.set('status', 'running')
  syncRecord.set('current_day_date', dayDateToFetch)
  syncRecord.set(
    'current_step',
    isDayByDay
      ? 'Processando dia ' +
          dayDateToFetch +
          ' (' +
          (processedDays + 1) +
          ' de ' +
          totalDays +
          ' dias)...'
      : 'Buscando clientes alterados desde ' + dayDateToFetch + '...',
  )
  $app.save(syncRecord)

  // Realizar Login no ERP
  const username =
    $os.getenv('FLEXSMART_USERNAME') ||
    ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '') ||
    'JACSON'
  const password =
    $os.getenv('FLEXSMART_PASSWORD') ||
    ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '') ||
    'sc@p1neL'
  const rawBase =
    $os.getenv('FLEXSMART_BASE_URL') ||
    ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
    'https://api.impave.com.br:8443'
  const base = rawBase.replace(/\/+$/, '')

  let token = ''
  try {
    const loginRes = $http.send({
      url: base + '/login?Content-Type=application/json',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
      timeout: 30,
    })

    let pj = loginRes.json
    if (!pj && loginRes.raw) {
      try {
        pj = JSON.parse(loginRes.raw)
      } catch (_) {}
    }
    if (pj && pj.access_token) {
      token = pj.access_token
    }
  } catch (loginErr) {
    console.log('[FlexSmart step-sync] Falha no login do ERP:', String(loginErr))
    syncRecord.set('status', 'error')
    syncRecord.set('error', 'Falha ao autenticar no ERP FlexSmart: ' + String(loginErr))
    syncRecord.set('finished_at', new Date().toISOString())
    $app.save(syncRecord)
    return e.json(500, { success: false, status: 'error', error: 'Falha no login do ERP' })
  }

  if (!token) {
    syncRecord.set('status', 'error')
    syncRecord.set('error', 'Login no ERP não retornou access_token válido.')
    syncRecord.set('finished_at', new Date().toISOString())
    $app.save(syncRecord)
    return e.json(500, { success: false, status: 'error', error: 'Token de autenticação ausente' })
  }

  // Fazer requisição GET /Cliente/getByDtAtz?data=DD/MM/AAAA
  let erpItems = []
  try {
    console.log(
      '[FlexSmart ' + syncId + '] [Dia ' + dayDateToFetch + '] Buscando clientes alterados...',
    )
    const fetchRes = $http.send({
      url: base + '/Cliente/getByDtAtz?data=' + encodeURIComponent(dayDateToFetch),
      method: 'GET',
      headers: {
        AuthToken: token,
        Accept: 'application/json',
      },
      timeout: 60,
    })

    if (fetchRes.statusCode !== 200) {
      console.log(
        '[FlexSmart ' +
          syncId +
          '] [Dia ' +
          dayDateToFetch +
          '] Resposta ERP status: ' +
          fetchRes.statusCode,
      )
    }

    if (Array.isArray(fetchRes.json)) {
      erpItems = fetchRes.json
    } else if (fetchRes.raw) {
      try {
        const parsed = JSON.parse(fetchRes.raw)
        if (Array.isArray(parsed)) {
          erpItems = parsed
        }
      } catch (_) {}
    }
  } catch (fetchErr) {
    console.log(
      '[FlexSmart ' + syncId + '] [Dia ' + dayDateToFetch + '] Erro na requisição:',
      String(fetchErr),
    )
    // Não abortamos o processo inteiro se um dia falhar de rede; registramos e seguimos
  }

  console.log(
    '[FlexSmart ' +
      syncId +
      '] [Dia ' +
      dayDateToFetch +
      '] Registros recebidos do ERP: ' +
      erpItems.length,
  )

  // Salvar / atualizar clientes no banco local
  let dayCreated = 0
  let dayUpdated = 0

  for (let i = 0; i < erpItems.length; i++) {
    const item = erpItems[i]
    if (!item) continue

    const erpCode =
      item.cdCliente !== undefined && item.cdCliente !== null ? String(item.cdCliente) : ''
    const rawName = item.nmCliente || item.nmFantasia || item.razaoSocial || item.nome || ''
    const name = String(rawName).trim()
    if (!name || name.length < 2) continue

    const rawDoc = item.cnpjCpf || item.nuCpfCnpj || item.cpfCnpj || item.documento || ''
    const cleanDoc = cleanDigits(rawDoc)

    const rawEmail = item.email || item.nmEmail || item.dsEmail || ''
    const validEmail = isValidEmail(rawEmail) ? String(rawEmail).trim().toLowerCase() : ''

    const rawPhone = item.telefone || item.nuTelefone || item.celular || item.fone || ''
    const cleanPhone = cleanDigits(rawPhone)

    const address = String(item.endereco || item.dsEndereco || item.logradouro || '').trim()
    const city = String(
      item.cidade && item.cidade.nmCidade
        ? item.cidade.nmCidade
        : item.cidade || item.nmCidade || '',
    ).trim()
    const state = String(
      item.cidade && item.cidade.uf ? item.cidade.uf : item.uf || item.estado || '',
    ).trim()

    // Busca cliente existente por erp_code ou por documento ou por nome idêntico
    let existingClient = null

    if (erpCode) {
      try {
        existingClient = $app.findFirstRecordByFilter(
          'clients',
          `owner = '${authUser.id}' && erp_code = '${erpCode}'`,
        )
      } catch (_) {}
    }

    if (!existingClient && cleanDoc) {
      try {
        existingClient = $app.findFirstRecordByFilter(
          'clients',
          `owner = '${authUser.id}' && document = '${cleanDoc}'`,
        )
      } catch (_) {}
    }

    if (!existingClient && name) {
      try {
        const safeName = name.replace(/'/g, "\\'")
        existingClient = $app.findFirstRecordByFilter(
          'clients',
          `owner = '${authUser.id}' && name = '${safeName}'`,
        )
      } catch (_) {}
    }

    try {
      if (existingClient) {
        let changed = false
        if (erpCode && existingClient.getString('erp_code') !== erpCode) {
          existingClient.set('erp_code', erpCode)
          changed = true
        }
        if (cleanDoc && existingClient.getString('document') !== cleanDoc) {
          existingClient.set('document', cleanDoc)
          changed = true
        }
        if (validEmail && existingClient.getString('email') !== validEmail) {
          existingClient.set('email', validEmail)
          changed = true
        }
        if (cleanPhone && existingClient.getString('phone') !== cleanPhone) {
          existingClient.set('phone', cleanPhone)
          changed = true
        }
        if (address && existingClient.getString('address') !== address) {
          existingClient.set('address', address)
          changed = true
        }
        if (city && existingClient.getString('city') !== city) {
          existingClient.set('city', city)
          changed = true
        }
        if (state && existingClient.getString('state') !== state) {
          existingClient.set('state', state)
          changed = true
        }
        if (changed) {
          $app.save(existingClient)
        }
        dayUpdated++
      } else {
        const clientsCol = $app.findCollectionByNameOrId('clients')
        const newClient = new Record(clientsCol)
        newClient.set('owner', authUser.id)
        newClient.set('name', name)
        if (erpCode) newClient.set('erp_code', erpCode)
        if (cleanDoc) newClient.set('document', cleanDoc)
        if (validEmail) newClient.set('email', validEmail)
        if (cleanPhone) newClient.set('phone', cleanPhone)
        if (address) newClient.set('address', address)
        if (city) newClient.set('city', city)
        if (state) newClient.set('state', state)
        $app.save(newClient)
        dayCreated++
      }
    } catch (saveClientErr) {
      console.log(
        '[FlexSmart] Erro ao gravar cliente ' + name + ' (erpCode=' + erpCode + '):',
        String(saveClientErr),
      )
    }
  }

  // Atualizar contadores acumulados no flex_sync
  processedDays = processedDays + 1
  const prevCount = syncRecord.getInt('count') || 0
  const prevImported = syncRecord.getInt('imported') || 0
  const prevCreated = syncRecord.getInt('created_count') || 0
  const prevUpdated = syncRecord.getInt('updated_count') || 0

  const totalAccumCount = prevCount + erpItems.length
  const totalAccumImported = prevImported + dayCreated + dayUpdated
  const totalAccumCreated = prevCreated + dayCreated
  const totalAccumUpdated = prevUpdated + dayUpdated

  syncRecord.set('count', totalAccumCount)
  syncRecord.set('imported', totalAccumImported)
  syncRecord.set('created_count', totalAccumCreated)
  syncRecord.set('updated_count', totalAccumUpdated)
  syncRecord.set('processed_days', processedDays)

  if (erpItems.length > 0 && !syncRecord.getString('sample')) {
    try {
      syncRecord.set('sample', erpItems[0])
    } catch (_) {}
  }

  const isDone = !isDayByDay || processedDays >= totalDays

  if (isDone) {
    syncRecord.set('status', 'done')
    syncRecord.set('finished_at', new Date().toISOString())
    syncRecord.set(
      'current_step',
      isDayByDay
        ? 'Concluído! Todos os ' +
            totalDays +
            ' dias sincronizados: ' +
            totalAccumCreated +
            ' novos, ' +
            totalAccumUpdated +
            ' atualizados.'
        : 'Concluído! ' +
            totalAccumCreated +
            ' novos, ' +
            totalAccumUpdated +
            ' atualizados (data base ' +
            dayDateToFetch +
            ').',
    )
    console.log(
      '[FlexSmart ' +
        syncId +
        '] Finalizado com sucesso: total=' +
        totalAccumCount +
        ', criados=' +
        totalAccumCreated +
        ', atualizados=' +
        totalAccumUpdated,
    )
  } else {
    // Próximo dia
    const startDateStr = syncRecord.getString('sync_start_date') || '01/09/2026'
    const startUtc = parseBrDateToUtcMidnight(startDateStr) || new Date(Date.UTC(2026, 8, 1))
    const nextDayUtc = new Date(startUtc.getTime() + processedDays * 24 * 60 * 60 * 1000)
    const nextDayDateStr = formatUtcMidnightToBr(nextDayUtc)

    syncRecord.set('current_day_date', nextDayDateStr)
    syncRecord.set(
      'current_step',
      'Dia ' +
        dayDateToFetch +
        ' finalizado (' +
        erpItems.length +
        ' clientes). Avançando para dia ' +
        nextDayDateStr +
        ' (' +
        (processedDays + 1) +
        ' de ' +
        totalDays +
        ' dias)...',
    )
  }

  $app.save(syncRecord)

  return e.json(200, {
    success: true,
    status: isDone ? 'done' : 'running',
    done: isDone,
    processedDays: processedDays,
    totalDays: totalDays,
    currentDayDate: dayDateToFetch,
    createdCount: totalAccumCreated,
    updatedCount: totalAccumUpdated,
    totalCount: totalAccumCount,
    message: isDone
      ? 'Sincronização concluída com sucesso'
      : 'Passo do dia ' + dayDateToFetch + ' concluído',
  })
})

// --------------------------------------------------------------------------
// 3. ROTA POST /backend/v1/flexsmart/cancel-sync/{id}
// Interrompe a importação imediatamente mantendo os dados já importados
// --------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/flexsmart/cancel-sync/{id}', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado' })
  }

  const syncId = e.request.pathValue('id')
  if (!syncId) {
    return e.json(400, { success: false, message: 'ID da sincronização não fornecido' })
  }

  let syncRecord
  try {
    syncRecord = $app.findRecordById('flex_sync', syncId)
  } catch (_) {
    return e.json(404, { success: false, message: 'Registro de sincronização não encontrado' })
  }

  if (syncRecord.getString('owner') !== authUser.id) {
    return e.json(403, { success: false, message: 'Acesso não autorizado' })
  }

  const st = syncRecord.getString('status')
  if (st === 'done' || st === 'cancelled' || st === 'error') {
    return e.json(200, {
      success: true,
      status: st,
      message: 'Sincronização já se encontra em estado terminal (' + st + ').',
    })
  }

  syncRecord.set('status', 'cancelled')
  syncRecord.set('finished_at', new Date().toISOString())
  syncRecord.set('current_step', 'Importação interrompida pelo usuário.')
  $app.save(syncRecord)

  console.log('[FlexSmart ' + syncId + '] Interrupção solicitada e aplicada com sucesso.')

  return e.json(200, {
    success: true,
    status: 'cancelled',
    message: 'Importação interrompida. Todos os clientes já salvos foram mantidos.',
  })
})

// --------------------------------------------------------------------------
// 4. ROTA GET /backend/v1/flexsmart/sync-status/{id}
// Retorna o status detalhado de um job de sincronização
// --------------------------------------------------------------------------
routerAdd('GET', '/backend/v1/flexsmart/sync-status/{id}', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado' })
  }

  const syncId = e.request.pathValue('id')
  if (!syncId) {
    return e.json(400, { success: false, message: 'ID da sincronização não fornecido' })
  }

  let syncRecord
  try {
    syncRecord = $app.findRecordById('flex_sync', syncId)
  } catch (_) {
    return e.json(404, { success: false, message: 'Registro de sincronização não encontrado' })
  }

  if (syncRecord.getString('owner') !== authUser.id) {
    return e.json(403, { success: false, message: 'Acesso não autorizado' })
  }

  const status = syncRecord.getString('status')
  const count = syncRecord.getInt('count') || 0
  const imported = syncRecord.getInt('imported') || 0
  const createdCount = syncRecord.getInt('created_count') || 0
  const updatedCount = syncRecord.getInt('updated_count') || 0
  const totalDays = syncRecord.getInt('total_days') || 1
  const processedDays = syncRecord.getInt('processed_days') || 0
  const syncMode = syncRecord.getString('sync_mode') || 'single_date'
  const isFullSync = syncRecord.getBool('is_full_sync')

  let percent = 0
  if (syncMode === 'day_by_day' || isFullSync) {
    percent = totalDays > 0 ? Math.min(100, Math.round((processedDays / totalDays) * 100)) : 0
  } else {
    percent = count > 0 ? Math.min(100, Math.round((imported / count) * 100)) : 0
  }

  if (status === 'done') percent = 100

  return e.json(200, {
    id: syncRecord.id,
    status: status,
    currentStep: syncRecord.getString('current_step'),
    count: count,
    imported: imported,
    createdCount: createdCount,
    updatedCount: updatedCount,
    percent: percent,
    error: syncRecord.getString('error'),
    syncDate: syncRecord.getString('sync_date'),
    syncStartDate: syncRecord.getString('sync_start_date'),
    totalDays: totalDays,
    processedDays: processedDays,
    currentDayDate: syncRecord.getString('current_day_date'),
    syncMode: syncMode,
    isFullSync: isFullSync,
    startedAt: syncRecord.getString('started_at'),
    finishedAt: syncRecord.getString('finished_at'),
    created: syncRecord.getString('created'),
    updated: syncRecord.getString('updated'),
  })
})

// --------------------------------------------------------------------------
// 5. ROTA GET /backend/v1/flexsmart/last-sync
// Retorna a última sincronização do usuário autenticado
// --------------------------------------------------------------------------
routerAdd('GET', '/backend/v1/flexsmart/last-sync', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado' })
  }

  const pad2 = (n) => (n < 10 ? '0' + n : '' + n)
  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000)

  const todayStr =
    pad2(todayUtc.getUTCDate()) +
    '/' +
    pad2(todayUtc.getUTCMonth() + 1) +
    '/' +
    todayUtc.getUTCFullYear()
  const yesterdayStr =
    pad2(yesterdayUtc.getUTCDate()) +
    '/' +
    pad2(yesterdayUtc.getUTCMonth() + 1) +
    '/' +
    yesterdayUtc.getUTCFullYear()

  let lastSyncRecord = null
  try {
    lastSyncRecord = $app.findFirstRecordByFilter(
      'flex_sync',
      `owner = '${authUser.id}'`,
      '-created',
    )
  } catch (_) {}

  if (!lastSyncRecord) {
    return e.json(200, {
      lastSync: {
        id: '',
        status: 'done',
        currentStep: 'Nenhuma sincronização anterior registrada.',
        count: 0,
        imported: 0,
        createdCount: 0,
        updatedCount: 0,
        percent: 0,
        todayDate: todayStr,
        yesterdayDate: yesterdayStr,
      },
    })
  }

  const status = lastSyncRecord.getString('status')
  const count = lastSyncRecord.getInt('count') || 0
  const imported = lastSyncRecord.getInt('imported') || 0
  const createdCount = lastSyncRecord.getInt('created_count') || 0
  const updatedCount = lastSyncRecord.getInt('updated_count') || 0
  const totalDays = lastSyncRecord.getInt('total_days') || 1
  const processedDays = lastSyncRecord.getInt('processed_days') || 0
  const syncMode = lastSyncRecord.getString('sync_mode') || 'single_date'
  const isFullSync = lastSyncRecord.getBool('is_full_sync')

  let percent = 0
  if (syncMode === 'day_by_day' || isFullSync) {
    percent = totalDays > 0 ? Math.min(100, Math.round((processedDays / totalDays) * 100)) : 0
  } else {
    percent = count > 0 ? Math.min(100, Math.round((imported / count) * 100)) : 0
  }
  if (status === 'done') percent = 100

  return e.json(200, {
    lastSync: {
      id: lastSyncRecord.id,
      status: status,
      currentStep: lastSyncRecord.getString('current_step'),
      count: count,
      imported: imported,
      createdCount: createdCount,
      updatedCount: updatedCount,
      percent: percent,
      error: lastSyncRecord.getString('error'),
      syncDate: lastSyncRecord.getString('sync_date'),
      syncStartDate: lastSyncRecord.getString('sync_start_date'),
      totalDays: totalDays,
      processedDays: processedDays,
      currentDayDate: lastSyncRecord.getString('current_day_date'),
      syncMode: syncMode,
      isFullSync: isFullSync,
      todayDate: todayStr,
      yesterdayDate: yesterdayStr,
      startedAt: lastSyncRecord.getString('started_at'),
      finishedAt: lastSyncRecord.getString('finished_at'),
      created: lastSyncRecord.getString('created'),
      updated: lastSyncRecord.getString('updated'),
    },
  })
})

// --------------------------------------------------------------------------
// 6. ROTA GET /backend/v1/flexsmart/test-by-date (Diagnóstico sob demanda)
// --------------------------------------------------------------------------
routerAdd('GET', '/backend/v1/flexsmart/test-by-date', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado' })
  }

  const queryDate = reqInfo.query && reqInfo.query.data ? String(reqInfo.query.data) : '26/10/2026'

  const username =
    $os.getenv('FLEXSMART_USERNAME') ||
    ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '') ||
    'JACSON'
  const password =
    $os.getenv('FLEXSMART_PASSWORD') ||
    ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '') ||
    'sc@p1neL'
  const rawBase =
    $os.getenv('FLEXSMART_BASE_URL') ||
    ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
    'https://api.impave.com.br:8443'
  const base = rawBase.replace(/\/+$/, '')

  try {
    const loginRes = $http.send({
      url: base + '/login?Content-Type=application/json',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
      timeout: 30,
    })

    let pj = loginRes.json
    if (!pj && loginRes.raw) {
      try {
        pj = JSON.parse(loginRes.raw)
      } catch (_) {}
    }
    const token = pj && pj.access_token ? pj.access_token : ''
    if (!token) {
      return e.json(500, {
        success: false,
        error: 'Login falhou',
        loginStatus: loginRes.statusCode,
      })
    }

    const t0 = Date.now()
    const getRes = $http.send({
      url: base + '/Cliente/getByDtAtz?data=' + encodeURIComponent(queryDate),
      method: 'GET',
      headers: {
        AuthToken: token,
        Accept: 'application/json',
      },
      timeout: 60,
    })
    const t1 = Date.now()

    let items = []
    if (Array.isArray(getRes.json)) {
      items = getRes.json
    } else if (getRes.raw) {
      try {
        const parsed = JSON.parse(getRes.raw)
        if (Array.isArray(parsed)) items = parsed
      } catch (_) {}
    }

    return e.json(200, {
      success: true,
      queryDate: queryDate,
      statusCode: getRes.statusCode,
      count: items.length,
      durationMs: t1 - t0,
      sample: items.length > 0 ? items[0] : null,
    })
  } catch (err) {
    return e.json(500, {
      success: false,
      error: String(err),
    })
  }
})

// --------------------------------------------------------------------------
// 7. ROTA POST /backend/v1/flexsmart/sync (legada para retrocompatibilidade)
// --------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/flexsmart/sync', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  if (!authUser) {
    return e.json(401, { success: false, message: 'Usuário não autenticado' })
  }

  return e.json(200, {
    success: true,
    totalErp: 0,
    created: 0,
    updated: 0,
    errors: 0,
    message: 'Use a rota /backend/v1/flexsmart/start-sync para sincronização resiliente.',
  })
})
