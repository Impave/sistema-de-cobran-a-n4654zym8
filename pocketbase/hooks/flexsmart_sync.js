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

  // Limpar e cancelar processos anteriores em andamento para evitar bloqueios órfãos:
  // 1. Processos do próprio usuário autenticado são cancelados para dar lugar ao novo.
  // 2. Qualquer processo em andamento no sistema inativo há mais de 30 minutos é finalizado como failed por inatividade.
  try {
    const activeGlobalJobs = $app.findRecordsByFilter(
      'flex_sync',
      "status = 'running' || status = 'pending' || status = 'cancelling'",
      '-created',
      50,
      0,
    )
    const nowMs = Date.now()
    const staleThresholdMs = 30 * 60 * 1000 // 30 minutos

    for (let i = 0; i < activeGlobalJobs.length; i++) {
      const job = activeGlobalJobs[i]
      const jobOwner = job.getString('owner')
      const updatedStr = job.getString('updated') || job.getString('created')
      let isStale = false
      if (updatedStr) {
        const updatedTime = new Date(updatedStr).getTime()
        if (!isNaN(updatedTime) && nowMs - updatedTime >= staleThresholdMs) {
          isStale = true
        }
      }

      if (jobOwner === authUser.id) {
        // Job do próprio usuário: cancela para iniciar a nova importação
        job.set('status', 'cancelled')
        job.set('current_step', 'Cancelado ao iniciar nova importação.')
        job.set('finished_at', new Date().toISOString())
        $app.save(job)
      } else if (isStale) {
        // Job travado de outro usuário/cron: finaliza por inatividade
        job.set('status', 'failed')
        job.set('error', 'finalizado automaticamente por inatividade')
        job.set('current_step', 'Finalizado automaticamente por inatividade.')
        job.set('finished_at', new Date().toISOString())
        $app.save(job)
        console.log(
          '[FlexSmart start-sync] Job travado ' +
            job.id +
            ' finalizado automaticamente por inatividade.',
        )
      }
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
  if (currentStatus === 'error' || currentStatus === 'failed') {
    return e.json(200, {
      success: false,
      status: currentStatus,
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

  // Função utilitária de espera síncrona segura no JSVM
  const delayMs = (ms) => {
    try {
      if (typeof sleep === 'function') {
        sleep(ms)
        return
      }
    } catch (_) {}
    const start = Date.now()
    while (Date.now() - start < ms) {
      // laço síncrono de espera caso a global sleep não esteja exposta no runtime
    }
  }

  // Realizar Login no ERP com retentativas resilientes (até 3 tentativas)
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
  let lastLoginError = ''
  const maxLoginAttempts = 3
  const loginWaitTimesMs = [5000, 10000]

  for (let attempt = 1; attempt <= maxLoginAttempts; attempt++) {
    try {
      console.log(
        '[FlexSmart step-sync] Tentativa ' +
          attempt +
          '/' +
          maxLoginAttempts +
          ' de login no ERP FlexSmart (timeout 120s)...',
      )
      const loginRes = $http.send({
        url: base + '/login?Content-Type=application/json',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
        timeout: 120,
      })

      // Se retornou código HTTP com erro
      if (loginRes.statusCode !== 200) {
        lastLoginError = 'HTTP ' + loginRes.statusCode + (loginRes.raw ? ': ' + loginRes.raw : '')
        console.log(
          '[FlexSmart step-sync] Resposta de login do ERP diferente de 200: ' + lastLoginError,
        )
        // Erro 401 ou 400 indica credenciais inválidas ou erro de requisição do cliente: não adianta retentar
        if (
          loginRes.statusCode === 401 ||
          loginRes.statusCode === 400 ||
          loginRes.statusCode === 403
        ) {
          break
        }
      } else {
        let pj = loginRes.json
        if (!pj && loginRes.raw) {
          try {
            pj = JSON.parse(loginRes.raw)
          } catch (_) {}
        }
        if (pj && pj.access_token) {
          token = pj.access_token
          break
        } else {
          lastLoginError = 'Resposta 200 sem access_token válido'
        }
      }
    } catch (loginErr) {
      lastLoginError = String(loginErr)
      console.log(
        '[FlexSmart step-sync] Falha na tentativa ' + attempt + ' de login no ERP:',
        lastLoginError,
      )
    }

    if (!token && attempt < maxLoginAttempts) {
      const waitTime = loginWaitTimesMs[attempt - 1] || 5000
      console.log(
        '[FlexSmart step-sync] Aguardando ' +
          waitTime / 1000 +
          's antes da próxima tentativa de login no ERP...',
      )
      delayMs(waitTime)
    }
  }

  if (!token) {
    const errorMsg =
      'Falha ao autenticar no ERP FlexSmart após ' +
      maxLoginAttempts +
      ' tentativas: ' +
      lastLoginError
    console.log('[FlexSmart step-sync] ' + errorMsg)
    syncRecord.set('status', 'error')
    syncRecord.set('error', errorMsg)
    syncRecord.set('finished_at', new Date().toISOString())
    $app.save(syncRecord)
    return e.json(500, { success: false, status: 'error', error: errorMsg })
  }

  // Fazer requisição GET /Cliente/getByDtAtz?data=DD/MM/AAAA (timeout 120s)
  let erpItems = []
  try {
    console.log(
      '[FlexSmart ' +
        syncId +
        '] [Dia ' +
        dayDateToFetch +
        '] Buscando clientes alterados (timeout 120s)...',
    )
    const fetchRes = $http.send({
      url: base + '/Cliente/getByDtAtz?data=' + encodeURIComponent(dayDateToFetch),
      method: 'GET',
      headers: {
        AuthToken: token,
        Accept: 'application/json',
      },
      timeout: 120,
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

    const codCliente =
      item.cdCliente !== undefined && item.cdCliente !== null ? String(item.cdCliente).trim() : ''
    const rawName = item.nmCliente || item.nmFantasia || item.nome || ''
    const nomeCliente = String(rawName).trim()
    if (!nomeCliente || nomeCliente.length < 2) continue

    const rawRazaoSocial = item.razaoSocial || item.nmRazaoSocial || item.nmCliente || ''
    const razaoSocial = String(rawRazaoSocial).trim()

    const rawDoc = item.cnpjCpf || item.nuCpfCnpj || item.cpfCnpj || item.documento || ''
    const cleanDoc = cleanDigits(rawDoc)

    const rawEmail1 = item.email || item.nmEmail || item.dsEmail || ''
    const email1 = isValidEmail(rawEmail1) ? String(rawEmail1).trim().toLowerCase() : ''
    const email2 = isValidEmail(item.email2) ? String(item.email2).trim().toLowerCase() : ''
    const email3 = isValidEmail(item.email3) ? String(item.email3).trim().toLowerCase() : ''

    const rawContato1 = item.celular || item.fone || item.telefone || item.nuTelefone || ''
    const contato1 = cleanDigits(rawContato1)
    const rawContato2 = item.contato2 || item.telefone2 || item.fone2 || ''
    const contato2 = cleanDigits(rawContato2)

    const bairro = String(item.bairro || item.nmBairro || '').trim()
    const cidade = String(
      item.cidade && item.cidade.nmCidade
        ? item.cidade.nmCidade
        : item.cidade || item.nmCidade || '',
    ).trim()
    const estado = String(
      item.cidade && item.cidade.uf ? item.cidade.uf : item.uf || item.estado || '',
    ).trim()

    // Busca cliente existente por cod_cliente ou por cnpj_cpf ou por nome_cliente idêntico
    let existingClient = null

    if (codCliente) {
      try {
        existingClient = $app.findFirstRecordByFilter(
          'clients',
          `owner = '${authUser.id}' && cod_cliente = '${codCliente}'`,
        )
      } catch (_) {}
    }

    if (!existingClient && cleanDoc) {
      try {
        existingClient = $app.findFirstRecordByFilter(
          'clients',
          `owner = '${authUser.id}' && cnpj_cpf = '${cleanDoc}'`,
        )
      } catch (_) {}
    }

    if (!existingClient && nomeCliente) {
      try {
        const safeName = nomeCliente.replace(/'/g, "\\'")
        existingClient = $app.findFirstRecordByFilter(
          'clients',
          `owner = '${authUser.id}' && nome_cliente = '${safeName}'`,
        )
      } catch (_) {}
    }

    try {
      if (existingClient) {
        let changed = false
        if (codCliente && existingClient.getString('cod_cliente') !== codCliente) {
          existingClient.set('cod_cliente', codCliente)
          changed = true
        }
        if (nomeCliente && existingClient.getString('nome_cliente') !== nomeCliente) {
          existingClient.set('nome_cliente', nomeCliente)
          changed = true
        }
        if (razaoSocial && existingClient.getString('razao_social') !== razaoSocial) {
          existingClient.set('razao_social', razaoSocial)
          changed = true
        }
        if (cleanDoc && existingClient.getString('cnpj_cpf') !== cleanDoc) {
          existingClient.set('cnpj_cpf', cleanDoc)
          changed = true
        }
        if (contato1 && existingClient.getString('contato1') !== contato1) {
          existingClient.set('contato1', contato1)
          changed = true
        }
        if (contato2 && existingClient.getString('contato2') !== contato2) {
          existingClient.set('contato2', contato2)
          changed = true
        }
        if (email1 && existingClient.getString('email1') !== email1) {
          existingClient.set('email1', email1)
          changed = true
        }
        if (email2 && existingClient.getString('email2') !== email2) {
          existingClient.set('email2', email2)
          changed = true
        }
        if (email3 && existingClient.getString('email3') !== email3) {
          existingClient.set('email3', email3)
          changed = true
        }
        if (bairro && existingClient.getString('bairro') !== bairro) {
          existingClient.set('bairro', bairro)
          changed = true
        }
        if (cidade && existingClient.getString('cidade') !== cidade) {
          existingClient.set('cidade', cidade)
          changed = true
        }
        if (estado && existingClient.getString('estado') !== estado) {
          existingClient.set('estado', estado)
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
        newClient.set('nome_cliente', nomeCliente)
        if (codCliente) newClient.set('cod_cliente', codCliente)
        if (razaoSocial) newClient.set('razao_social', razaoSocial)
        if (cleanDoc) newClient.set('cnpj_cpf', cleanDoc)
        if (contato1) newClient.set('contato1', contato1)
        if (contato2) newClient.set('contato2', contato2)
        if (email1) newClient.set('email1', email1)
        if (email2) newClient.set('email2', email2)
        if (email3) newClient.set('email3', email3)
        if (bairro) newClient.set('bairro', bairro)
        if (cidade) newClient.set('cidade', cidade)
        if (estado) newClient.set('estado', estado)
        $app.save(newClient)
        dayCreated++
      }
    } catch (saveClientErr) {
      console.log(
        '[FlexSmart] Erro ao gravar cliente ' + nomeCliente + ' (codCliente=' + codCliente + '):',
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
  if (st === 'done' || st === 'cancelled' || st === 'error' || st === 'failed') {
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
      timeout: 120,
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
      timeout: 120,
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

// --------------------------------------------------------------------------
// 8. ROTA GET /backend/v1/shared/clients
// Endpoint REST para disponibilizar lista de clientes para o projeto irmão "gestão de garantias impave"
//
// Autenticação suportada:
// 1. Authorization: Bearer <PocketBase auth token> (qualquer usuário autenticado ou o service user garantias-service@impave.com.br)
// 2. Header "X-Service-Key" ou "X-Api-Key" ou query param "apiKey" / "key" com a chave compartilhada: "impave-garantias-shared-key-2026"
// --------------------------------------------------------------------------
routerAdd('GET', '/backend/v1/shared/clients', (e) => {
  const reqInfo = e.requestInfo()
  const authUser = reqInfo.auth

  // Validação de acesso por Token de Auth OU Chave de API de Serviço
  const SHARED_SECRET_KEY = 'impave-garantias-shared-key-2026'

  let reqApiKey = ''
  try {
    if (reqInfo && reqInfo.headers) {
      reqApiKey =
        reqInfo.headers['x-service-key'] ||
        reqInfo.headers['x-api-key'] ||
        reqInfo.headers['X-Service-Key'] ||
        reqInfo.headers['X-Api-Key'] ||
        ''
    }
  } catch (_) {}

  if (!reqApiKey && reqInfo && reqInfo.query) {
    reqApiKey = reqInfo.query.apiKey || reqInfo.query.key || ''
  }

  const isKeyAuthorized = Boolean(reqApiKey && reqApiKey === SHARED_SECRET_KEY)
  const isAuthUserAuthorized = Boolean(authUser && authUser.id)

  if (!isKeyAuthorized && !isAuthUserAuthorized) {
    return e.json(401, {
      success: false,
      message:
        'Não autorizado. Forneça o token de autenticação via header Authorization ou a chave de serviço via header X-Service-Key.',
    })
  }

  // Parâmetros de paginação e busca
  const query = (reqInfo && reqInfo.query) || {}
  const page = parseInt(query.page, 10) > 0 ? parseInt(query.page, 10) : 1
  let perPage = parseInt(query.perPage, 10)
  if (isNaN(perPage) || perPage < 0) {
    perPage = 50
  } else if (perPage > 200) {
    perPage = 200
  }

  const sort =
    typeof query.sort === 'string' && query.sort.trim().length > 0
      ? query.sort.trim()
      : 'nome_cliente'
  const search = typeof query.search === 'string' ? query.search.trim() : ''

  // Montar filtro
  let filter = "id != ''"
  if (search) {
    const escaped = search.replace(/'/g, "\\'")
    filter =
      filter +
      " && (nome_cliente ~ '" +
      escaped +
      "' || razao_social ~ '" +
      escaped +
      "' || cnpj_cpf ~ '" +
      escaped +
      "' || cod_cliente ~ '" +
      escaped +
      "' || email1 ~ '" +
      escaped +
      "' || cidade ~ '" +
      escaped +
      "')"
  }

  try {
    const totalCount = $app.countRecords('clients', filter)

    let limit = perPage === 0 ? 1000 : perPage
    let offset = perPage === 0 ? 0 : (page - 1) * perPage

    const records = $app.findRecordsByFilter('clients', filter, sort, limit, offset)

    const items = []
    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      items.push({
        id: r.id,
        cod_cliente: r.getString('cod_cliente'),
        nome_cliente: r.getString('nome_cliente'),
        razao_social: r.getString('razao_social'),
        cnpj_cpf: r.getString('cnpj_cpf'),
        contato1: r.getString('contato1'),
        contato2: r.getString('contato2'),
        email1: r.getString('email1'),
        email2: r.getString('email2'),
        email3: r.getString('email3'),
        estado: r.getString('estado'),
        cidade: r.getString('cidade'),
        bairro: r.getString('bairro'),
        created: r.getString('created'),
        updated: r.getString('updated'),
      })
    }

    const totalPages = perPage > 0 ? Math.ceil(totalCount / perPage) : 1

    return e.json(200, {
      success: true,
      page: page,
      perPage: perPage,
      totalItems: totalCount,
      totalPages: totalPages,
      items: items,
    })
  } catch (err) {
    console.log('[shared_clients] Erro ao consultar clientes:', String(err))
    return e.json(500, {
      success: false,
      message: 'Erro interno ao consultar clientes compartilhados: ' + String(err),
    })
  }
})

// --------------------------------------------------------------------------
// 9. CRON AGENDADO: flexsmart_hourly_sync
//
// FUSO HORÁRIO E REGRAS DE EXECUÇÃO:
// O servidor PocketBase roda em UTC (verificado via logs do sistema).
// No Brasil (Horário de Brasília / America/Sao_Paulo), o fuso é UTC-3 (sem horário de verão).
//
// Janela solicitada: 09:00 às 19:00 de segunda a sexta-feira (Horário de Brasília).
// Em UTC correspondente:
//   09:00 BRT = 12:00 UTC
//   19:00 BRT = 22:00 UTC
//
// Configuração da expressão cron:
//   "0 12-22 * * 1-5" (minuto 0, horas 12 a 22 UTC, segunda a sexta)
//
// SEGURANÇA E GUARDRAILS ADICIONAIS:
// Mesmo com a expressão cron configurada, o callback revalida explicitamente:
// 1. O dia da semana no fuso de Brasília (UTC-3): deve ser 1 (segunda) até 5 (sexta).
// 2. A hora corrente no fuso de Brasília (UTC-3): deve estar entre 9 e 19 inclusive.
// 3. Se houver importação manual ou outro job em andamento (status pending/running/cancelling),
//    o job agendado pula a execução sem travar nem concorrer.
// 4. Executa a importação DO DIA corrente via GET /Cliente/getByDtAtz?data=DD/MM/AAAA.
// 5. Registra o resultado detalhado em flex_sync (auditado) e emite logs no servidor.
// --------------------------------------------------------------------------
cronAdd('flexsmart_hourly_sync', '0 12-22 * * 1-5', () => {
  // ATENÇÃO: Todas as funções auxiliares são declaradas INLINE para compatibilidade
  // com a JSVM isolada do PocketBase.

  const pad2 = (n) => (n < 10 ? '0' + n : '' + n)

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

  const delayMs = (ms) => {
    try {
      if (typeof sleep === 'function') {
        sleep(ms)
        return
      }
    } catch (_) {}
    const start = Date.now()
    while (Date.now() - start < ms) {}
  }

  // 1. Calcular data e hora local no fuso de Brasília (UTC - 3h)
  const now = new Date()
  const brtOffsetMs = 3 * 60 * 60 * 1000 // 3 horas a menos que UTC
  const brtTime = new Date(now.getTime() - brtOffsetMs)

  const brtDayOfWeek = brtTime.getUTCDay() // 0 = Domingo, 1 = Segunda, ..., 5 = Sexta, 6 = Sábado
  const brtHour = brtTime.getUTCHours() // 0 a 23
  const brtMinute = brtTime.getUTCMinutes()

  const dayDateStr =
    pad2(brtTime.getUTCDate()) +
    '/' +
    pad2(brtTime.getUTCMonth() + 1) +
    '/' +
    brtTime.getUTCFullYear()

  console.log(
    '[FlexSmart Cron] Disparo recebido: Horário Brasília ' +
      dayDateStr +
      ' ' +
      pad2(brtHour) +
      ':' +
      pad2(brtMinute) +
      ' (Dia semana: ' +
      brtDayOfWeek +
      ', UTC: ' +
      now.toISOString() +
      ')',
  )

  // 2. Validação estrita: Apenas segunda (1) a sexta (5), das 9h às 19h (inclusive)
  if (brtDayOfWeek < 1 || brtDayOfWeek > 5) {
    console.log(
      '[FlexSmart Cron] Ignorando execução: fora do intervalo seg-sex (dia ' + brtDayOfWeek + ').',
    )
    return
  }

  if (brtHour < 9 || brtHour > 19) {
    console.log(
      '[FlexSmart Cron] Ignorando execução: fora do horário de trabalho das 9h às 19h (hora ' +
        brtHour +
        'h BRT).',
    )
    return
  }

  // 3. Localizar o usuário proprietário da integração (admin principal daniel@impave.com.br ou primeiro admin ativo)
  let ownerId = ''
  try {
    const adminUser = $app.findAuthRecordByEmail('_pb_users_auth_', 'daniel@impave.com.br')
    ownerId = adminUser.id
  } catch (_) {
    try {
      const anyAdmin = $app.findFirstRecordByFilter(
        'users',
        "role = 'admin' && active = true",
        'created',
      )
      ownerId = anyAdmin.id
    } catch (_) {
      try {
        const firstUser = $app.findFirstRecordByFilter('users', "id != ''", 'created')
        ownerId = firstUser.id
      } catch (_) {}
    }
  }

  if (!ownerId) {
    console.log('[FlexSmart Cron] ERRO: Nenhum usuário encontrado para associar a sincronização.')
    return
  }

  // 4. Verificar se já existe sincronização ativa em andamento (manual ou outro processo)
  // Proteção contra registros travados/órfãos: se o registro estiver sem atualização há mais de 30 minutos,
  // finaliza-o automaticamente como 'failed' com mensagem explicativa e prossegue com a execução normalmente.
  try {
    const activeJobs = $app.findRecordsByFilter(
      'flex_sync',
      "status = 'running' || status = 'pending' || status = 'cancelling'",
      '-created',
      20,
      0,
    )

    if (activeJobs && activeJobs.length > 0) {
      const nowMs = Date.now()
      const staleThresholdMs = 30 * 60 * 1000 // 30 minutos
      let genuinelyActiveCount = 0

      for (let i = 0; i < activeJobs.length; i++) {
        const job = activeJobs[i]
        const updatedStr = job.getString('updated') || job.getString('created')
        let isStale = true
        if (updatedStr) {
          const updatedTime = new Date(updatedStr).getTime()
          if (!isNaN(updatedTime) && nowMs - updatedTime < staleThresholdMs) {
            isStale = false
          }
        }

        if (isStale) {
          try {
            job.set('status', 'failed')
            job.set('error', 'finalizado automaticamente por inatividade')
            job.set('finished_at', new Date().toISOString())
            job.set('current_step', 'Sincronização finalizada automaticamente por inatividade.')
            $app.save(job)
            console.log(
              '[FlexSmart Cron] Registro travado ' +
                job.id +
                ' finalizado automaticamente como failed por inatividade (> 30 min sem atualização).',
            )
          } catch (staleErr) {
            console.log(
              '[FlexSmart Cron] Erro ao finalizar registro travado ' + job.id + ':',
              String(staleErr),
            )
          }
        } else {
          genuinelyActiveCount++
        }
      }

      if (genuinelyActiveCount > 0) {
        console.log(
          '[FlexSmart Cron] Existe(m) ' +
            genuinelyActiveCount +
            ' importação(ões) realmente ativas em andamento. Pulando execução desta hora para evitar concorrência.',
        )
        return
      }
    }
  } catch (checkErr) {
    console.log('[FlexSmart Cron] Aviso ao verificar jobs ativos:', String(checkErr))
  }

  // 5. Criar registro de auditoria em flex_sync
  let syncRecord = null
  try {
    const collection = $app.findCollectionByNameOrId('flex_sync')
    syncRecord = new Record(collection)
    syncRecord.set('owner', ownerId)
    syncRecord.set('status', 'running')
    syncRecord.set('started_at', new Date().toISOString())
    syncRecord.set('count', 0)
    syncRecord.set('imported', 0)
    syncRecord.set('created_count', 0)
    syncRecord.set('updated_count', 0)
    syncRecord.set('sync_mode', 'single_date')
    syncRecord.set('is_full_sync', false)
    syncRecord.set('sync_start_date', dayDateStr)
    syncRecord.set('sync_date', dayDateStr)
    syncRecord.set('total_days', 1)
    syncRecord.set('processed_days', 0)
    syncRecord.set('current_day_date', dayDateStr)
    syncRecord.set(
      'current_step',
      'Importação automática agendada (' +
        dayDateStr +
        ' ' +
        pad2(brtHour) +
        ':00 BRT): autenticando no ERP...',
    )
    $app.save(syncRecord)
  } catch (createErr) {
    console.log(
      '[FlexSmart Cron] Erro ao criar registro de auditoria flex_sync:',
      String(createErr),
    )
    return
  }

  // 6. Realizar Login no ERP FlexSmart com até 3 retentativas (5s / 10s)
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
  let lastLoginError = ''
  const maxLoginAttempts = 3
  const loginWaitTimesMs = [5000, 10000]

  for (let attempt = 1; attempt <= maxLoginAttempts; attempt++) {
    try {
      console.log(
        '[FlexSmart Cron] Tentativa ' +
          attempt +
          '/' +
          maxLoginAttempts +
          ' de login no ERP FlexSmart (timeout 120s)...',
      )
      const loginRes = $http.send({
        url: base + '/login?Content-Type=application/json',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
        timeout: 120,
      })

      if (loginRes.statusCode !== 200) {
        lastLoginError = 'HTTP ' + loginRes.statusCode + (loginRes.raw ? ': ' + loginRes.raw : '')
        console.log('[FlexSmart Cron] Resposta de login diferente de 200: ' + lastLoginError)
        if (
          loginRes.statusCode === 401 ||
          loginRes.statusCode === 400 ||
          loginRes.statusCode === 403
        ) {
          break
        }
      } else {
        let pj = loginRes.json
        if (!pj && loginRes.raw) {
          try {
            pj = JSON.parse(loginRes.raw)
          } catch (_) {}
        }
        if (pj && pj.access_token) {
          token = pj.access_token
          break
        } else {
          lastLoginError = 'Resposta 200 sem access_token válido'
        }
      }
    } catch (loginErr) {
      lastLoginError = String(loginErr)
      console.log(
        '[FlexSmart Cron] Falha na tentativa ' + attempt + ' de login no ERP:',
        lastLoginError,
      )
    }

    if (!token && attempt < maxLoginAttempts) {
      const waitTime = loginWaitTimesMs[attempt - 1] || 5000
      delayMs(waitTime)
    }
  }

  if (!token) {
    const errorMsg =
      'Falha na autenticação do ERP FlexSmart após ' +
      maxLoginAttempts +
      ' tentativas: ' +
      lastLoginError
    console.log('[FlexSmart Cron] ' + errorMsg)
    try {
      syncRecord.set('status', 'failed')
      syncRecord.set('error', errorMsg)
      syncRecord.set('finished_at', new Date().toISOString())
      syncRecord.set(
        'current_step',
        'Falha na autenticação automática do ERP após ' +
          maxLoginAttempts +
          ' tentativas (' +
          lastLoginError +
          ').',
      )
      $app.save(syncRecord)
    } catch (saveFailErr) {
      console.log(
        '[FlexSmart Cron] Erro ao gravar falha terminal de autenticação:',
        String(saveFailErr),
      )
    }
    return
  }

  // 7. Buscar clientes alterados no DIA corrente
  let erpItems = []
  try {
    console.log(
      '[FlexSmart Cron] Buscando clientes alterados na data ' +
        dayDateStr +
        ' via GET /Cliente/getByDtAtz...',
    )
    const fetchRes = $http.send({
      url: base + '/Cliente/getByDtAtz?data=' + encodeURIComponent(dayDateStr),
      method: 'GET',
      headers: {
        AuthToken: token,
        Accept: 'application/json',
      },
      timeout: 120,
    })

    if (Array.isArray(fetchRes.json)) {
      erpItems = fetchRes.json
    } else if (fetchRes.raw) {
      try {
        const parsed = JSON.parse(fetchRes.raw)
        if (Array.isArray(parsed)) erpItems = parsed
      } catch (_) {}
    }
  } catch (fetchErr) {
    const errorMsg = 'Erro na requisição ao ERP FlexSmart (getByDtAtz): ' + String(fetchErr)
    console.log('[FlexSmart Cron] ' + errorMsg)
    try {
      syncRecord.set('status', 'failed')
      syncRecord.set('error', errorMsg)
      syncRecord.set('finished_at', new Date().toISOString())
      syncRecord.set('current_step', 'Falha na busca dos dados do dia no ERP: ' + String(fetchErr))
      $app.save(syncRecord)
    } catch (_) {}
    return
  }

  console.log(
    '[FlexSmart Cron] Clientes retornados pelo ERP para ' + dayDateStr + ': ' + erpItems.length,
  )

  // 8. Aplicar Upsert idêntico ao processo manual nos campos reconstruídos
  let createdCount = 0
  let updatedCount = 0

  for (let i = 0; i < erpItems.length; i++) {
    const item = erpItems[i]
    if (!item) continue

    const codCliente =
      item.cdCliente !== undefined && item.cdCliente !== null ? String(item.cdCliente).trim() : ''
    const rawName = item.nmCliente || item.nmFantasia || item.nome || ''
    const nomeCliente = String(rawName).trim()
    if (!nomeCliente || nomeCliente.length < 2) continue

    const rawRazaoSocial = item.razaoSocial || item.nmRazaoSocial || item.nmCliente || ''
    const razaoSocial = String(rawRazaoSocial).trim()

    const rawDoc = item.cnpjCpf || item.nuCpfCnpj || item.cpfCnpj || item.documento || ''
    const cleanDoc = cleanDigits(rawDoc)

    const rawEmail1 = item.email || item.nmEmail || item.dsEmail || ''
    const email1 = isValidEmail(rawEmail1) ? String(rawEmail1).trim().toLowerCase() : ''
    const email2 = isValidEmail(item.email2) ? String(item.email2).trim().toLowerCase() : ''
    const email3 = isValidEmail(item.email3) ? String(item.email3).trim().toLowerCase() : ''

    const rawContato1 = item.celular || item.fone || item.telefone || item.nuTelefone || ''
    const contato1 = cleanDigits(rawContato1)
    const rawContato2 = item.contato2 || item.telefone2 || item.fone2 || ''
    const contato2 = cleanDigits(rawContato2)

    const bairro = String(item.bairro || item.nmBairro || '').trim()
    const cidade = String(
      item.cidade && item.cidade.nmCidade
        ? item.cidade.nmCidade
        : item.cidade || item.nmCidade || '',
    ).trim()
    const estado = String(
      item.cidade && item.cidade.uf ? item.cidade.uf : item.uf || item.estado || '',
    ).trim()

    // Localizar cliente existente por:
    // 1. cod_cliente
    // 2. ou cnpj_cpf
    // 3. ou nome_cliente idêntico
    let existingClient = null

    if (codCliente) {
      try {
        existingClient = $app.findFirstRecordByFilter(
          'clients',
          "cod_cliente = '" + codCliente + "'",
        )
      } catch (_) {}
    }

    if (!existingClient && cleanDoc) {
      try {
        existingClient = $app.findFirstRecordByFilter('clients', "cnpj_cpf = '" + cleanDoc + "'")
      } catch (_) {}
    }

    if (!existingClient && nomeCliente) {
      try {
        const safeName = nomeCliente.replace(/'/g, "\\'")
        existingClient = $app.findFirstRecordByFilter(
          'clients',
          "nome_cliente = '" + safeName + "'",
        )
      } catch (_) {}
    }

    try {
      if (existingClient) {
        let changed = false
        if (codCliente && existingClient.getString('cod_cliente') !== codCliente) {
          existingClient.set('cod_cliente', codCliente)
          changed = true
        }
        if (nomeCliente && existingClient.getString('nome_cliente') !== nomeCliente) {
          existingClient.set('nome_cliente', nomeCliente)
          changed = true
        }
        if (razaoSocial && existingClient.getString('razao_social') !== razaoSocial) {
          existingClient.set('razao_social', razaoSocial)
          changed = true
        }
        if (cleanDoc && existingClient.getString('cnpj_cpf') !== cleanDoc) {
          existingClient.set('cnpj_cpf', cleanDoc)
          changed = true
        }
        if (contato1 && existingClient.getString('contato1') !== contato1) {
          existingClient.set('contato1', contato1)
          changed = true
        }
        if (contato2 && existingClient.getString('contato2') !== contato2) {
          existingClient.set('contato2', contato2)
          changed = true
        }
        if (email1 && existingClient.getString('email1') !== email1) {
          existingClient.set('email1', email1)
          changed = true
        }
        if (email2 && existingClient.getString('email2') !== email2) {
          existingClient.set('email2', email2)
          changed = true
        }
        if (email3 && existingClient.getString('email3') !== email3) {
          existingClient.set('email3', email3)
          changed = true
        }
        if (bairro && existingClient.getString('bairro') !== bairro) {
          existingClient.set('bairro', bairro)
          changed = true
        }
        if (cidade && existingClient.getString('cidade') !== cidade) {
          existingClient.set('cidade', cidade)
          changed = true
        }
        if (estado && existingClient.getString('estado') !== estado) {
          existingClient.set('estado', estado)
          changed = true
        }
        if (changed) {
          $app.save(existingClient)
        }
        updatedCount++
      } else {
        const clientsCol = $app.findCollectionByNameOrId('clients')
        const newClient = new Record(clientsCol)
        newClient.set('owner', ownerId)
        newClient.set('nome_cliente', nomeCliente)
        if (codCliente) newClient.set('cod_cliente', codCliente)
        if (razaoSocial) newClient.set('razao_social', razaoSocial)
        if (cleanDoc) newClient.set('cnpj_cpf', cleanDoc)
        if (contato1) newClient.set('contato1', contato1)
        if (contato2) newClient.set('contato2', contato2)
        if (email1) newClient.set('email1', email1)
        if (email2) newClient.set('email2', email2)
        if (email3) newClient.set('email3', email3)
        if (bairro) newClient.set('bairro', bairro)
        if (cidade) newClient.set('cidade', cidade)
        if (estado) newClient.set('estado', estado)
        $app.save(newClient)
        createdCount++
      }
    } catch (saveErr) {
      console.log(
        '[FlexSmart Cron] Erro ao gravar cliente ' + nomeCliente + ' (cod: ' + codCliente + '):',
        String(saveErr),
      )
    }
  }

  // 9. Atualizar registro de auditoria flex_sync como concluído com sucesso
  try {
    const totalProcessed = createdCount + updatedCount
    syncRecord.set('count', erpItems.length)
    syncRecord.set('imported', totalProcessed)
    syncRecord.set('created_count', createdCount)
    syncRecord.set('updated_count', updatedCount)
    syncRecord.set('processed_days', 1)
    syncRecord.set('status', 'done')
    syncRecord.set('finished_at', new Date().toISOString())
    syncRecord.set(
      'current_step',
      'Importação automática concluída com sucesso: ' +
        createdCount +
        ' novos, ' +
        updatedCount +
        ' atualizados (' +
        erpItems.length +
        ' no ERP no dia ' +
        dayDateStr +
        ').',
    )
    if (erpItems.length > 0) {
      try {
        syncRecord.set('sample', erpItems[0])
      } catch (_) {}
    }
    $app.save(syncRecord)
  } catch (auditErr) {
    console.log('[FlexSmart Cron] Erro ao finalizar auditoria flex_sync:', String(auditErr))
  }

  console.log(
    '[FlexSmart Cron] Job horário finalizado com sucesso! Data: ' +
      dayDateStr +
      ' | Total ERP: ' +
      erpItems.length +
      ' | Criados: ' +
      createdCount +
      ' | Atualizados: ' +
      updatedCount,
  )
})
