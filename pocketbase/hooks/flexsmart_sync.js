// flexsmart_sync.js - Integração com ERP FlexSmart
// 1. POST /login com username/password dos segredos -> access_token
// 2. Cache em memória do token ($app.store()) com re-login automático em caso de 401/403
// 3. GET /Cliente/getByDtAtz?data=DD/MM/AAAA com header AuthToken: <access_token>
// 4. Modos de importação manual:
//    a) Modo Padrão / Data específica: busca clientes alterados na data solicitada (ontem por padrão ou hoje)
//    b) Modo "Carga completa dia a dia" (mode: 'day_by_day'): itera dia por dia desde 01/09/2026 até hoje (incluso),
//       fazendo requisições sequenciais GET /Cliente/getByDtAtz?data=DD/MM/AAAA com timeout de 60s.
// 5. Mapeamento e deduplicação (erp_code e CPF/CNPJ) na coleção clients para o usuário autenticado:
//    - Se já existe: ATUALIZA os dados cadastrais
//    - Se não existe: CRIA o novo cliente
// 6. Execução em segundo plano com gravação de progresso na coleção `flex_sync`
//    - Botão "Interromper importação": encerra com segurança mantendo todos os clientes já processados e salvos.
//    - Se ocorrer erro em um dia: para imediatamente, gravando a data exata da falha e a mensagem real do ERP em pt-BR.
// 7. Rotas:
//    - POST /backend/v1/flexsmart/start-sync -> dispara o job assíncrono (aceita { date?: string, mode?: 'day_by_day' | 'single_date' })
//    - POST /backend/v1/flexsmart/cancel-sync/{id} -> solicita interrupção do job assíncrono
//    - GET  /backend/v1/flexsmart/sync-status/{id} -> retorna o status do job com contadores diários e acumulados
//    - GET  /backend/v1/flexsmart/last-sync -> retorna o último job de sincronização do usuário
//    - GET  /backend/v1/flexsmart/test-by-date -> teste de diagnóstico para verificar resposta de /Cliente/getByDtAtz
//    - POST /backend/v1/flexsmart/test-login -> teste de login
//    - POST /backend/v1/flexsmart/sync -> rota síncrona mantida por retrocompatibilidade
//
// NOTA CRÍTICA: Sincronização estritamente MANUAL a pedido do usuário (sem cron / sem execução automática).
// Jamais registrar nenhum cron/automação para o FlexSmart.
// Executada exclusivamente quando o usuário clica em "Importar do ERP FlexSmart" na interface.

try {
  if (typeof cronRemove === 'function') {
    cronRemove('flexsmart-sync-daily')
    cronRemove('flexsmart_sync_daily')
    cronRemove('flexsmart-sync')
    cronRemove('flexsmart_sync')
  }
} catch (_) {}

// 1. Rota para INICIAR a sincronização em segundo plano
routerAdd(
  'POST',
  '/backend/v1/flexsmart/start-sync',
  (e) => {
    try {
      const authRecord = e.auth
      const ownerId = authRecord ? authRecord.id : null

      if (!ownerId) {
        return e.json(401, { error: 'Usuário não autenticado' })
      }

      function cleanDigitsHelper(str) {
        if (!str) return ''
        return String(str).replace(/\D/g, '')
      }

      function pickFirstHelper(obj, keys) {
        if (!obj || typeof obj !== 'object') return ''
        for (const k of keys) {
          const val = obj[k]
          if (val !== undefined && val !== null) {
            if (typeof val === 'object') {
              const nestedName = pickFirstHelper(val, [
                'nmCidade',
                'nome',
                'dsCidade',
                'dsBairro',
                'nmBairro',
                'uf',
                'sgUf',
              ])
              if (nestedName) return nestedName
            }
            const s = String(val).trim()
            if (s !== '') return s
          }
        }
        return ''
      }

      function formatDateToBRHelper(d) {
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        return day + '/' + month + '/' + year
      }

      function getYesterdayBRHelper() {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        return formatDateToBRHelper(d)
      }

      function getTodayBRHelper() {
        return formatDateToBRHelper(new Date())
      }

      function generateDateRangeBRHelper(startDateStr, endDateObj) {
        const parts = startDateStr.split('/')
        const startDay = parseInt(parts[0], 10)
        const startMonth = parseInt(parts[1], 10) - 1
        const startYear = parseInt(parts[2], 10)

        const current = new Date(startYear, startMonth, startDay, 12, 0, 0)
        const end = new Date(
          endDateObj.getFullYear(),
          endDateObj.getMonth(),
          endDateObj.getDate(),
          12,
          0,
          0,
        )

        const dates = []
        while (current.getTime() <= end.getTime()) {
          dates.push(formatDateToBRHelper(current))
          current.setDate(current.getDate() + 1)
        }
        return dates
      }

      // Lê parâmetros do corpo se houver ({ date?: string, mode?: 'day_by_day' | 'single_date' })
      let reqBody = {}
      try {
        const rawBody = e.request.body ? e.request.body.readAll() : null
        if (rawBody && rawBody.length > 0) {
          reqBody = JSON.parse(String(rawBody))
        }
      } catch (_) {}

      const isDayByDay = reqBody.mode === 'day_by_day'
      const fixedStartDate = '01/09/2026'
      const todayStr = getTodayBRHelper()
      const yesterdayStr = getYesterdayBRHelper()

      let targetDate = ''
      let syncStartDate = ''
      let totalDays = 1

      if (isDayByDay) {
        syncStartDate = fixedStartDate
        targetDate = todayStr
        const dateList = generateDateRangeBRHelper(fixedStartDate, new Date())
        totalDays = Math.max(1, dateList.length)
      } else {
        if (reqBody.date && typeof reqBody.date === 'string' && reqBody.date.trim()) {
          targetDate = reqBody.date.trim()
        } else {
          targetDate = yesterdayStr
        }
        syncStartDate = targetDate
        totalDays = 1
      }

      // Limpa/finaliza jobs antigos que ficaram pendentes ou travados
      try {
        const staleSyncs = $app.findRecordsByFilter(
          'flex_sync',
          'owner = {:owner} && (status = "running" || status = "pending" || status = "cancelling")',
          '-created',
          20,
          0,
          { owner: ownerId },
        )

        const nowTime = Date.now()
        for (const stale of staleSyncs) {
          const updatedStr = stale.getString('updated') || stale.getString('created')
          const ageMs = nowTime - new Date(updatedStr).getTime()
          const st = stale.getString('status')

          if (st === 'cancelling' || ageMs > 60000 || st === 'pending' || st === 'running') {
            stale.set('status', 'cancelled')
            stale.set('current_step', 'Sessão anterior finalizada ao iniciar novo processo.')
            stale.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            $app.save(stale)
            console.log('[FlexSmart] Job antigo finalizado: ' + stale.id)
          }
        }
      } catch (staleErr) {
        console.log('[FlexSmart] Aviso ao limpar jobs antigos: ' + String(staleErr))
      }

      // Cria o registro na coleção flex_sync
      const syncCol = $app.findCollectionByNameOrId('flex_sync')
      const syncRec = new Record(syncCol)
      syncRec.set('owner', ownerId)
      syncRec.set('status', 'pending')
      syncRec.set('count', 0)
      syncRec.set('imported', 0)
      syncRec.set('created_count', 0)
      syncRec.set('updated_count', 0)
      syncRec.set('sync_date', targetDate)
      syncRec.set('sync_start_date', syncStartDate)
      syncRec.set('total_days', totalDays)
      syncRec.set('processed_days', 0)
      syncRec.set('current_day_date', isDayByDay ? fixedStartDate : targetDate)
      syncRec.set('sync_mode', isDayByDay ? 'day_by_day' : 'single_date')
      syncRec.set('is_full_sync', isDayByDay)
      syncRec.set(
        'current_step',
        isDayByDay
          ? 'Iniciando carga completa dia a dia (' +
              fixedStartDate +
              ' → ' +
              todayStr +
              ', ' +
              totalDays +
              ' dias)...'
          : 'Iniciando importação (data base: ' + targetDate + ')...',
      )
      $app.save(syncRec)

      const syncId = syncRec.id
      console.log(
        '[FlexSmart] Novo job de sincronização criado: ' +
          syncId +
          ' modo=' +
          (isDayByDay ? 'day_by_day' : 'single_date') +
          ' totalDays=' +
          totalDays,
      )

      // Executa o processamento assíncrono em segundo plano
      setTimeout(() => {
        function getFlexSmartToken(forceRefresh) {
          const username =
            $os.getenv('FLEXSMART_USERNAME') ||
            ($secrets && $secrets.has('FLEXSMART_USERNAME')
              ? $secrets.get('FLEXSMART_USERNAME')
              : '')
          const password =
            $os.getenv('FLEXSMART_PASSWORD') ||
            ($secrets && $secrets.has('FLEXSMART_PASSWORD')
              ? $secrets.get('FLEXSMART_PASSWORD')
              : '')

          if (!username || !password) {
            throw new Error(
              'Credenciais FlexSmart não configuradas (FLEXSMART_USERNAME / FLEXSMART_PASSWORD)',
            )
          }

          const now = Date.now()
          if (!forceRefresh) {
            try {
              if (
                $app.store &&
                $app.store().has('flexsmart_cached_token') &&
                $app.store().has('flexsmart_token_time')
              ) {
                const cached = $app.store().get('flexsmart_cached_token')
                const time = Number($app.store().get('flexsmart_token_time')) || 0
                if (cached && now - time < 3600000) {
                  return String(cached)
                }
              }
            } catch (_) {}
          }

          const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
          console.log('[FlexSmart] Realizando login em ' + loginUrl)

          const jsonBodyStr = JSON.stringify({
            username: username,
            password: password,
          })

          let res = null
          let sendErr = null
          try {
            res = $http.send({
              url: loginUrl,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: jsonBodyStr,
              timeout: 30,
            })
          } catch (errSend) {
            sendErr = errSend
            console.log('[FlexSmart] Erro na requisição HTTP de login: ' + String(errSend))
          }

          if (!res) {
            throw new Error(
              'Falha de conexão ao tentar login no FlexSmart: ' +
                (sendErr ? String(sendErr) : 'sem resposta'),
            )
          }

          let parsedJson = res.json
          if (!parsedJson && res.raw) {
            try {
              parsedJson = JSON.parse(res.raw)
            } catch (_) {}
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            let detail = ''
            if (parsedJson && typeof parsedJson === 'object') {
              detail = ': ' + (parsedJson.message || parsedJson.error || JSON.stringify(parsedJson))
            } else if (res.raw) {
              detail = ': ' + String(res.raw).slice(0, 200)
            }
            throw new Error('Login no ERP FlexSmart falhou com HTTP ' + res.statusCode + detail)
          }

          const token =
            parsedJson && typeof parsedJson.access_token === 'string'
              ? parsedJson.access_token.trim()
              : null

          if (!token) {
            throw new Error('Token "access_token" não encontrado na resposta de login do FlexSmart')
          }

          try {
            if ($app.store) {
              $app.store().set('flexsmart_cached_token', token)
              $app.store().set('flexsmart_token_time', String(now))
            }
          } catch (_) {}

          return token
        }

        function fetchERPByDate(searchDate, forceRelogin, onStepUpdate) {
          const rawBase =
            $os.getenv('FLEXSMART_BASE_URL') ||
            ($secrets && $secrets.has('FLEXSMART_BASE_URL')
              ? $secrets.get('FLEXSMART_BASE_URL')
              : '') ||
            'https://api.impave.com.br:8443'
          const base = rawBase.replace(/\/+$/, '')
          const token = getFlexSmartToken(forceRelogin)

          if (onStepUpdate) {
            onStepUpdate('Buscando clientes alterados na data ' + searchDate + ' no ERP...')
          }

          let res = null
          let lastErr = null
          const startTime = Date.now()
          try {
            res = $http.send({
              url: base + '/Cliente/getByDtAtz?data=' + encodeURIComponent(searchDate),
              method: 'GET',
              headers: {
                AuthToken: token,
                Accept: 'application/json',
              },
              timeout: 60,
            })
          } catch (eGet) {
            lastErr = eGet
          }

          const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1)

          if (!res) {
            throw new Error(
              'Falha ao conectar no endpoint /Cliente/getByDtAtz para data ' +
                searchDate +
                ' após ' +
                elapsedSec +
                's: ' +
                (lastErr ? String(lastErr) : 'sem resposta do servidor'),
            )
          }

          if ((res.statusCode === 401 || res.statusCode === 403) && !forceRelogin) {
            console.log('[FlexSmart] Token expirado (' + res.statusCode + '), renovando token...')
            try {
              if ($app.store) {
                $app.store().remove('flexsmart_cached_token')
                $app.store().remove('flexsmart_token_time')
              }
            } catch (_) {}
            return fetchERPByDate(searchDate, true, onStepUpdate)
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            let detail = ''
            if (res.raw) {
              detail = ' - ' + String(res.raw).slice(0, 300)
            }
            throw new Error(
              'Falha ao buscar clientes na data ' +
                searchDate +
                ': HTTP ' +
                res.statusCode +
                detail,
            )
          }

          if (Array.isArray(res.json)) {
            return res.json
          }

          if (res.json && typeof res.json === 'object') {
            const candidateKeys = [
              'dados',
              'data',
              'clientes',
              'clients',
              'content',
              'items',
              'resultado',
              'results',
              'result',
              'lista',
              'list',
              'records',
              'rows',
            ]
            for (const key of candidateKeys) {
              if (Array.isArray(res.json[key])) {
                return res.json[key]
              }
            }
            for (const k of Object.keys(res.json)) {
              if (Array.isArray(res.json[k])) {
                return res.json[k]
              }
            }
            if (
              res.json.cdCliente ||
              res.json.nmCliente ||
              res.json.cnpjCpf ||
              res.json.id ||
              res.json.codigo ||
              res.json.nome
            ) {
              return [res.json]
            }
          }

          if (res.raw && typeof res.raw === 'string') {
            try {
              const parsed = JSON.parse(res.raw)
              if (Array.isArray(parsed)) {
                return parsed
              }
              if (parsed && typeof parsed === 'object') {
                for (const key of [
                  'dados',
                  'data',
                  'clientes',
                  'clients',
                  'content',
                  'items',
                  'lista',
                  'records',
                ]) {
                  if (Array.isArray(parsed[key])) return parsed[key]
                }
                for (const k of Object.keys(parsed)) {
                  if (Array.isArray(parsed[k])) return parsed[k]
                }
                if (parsed.cdCliente || parsed.nmCliente || parsed.cnpjCpf) {
                  return [parsed]
                }
              }
            } catch (pErr) {
              console.log(
                '[FlexSmart] JSON.parse(res.raw) falhou na data ' +
                  searchDate +
                  ': ' +
                  String(pErr),
              )
              throw new Error(
                'Falha ao interpretar dados JSON do ERP na data ' +
                  searchDate +
                  ': ' +
                  String(pErr),
              )
            }
          }

          return []
        }

        function upsertClientRecord(
          item,
          owner,
          clientsCol,
          clientsByErpCode,
          clientsByDoc,
          indexFallback,
        ) {
          const erpCode = pickFirstHelper(item, [
            'cdCliente',
            'cd_cliente',
            'codCliente',
            'codigoCliente',
            'codigo',
            'id',
          ])

          const docRaw = pickFirstHelper(item, [
            'cnpjCpf',
            'cnpj_cpf',
            'cpfCnpj',
            'cpf_cnpj',
            'cnpj',
            'cpf',
            'documento',
            'doc',
            'nrDocumento',
          ])
          const docClean = cleanDigitsHelper(docRaw)

          const nameRaw = pickFirstHelper(item, [
            'nmCliente',
            'nmFantasia',
            'nomeCliente',
            'razaoSocial',
            'razao_social',
            'nome_fantasia',
            'nomeFantasia',
            'nome',
            'dsNome',
            'descricao',
          ])

          const emailRaw = pickFirstHelper(item, [
            'email',
            'emailNfe',
            'emailCompras',
            'e_mail',
            'dsEmail',
            'mail',
          ])

          const phoneRaw = pickFirstHelper(item, [
            'celular',
            'fone',
            'telefone',
            'nrTelefone',
            'phone',
            'tel',
            'dsTelefone',
          ])

          const logradouro = pickFirstHelper(item, [
            'enderecoLogradouro',
            'logradouro',
            'endereco',
            'rua',
            'dsEndereco',
          ])
          const numero = pickFirstHelper(item, ['enderecoNumero', 'numero', 'nrEndereco'])
          const complemento = pickFirstHelper(item, [
            'enderecoComplemento',
            'complemento',
            'dsComplemento',
          ])

          let bairro = ''
          if (item.bairro && typeof item.bairro === 'object') {
            bairro = pickFirstHelper(item.bairro, ['nmBairro', 'dsBairro', 'nome'])
          }
          if (!bairro) {
            bairro = pickFirstHelper(item, ['bairro', 'dsBairro', 'nmBairro'])
          }

          let fullAddressParts = []
          if (logradouro) {
            let addr = logradouro
            if (numero) addr += ', ' + numero
            if (complemento) addr += ' (' + complemento + ')'
            if (bairro) addr += ' - ' + bairro
            fullAddressParts.push(addr)
          } else if (pickFirstHelper(item, ['address', 'ds_endereco'])) {
            fullAddressParts.push(pickFirstHelper(item, ['address', 'ds_endereco']))
          }
          const address = fullAddressParts.join(', ')

          let cityRaw = ''
          let stateRaw = ''
          if (item.cidade && typeof item.cidade === 'object') {
            cityRaw = pickFirstHelper(item.cidade, ['nmCidade', 'nome', 'dsCidade'])
            stateRaw = pickFirstHelper(item.cidade, ['uf', 'sgUf', 'siglaUf', 'estado'])
          }
          if (!cityRaw) {
            cityRaw = pickFirstHelper(item, [
              'nmCidade',
              'cidade',
              'municipio',
              'dsCidade',
              'ds_cidade',
              'nm_municipio',
            ])
          }
          if (!stateRaw) {
            stateRaw = pickFirstHelper(item, [
              'uf',
              'sgUf',
              'siglaUf',
              'estado',
              'state',
              'dsUf',
              'ds_uf',
            ])
          }

          let name = nameRaw
          if (!name || name.trim().length < 2) {
            name = 'Cliente ' + (erpCode || docClean || indexFallback)
          }

          let targetRecord = null
          if (erpCode && clientsByErpCode.has(erpCode)) {
            targetRecord = clientsByErpCode.get(erpCode)
          } else if (docClean && clientsByDoc.has(docClean)) {
            targetRecord = clientsByDoc.get(docClean)
          }

          const isUpdate = !!targetRecord
          const rec = targetRecord || new Record(clientsCol)

          if (!isUpdate) {
            rec.set('owner', owner)
          }

          rec.set('name', name)

          if (erpCode) {
            rec.set('erp_code', erpCode)
          }

          if (docClean) {
            rec.set('document', docClean)
          }

          if (emailRaw && emailRaw.indexOf('@') > 0) {
            rec.set('email', emailRaw)
          }

          if (phoneRaw) {
            rec.set('phone', cleanDigitsHelper(phoneRaw))
          }

          if (address) {
            rec.set('address', address)
          }

          if (cityRaw) {
            rec.set('city', cityRaw)
          }

          if (stateRaw) {
            rec.set('state', stateRaw.toUpperCase().slice(0, 2))
          }

          $app.save(rec)

          if (erpCode) clientsByErpCode.set(erpCode, rec)
          if (docClean) clientsByDoc.set(docClean, rec)

          return isUpdate ? 'updated' : 'created'
        }

        let jobRec = null
        try {
          jobRec = $app.findRecordById('flex_sync', syncId)
        } catch (_) {
          return
        }

        try {
          const initialStatus = jobRec.getString('status')
          if (initialStatus === 'cancelling' || initialStatus === 'cancelled') {
            jobRec.set('status', 'cancelled')
            jobRec.set('current_step', 'Importação cancelada antes de iniciar.')
            jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            $app.save(jobRec)
            console.log('[FlexSmart ' + syncId + '] Cancelado antes do início.')
            return
          }

          jobRec.set('status', 'running')
          jobRec.set('started_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(jobRec)

          // Carrega mapa de clientes existentes para upsert eficiente em memória
          const existingRecords = $app.findRecordsByFilter(
            'clients',
            'owner = {:owner}',
            '-created',
            100000,
            0,
            { owner: ownerId },
          )

          const clientsByErpCode = new Map()
          const clientsByDoc = new Map()

          for (const rec of existingRecords) {
            const erpCode = rec.getString('erp_code')
            const doc = cleanDigitsHelper(rec.getString('document'))
            if (erpCode) clientsByErpCode.set(erpCode, rec)
            if (doc) clientsByDoc.set(doc, rec)
          }

          const clientsCol = $app.findCollectionByNameOrId('clients')
          let createdCount = 0
          let updatedCount = 0
          let totalImportedCount = 0
          let wasCancelled = false

          if (isDayByDay) {
            // ==========================================
            // MODO CARGA COMPLETA DIA A DIA (01/09/2026 -> HOJE)
            // ==========================================
            const datesToProcess = generateDateRangeBRHelper(fixedStartDate, new Date())
            const countDays = datesToProcess.length

            jobRec.set('total_days', countDays)
            jobRec.set('processed_days', 0)
            $app.save(jobRec)

            for (let dayIndex = 0; dayIndex < countDays; dayIndex++) {
              const currentDayStr = datesToProcess[dayIndex]
              const dayNumber = dayIndex + 1

              // 1. Verifica solicitação de cancelamento antes de cada requisição diária
              try {
                const checkRec = $app.findRecordById('flex_sync', syncId)
                const currentStatus = checkRec.getString('status')
                if (currentStatus === 'cancelling' || currentStatus === 'cancelled') {
                  console.log(
                    '[FlexSmart ' +
                      syncId +
                      '] Interrupção solicitada no início do dia ' +
                      currentDayStr,
                  )
                  wasCancelled = true
                  jobRec = checkRec
                  break
                }
              } catch (_) {}

              // Atualiza status do dia corrente
              try {
                jobRec.set('current_day_date', currentDayStr)
                jobRec.set(
                  'current_step',
                  'Dia ' +
                    currentDayStr +
                    ' — ' +
                    dayNumber +
                    ' de ' +
                    countDays +
                    ' dias (' +
                    createdCount +
                    ' novos, ' +
                    updatedCount +
                    ' atualizados)...',
                )
                $app.save(jobRec)
              } catch (_) {}

              // 2. Busca os clientes daquele dia no ERP
              let dayList = []
              try {
                dayList = fetchERPByDate(currentDayStr, false, (stepText) => {
                  try {
                    jobRec.set(
                      'current_step',
                      'Dia ' +
                        currentDayStr +
                        ' (' +
                        dayNumber +
                        '/' +
                        countDays +
                        '): ' +
                        stepText,
                    )
                    $app.save(jobRec)
                  } catch (_) {}
                })
              } catch (dayFetchErr) {
                // Política de segurança: parar imediatamente em caso de erro, registrando a data exata e mensagem em pt-BR
                const errMsg =
                  dayFetchErr && dayFetchErr.message ? dayFetchErr.message : String(dayFetchErr)
                console.log(
                  '[FlexSmart ' + syncId + '] Erro na data ' + currentDayStr + ': ' + errMsg,
                )
                jobRec.set('status', 'error')
                jobRec.set('error', 'Falha no dia ' + currentDayStr + ': ' + errMsg)
                jobRec.set(
                  'current_step',
                  'Interrompido por erro no dia ' +
                    currentDayStr +
                    '. Clientes processados até então foram preservados.',
                )
                jobRec.set('current_day_date', currentDayStr)
                jobRec.set('processed_days', dayIndex)
                jobRec.set('imported', totalImportedCount)
                jobRec.set('created_count', createdCount)
                jobRec.set('updated_count', updatedCount)
                jobRec.set(
                  'finished_at',
                  new Date().toISOString().replace('T', ' ').substring(0, 19),
                )
                $app.save(jobRec)
                return
              }

              const countInDay = Array.isArray(dayList) ? dayList.length : 0
              if (countInDay > 0 && typeof dayList[0] === 'object') {
                try {
                  jobRec.set('sample', dayList[0])
                } catch (_) {}
              }

              // 3. Processa cada cliente do array retornado no dia
              for (let cIdx = 0; cIdx < countInDay; cIdx++) {
                // Checa cancelamento a cada 20 registros
                if (cIdx > 0 && cIdx % 20 === 0) {
                  try {
                    const checkRec = $app.findRecordById('flex_sync', syncId)
                    const currentStatus = checkRec.getString('status')
                    if (currentStatus === 'cancelling' || currentStatus === 'cancelled') {
                      wasCancelled = true
                      jobRec = checkRec
                      break
                    }
                  } catch (_) {}
                }

                const item = dayList[cIdx]
                dayList[cIdx] = null

                if (!item || typeof item !== 'object') {
                  continue
                }

                try {
                  const resType = upsertClientRecord(
                    item,
                    ownerId,
                    clientsCol,
                    clientsByErpCode,
                    clientsByDoc,
                    cIdx + 1,
                  )
                  if (resType === 'updated') {
                    updatedCount++
                  } else {
                    createdCount++
                  }
                  totalImportedCount++
                } catch (saveErr) {
                  console.log(
                    '[FlexSmart ' +
                      syncId +
                      '] Erro ao salvar cliente na data ' +
                      currentDayStr +
                      ': ' +
                      String(saveErr),
                  )
                }
              }

              if (wasCancelled) {
                break
              }

              // Concluiu o dia
              const processedDaysCount = dayIndex + 1
              try {
                jobRec.set('processed_days', processedDaysCount)
                jobRec.set('imported', totalImportedCount)
                jobRec.set('created_count', createdCount)
                jobRec.set('updated_count', updatedCount)
                jobRec.set(
                  'current_step',
                  'Dia ' +
                    currentDayStr +
                    ' concluído — ' +
                    processedDaysCount +
                    ' de ' +
                    countDays +
                    ' dias (' +
                    createdCount +
                    ' novos, ' +
                    updatedCount +
                    ' atualizados acumulados)...',
                )
                $app.save(jobRec)
              } catch (_) {}
            }

            // Tratamento após loop diário
            if (wasCancelled) {
              jobRec.set('status', 'cancelled')
              jobRec.set(
                'current_step',
                'Carga diária interrompida pelo usuário (' +
                  createdCount +
                  ' novos, ' +
                  updatedCount +
                  ' atualizados preservados).',
              )
              jobRec.set('imported', totalImportedCount)
              jobRec.set('created_count', createdCount)
              jobRec.set('updated_count', updatedCount)
              jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
              $app.save(jobRec)
              console.log(
                '[FlexSmart ' +
                  syncId +
                  '] Carga dia a dia interrompida com segurança: criados=' +
                  createdCount +
                  ', atualizados=' +
                  updatedCount,
              )
              return
            }

            jobRec.set('status', 'done')
            jobRec.set('imported', totalImportedCount)
            jobRec.set('created_count', createdCount)
            jobRec.set('updated_count', updatedCount)
            jobRec.set('processed_days', countDays)
            jobRec.set('current_day_date', todayStr)
            jobRec.set(
              'current_step',
              'Carga completa concluída com sucesso! ' +
                countDays +
                ' dias verificados (' +
                createdCount +
                ' novos, ' +
                updatedCount +
                ' atualizados acumulados).',
            )
            jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            $app.save(jobRec)
            console.log(
              '[FlexSmart ' +
                syncId +
                '] Carga dia a dia concluída com sucesso: totalDias=' +
                countDays +
                ', criados=' +
                createdCount +
                ', atualizados=' +
                updatedCount,
            )
            return
          }

          // ==========================================
          // MODO DIA ÚNICO (ONTEM OU HOJE)
          // ==========================================
          jobRec.set(
            'current_step',
            'Buscando clientes alterados na data ' + targetDate + ' no ERP...',
          )
          $app.save(jobRec)

          const erpList = fetchERPByDate(targetDate, false, (stepText) => {
            try {
              jobRec.set('current_step', stepText)
              $app.save(jobRec)
            } catch (_) {}
          })

          const totalErp = erpList.length
          console.log('[FlexSmart ' + syncId + '] Total recebido do ERP: ' + totalErp)

          if (totalErp > 0 && typeof erpList[0] === 'object') {
            try {
              jobRec.set('sample', erpList[0])
            } catch (_) {}
          }

          jobRec.set('count', totalErp)
          jobRec.set('imported', 0)
          jobRec.set('created_count', 0)
          jobRec.set('updated_count', 0)

          if (totalErp === 0) {
            jobRec.set('status', 'done')
            jobRec.set('current_step', 'Nenhum cliente retornado para a data ' + targetDate + '.')
            jobRec.set('sync_date', targetDate)
            jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            $app.save(jobRec)
            console.log(
              '[FlexSmart ' + syncId + '] Concluído: 0 clientes alterados na data ' + targetDate,
            )
            return
          }

          jobRec.set('current_step', 'Processando ' + totalErp + ' clientes...')
          $app.save(jobRec)

          const BATCH_SIZE = 20

          for (let i = 0; i < totalErp; i++) {
            if (i % BATCH_SIZE === 0) {
              try {
                const checkRec = $app.findRecordById('flex_sync', syncId)
                const currentStatus = checkRec.getString('status')
                if (currentStatus === 'cancelling' || currentStatus === 'cancelled') {
                  console.log(
                    '[FlexSmart ' + syncId + '] Interrupção solicitada detectada no índice ' + i,
                  )
                  wasCancelled = true
                  jobRec = checkRec
                  break
                }
              } catch (_) {}
            }

            const item = erpList[i]
            erpList[i] = null

            if (!item || typeof item !== 'object') {
              continue
            }

            try {
              const resType = upsertClientRecord(
                item,
                ownerId,
                clientsCol,
                clientsByErpCode,
                clientsByDoc,
                i + 1,
              )
              if (resType === 'updated') {
                updatedCount++
              } else {
                createdCount++
              }
            } catch (itemErr) {
              console.log('[FlexSmart] Erro ao gravar cliente #' + i + ': ' + String(itemErr))
            }

            const processed = i + 1
            if (processed % BATCH_SIZE === 0 || processed === totalErp) {
              try {
                jobRec.set('imported', processed)
                jobRec.set('created_count', createdCount)
                jobRec.set('updated_count', updatedCount)
                jobRec.set(
                  'current_step',
                  'Processados ' +
                    processed +
                    ' de ' +
                    totalErp +
                    ' (' +
                    createdCount +
                    ' novos, ' +
                    updatedCount +
                    ' atualizados)...',
                )
                $app.save(jobRec)
              } catch (_) {}
            }
          }

          if (wasCancelled) {
            jobRec.set('status', 'cancelled')
            jobRec.set(
              'current_step',
              'Importação interrompida pelo usuário (' +
                createdCount +
                ' criados, ' +
                updatedCount +
                ' atualizados)',
            )
            jobRec.set('created_count', createdCount)
            jobRec.set('updated_count', updatedCount)
            jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            $app.save(jobRec)
            console.log(
              '[FlexSmart ' +
                syncId +
                '] Interrompido pelo usuário com sucesso: criados=' +
                createdCount +
                ', atualizados=' +
                updatedCount,
            )
            return
          }

          jobRec.set('status', 'done')
          jobRec.set('imported', totalErp)
          jobRec.set('created_count', createdCount)
          jobRec.set('updated_count', updatedCount)
          jobRec.set('sync_date', targetDate)
          jobRec.set(
            'current_step',
            'Concluído! ' +
              createdCount +
              ' novos, ' +
              updatedCount +
              ' atualizados (data base ' +
              targetDate +
              ').',
          )
          jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(jobRec)

          console.log(
            '[FlexSmart ' +
              syncId +
              '] Finalizado com sucesso: total=' +
              totalErp +
              ', criados=' +
              createdCount +
              ', atualizados=' +
              updatedCount,
          )
        } catch (err) {
          const msg = err && err.message ? err.message : String(err)
          console.log('[FlexSmart ' + syncId + '] Falha: ' + msg)
          try {
            const freshRec = $app.findRecordById('flex_sync', syncId)
            const st = freshRec.getString('status')
            if (st === 'cancelling' || st === 'cancelled') {
              freshRec.set('status', 'cancelled')
              freshRec.set('current_step', 'Importação interrompida pelo usuário.')
              freshRec.set(
                'finished_at',
                new Date().toISOString().replace('T', ' ').substring(0, 19),
              )
              $app.save(freshRec)
            } else {
              freshRec.set('status', 'error')
              freshRec.set('error', msg)
              freshRec.set('current_step', 'Erro: ' + msg.slice(0, 150))
              freshRec.set(
                'finished_at',
                new Date().toISOString().replace('T', ' ').substring(0, 19),
              )
              $app.save(freshRec)
            }
          } catch (_) {}
        }
      }, 0)

      return e.json(200, {
        success: true,
        syncId: syncId,
        status: 'pending',
        targetDate: targetDate,
        syncStartDate: syncStartDate,
        totalDays: totalDays,
        syncMode: isDayByDay ? 'day_by_day' : 'single_date',
        isFullSync: isDayByDay,
        message: isDayByDay
          ? 'Carga completa dia a dia iniciada com sucesso (' +
            fixedStartDate +
            ' → ' +
            todayStr +
            ').'
          : 'Importação iniciada com sucesso em segundo plano (data base: ' + targetDate + ').',
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.log('[FlexSmart] Erro ao iniciar sincronização: ' + msg)
      throw new BadRequestError(msg)
    }
  },
  $apis.requireAuth(),
)

// 2. Rota para CANCELAR / INTERROMPER a sincronização em andamento
routerAdd(
  'POST',
  '/backend/v1/flexsmart/cancel-sync/{id}',
  (e) => {
    try {
      const syncId = e.request.pathValue('id')
      const authRecord = e.auth
      const ownerId = authRecord ? authRecord.id : null

      if (!ownerId) {
        return e.json(401, { error: 'Usuário não autenticado' })
      }

      let rec = null
      try {
        rec = $app.findRecordById('flex_sync', syncId)
      } catch (_) {
        return e.json(404, { error: 'Sincronização não encontrada' })
      }

      if (rec.getString('owner') !== ownerId) {
        return e.json(403, { error: 'Acesso negado' })
      }

      const currentStatus = rec.getString('status')

      if (currentStatus === 'done') {
        return e.json(200, {
          success: true,
          status: 'done',
          message: 'A importação já havia sido concluída com sucesso.',
        })
      }

      if (currentStatus === 'error') {
        return e.json(200, {
          success: true,
          status: 'error',
          message: 'A importação já havia sido finalizada com erro.',
        })
      }

      if (currentStatus === 'cancelled') {
        return e.json(200, {
          success: true,
          status: 'cancelled',
          message: 'A importação já estava cancelada.',
        })
      }

      const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)
      const createdSoFar = rec.getInt('created_count')
      const updatedSoFar = rec.getInt('updated_count')

      if (currentStatus === 'pending') {
        rec.set('status', 'cancelled')
        rec.set('current_step', 'Importação cancelada antes de iniciar.')
        rec.set('finished_at', nowIso)
        $app.save(rec)

        console.log('[FlexSmart] Job ' + syncId + ' cancelado imediatamente (estava pending).')

        return e.json(200, {
          success: true,
          status: 'cancelled',
          message: 'Importação cancelada com sucesso.',
        })
      }

      const lastUpdated = new Date(rec.getString('updated') || rec.getString('created')).getTime()
      const isStale = Date.now() - lastUpdated > 30000

      if (isStale) {
        rec.set('status', 'cancelled')
        rec.set(
          'current_step',
          'Importação interrompida (' + createdSoFar + ' novos, ' + updatedSoFar + ' atualizados).',
        )
        rec.set('finished_at', nowIso)
        $app.save(rec)

        return e.json(200, {
          success: true,
          status: 'cancelled',
          message: 'Importação interrompida. Os clientes já salvos foram preservados.',
        })
      }

      rec.set('status', 'cancelling')
      rec.set('current_step', 'Interrupção solicitada pelo usuário...')
      $app.save(rec)

      return e.json(200, {
        success: true,
        status: 'cancelling',
        message:
          'Interrupção solicitada com sucesso. O processamento será parado no encerramento da requisição em curso.',
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      throw new BadRequestError(msg)
    }
  },
  $apis.requireAuth(),
)

// 3. Rota para CONSULTAR o status do job de sincronização
routerAdd(
  'GET',
  '/backend/v1/flexsmart/sync-status/{id}',
  (e) => {
    try {
      const syncId = e.request.pathValue('id')
      const authRecord = e.auth
      const ownerId = authRecord ? authRecord.id : null

      if (!ownerId) {
        throw new UnauthorizedError('Usuário não autenticado')
      }

      let rec = null
      try {
        rec = $app.findRecordById('flex_sync', syncId)
      } catch (_) {
        throw new NotFoundError('Sincronização não encontrada')
      }

      if (rec.getString('owner') !== ownerId) {
        throw new ForbiddenError('Acesso negado')
      }

      let currentStatus = rec.getString('status')
      const lastUpdated = new Date(rec.getString('updated') || rec.getString('created')).getTime()
      const timeSinceUpdate = Date.now() - lastUpdated

      if (currentStatus === 'cancelling' && timeSinceUpdate > 10000) {
        try {
          currentStatus = 'cancelled'
          rec.set('status', 'cancelled')
          rec.set(
            'current_step',
            'Importação interrompida (' +
              rec.getInt('created_count') +
              ' novos, ' +
              rec.getInt('updated_count') +
              ' atualizados).',
          )
          rec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(rec)
        } catch (_) {}
      } else if (currentStatus === 'running' && timeSinceUpdate > 120000) {
        try {
          currentStatus = 'error'
          rec.set('status', 'error')
          rec.set('error', 'O tempo limite de sincronização foi atingido sem resposta.')
          rec.set('current_step', 'Falha por tempo limite.')
          rec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(rec)
        } catch (_) {}
      }

      const total = rec.getInt('count')
      const imported = rec.getInt('imported')
      const totalDays = rec.getInt('total_days')
      const processedDays = rec.getInt('processed_days')
      const syncMode =
        rec.getString('sync_mode') || (rec.getBool('is_full_sync') ? 'day_by_day' : 'single_date')

      let progressPercent = 0
      if (syncMode === 'day_by_day' && totalDays > 0) {
        progressPercent = Math.min(100, Math.round((processedDays / totalDays) * 100))
      } else if (total > 0) {
        progressPercent = Math.min(100, Math.round((imported / total) * 100))
      }

      return e.json(200, {
        id: rec.id,
        status: currentStatus,
        currentStep: rec.getString('current_step'),
        count: total,
        imported: imported,
        createdCount: rec.getInt('created_count'),
        updatedCount: rec.getInt('updated_count'),
        percent: progressPercent,
        error: rec.getString('error'),
        syncDate: rec.getString('sync_date'),
        syncStartDate: rec.getString('sync_start_date'),
        totalDays: totalDays,
        processedDays: processedDays,
        currentDayDate: rec.getString('current_day_date'),
        syncMode: syncMode,
        isFullSync: rec.getBool('is_full_sync'),
        startedAt: rec.getString('started_at'),
        finishedAt: rec.getString('finished_at'),
        created: rec.getString('created'),
        updated: rec.getString('updated'),
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      throw new BadRequestError(msg)
    }
  },
  $apis.requireAuth(),
)

// 4. Rota para consultar o ÚLTIMO job de sincronização
routerAdd(
  'GET',
  '/backend/v1/flexsmart/last-sync',
  (e) => {
    try {
      const authRecord = e.auth
      const ownerId = authRecord ? authRecord.id : null

      if (!ownerId) {
        throw new UnauthorizedError('Usuário não autenticado')
      }

      function formatDateToBRInline(d) {
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        return day + '/' + month + '/' + year
      }

      function getYesterdayBRInline() {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        return formatDateToBRInline(d)
      }

      function getTodayBRInline() {
        return formatDateToBRInline(new Date())
      }

      const records = $app.findRecordsByFilter('flex_sync', 'owner = {:owner}', '-created', 1, 0, {
        owner: ownerId,
      })

      const yesterdayDate = getYesterdayBRInline()
      const todayDate = getTodayBRInline()

      if (records.length === 0) {
        return e.json(200, {
          lastSync: null,
          yesterdayDate: yesterdayDate,
          todayDate: todayDate,
        })
      }

      const rec = records[0]
      let statusVal = rec.getString('status')
      const lastUpdated = new Date(rec.getString('updated') || rec.getString('created')).getTime()
      const timeSinceUpdate = Date.now() - lastUpdated

      if (statusVal === 'cancelling' && timeSinceUpdate > 10000) {
        try {
          statusVal = 'cancelled'
          rec.set('status', 'cancelled')
          rec.set(
            'current_step',
            'Importação interrompida (' +
              rec.getInt('created_count') +
              ' novos, ' +
              rec.getInt('updated_count') +
              ' atualizados).',
          )
          rec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(rec)
        } catch (_) {}
      } else if (statusVal === 'running' && timeSinceUpdate > 120000) {
        try {
          statusVal = 'error'
          rec.set('status', 'error')
          rec.set('error', 'Tempo limite atingido.')
          rec.set('current_step', 'Falha por tempo limite.')
          rec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(rec)
        } catch (_) {}
      }

      const total = rec.getInt('count')
      const imported = rec.getInt('imported')
      const totalDays = rec.getInt('total_days')
      const processedDays = rec.getInt('processed_days')
      const syncMode =
        rec.getString('sync_mode') || (rec.getBool('is_full_sync') ? 'day_by_day' : 'single_date')

      let progressPercent = 0
      if (syncMode === 'day_by_day' && totalDays > 0) {
        progressPercent = Math.min(100, Math.round((processedDays / totalDays) * 100))
      } else if (total > 0) {
        progressPercent = Math.min(100, Math.round((imported / total) * 100))
      }

      return e.json(200, {
        lastSync: {
          id: rec.id,
          status: statusVal,
          currentStep: rec.getString('current_step'),
          count: total,
          imported: imported,
          createdCount: rec.getInt('created_count'),
          updatedCount: rec.getInt('updated_count'),
          percent: progressPercent,
          error: rec.getString('error'),
          syncDate: rec.getString('sync_date') || yesterdayDate,
          syncStartDate: rec.getString('sync_start_date'),
          totalDays: totalDays,
          processedDays: processedDays,
          currentDayDate: rec.getString('current_day_date'),
          syncMode: syncMode,
          isFullSync: rec.getBool('is_full_sync'),
          yesterdayDate: yesterdayDate,
          todayDate: todayDate,
          startedAt: rec.getString('started_at'),
          finishedAt: rec.getString('finished_at'),
          created: rec.getString('created'),
          updated: rec.getString('updated'),
        },
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      throw new BadRequestError(msg)
    }
  },
  $apis.requireAuth(),
)

// 5. Rota de teste/diagnóstico do endpoint getByDtAtz
routerAdd('GET', '/backend/v1/flexsmart/test-by-date', (e) => {
  try {
    const queryParams = e.request.url.query()
    const targetDate = queryParams.get('data') || '26/10/2026'

    function getInlineToken() {
      const username =
        $os.getenv('FLEXSMART_USERNAME') ||
        ($secrets && $secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
      const password =
        $os.getenv('FLEXSMART_PASSWORD') ||
        ($secrets && $secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

      const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
      const r = $http.send({
        url: loginUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
        timeout: 30,
      })
      const pj = r.json || (r.raw ? JSON.parse(r.raw) : null)
      return pj && pj.access_token ? pj.access_token : null
    }

    const token = getInlineToken()
    if (!token) {
      return e.json(500, { error: 'Falha ao autenticar no ERP' })
    }

    const rawBase =
      $os.getenv('FLEXSMART_BASE_URL') ||
      ($secrets && $secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
      'https://api.impave.com.br:8443'
    const base = rawBase.replace(/\/+$/, '')

    const url = base + '/Cliente/getByDtAtz?data=' + encodeURIComponent(targetDate)
    const t0 = Date.now()
    const res = $http.send({
      url: url,
      method: 'GET',
      headers: {
        AuthToken: token,
        Accept: 'application/json',
      },
      timeout: 45,
    })
    const elapsedMs = Date.now() - t0

    const rawLen = res.raw ? res.raw.length : 0
    const rawKB = (rawLen / 1024).toFixed(2)
    const isArr = Array.isArray(res.json)
    let count = isArr ? res.json.length : 0
    let sample = isArr && count > 0 ? res.json[0] : null
    let format = isArr ? 'direct_array' : typeof res.json

    console.log(
      '[FlexSmart-TestByDate] data=' +
        targetDate +
        ' HTTP=' +
        res.statusCode +
        ' ms=' +
        elapsedMs +
        ' bytes=' +
        rawLen +
        ' (' +
        rawKB +
        ' KB) count=' +
        count,
    )

    return e.json(200, {
      success: true,
      dataParam: targetDate,
      statusCode: res.statusCode,
      elapsedMs: elapsedMs,
      rawBytes: rawLen,
      rawKB: rawKB,
      format: format,
      count: count,
      sample: sample,
      snippet: String(res.raw || '').slice(0, 300),
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return e.json(500, { success: false, error: msg })
  }
})

// 6. Rota de teste/diagnóstico de login
routerAdd('POST', '/backend/v1/flexsmart/test-login', (e) => {
  try {
    const username =
      $os.getenv('FLEXSMART_USERNAME') ||
      ($secrets && $secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
    const password =
      $os.getenv('FLEXSMART_PASSWORD') ||
      ($secrets && $secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

    const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
    const r = $http.send({
      url: loginUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
      timeout: 30,
    })
    const pj = r.json || (r.raw ? JSON.parse(r.raw) : null)
    if (pj && pj.access_token) {
      return e.json(200, {
        success: true,
        access_token: pj.access_token,
      })
    }
    return e.json(400, { success: false, error: 'Login falhou: HTTP ' + r.statusCode })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return e.json(400, {
      success: false,
      error: msg,
    })
  }
})

// 7. Rota síncrona /backend/v1/flexsmart/sync (mantida por compatibilidade usando o endpoint getByDtAtz)
routerAdd(
  'POST',
  '/backend/v1/flexsmart/sync',
  (e) => {
    try {
      const authRecord = e.auth
      const ownerId = authRecord ? authRecord.id : null

      if (!ownerId) {
        return e.json(401, { error: 'Usuário não autenticado' })
      }

      function cleanDigitsSync(str) {
        if (!str) return ''
        return String(str).replace(/\D/g, '')
      }

      function pickFirstSync(obj, keys) {
        if (!obj || typeof obj !== 'object') return ''
        for (const k of keys) {
          const val = obj[k]
          if (val !== undefined && val !== null) {
            if (typeof val === 'object') {
              const nestedName = pickFirstSync(val, [
                'nmCidade',
                'nome',
                'dsCidade',
                'dsBairro',
                'nmBairro',
                'uf',
                'sgUf',
              ])
              if (nestedName) return nestedName
            }
            const s = String(val).trim()
            if (s !== '') return s
          }
        }
        return ''
      }

      const username =
        $os.getenv('FLEXSMART_USERNAME') ||
        ($secrets && $secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
      const password =
        $os.getenv('FLEXSMART_PASSWORD') ||
        ($secrets && $secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

      const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
      const lr = $http.send({
        url: loginUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
        timeout: 30,
      })
      const lpj = lr.json || (lr.raw ? JSON.parse(lr.raw) : null)
      const token = lpj && lpj.access_token ? lpj.access_token : null

      if (!token) {
        return e.json(500, { error: 'Falha ao autenticar no FlexSmart' })
      }

      const rawBase =
        $os.getenv('FLEXSMART_BASE_URL') ||
        ($secrets && $secrets.has('FLEXSMART_BASE_URL')
          ? $secrets.get('FLEXSMART_BASE_URL')
          : '') ||
        'https://api.impave.com.br:8443'
      const base = rawBase.replace(/\/+$/, '')

      const d = new Date()
      d.setDate(d.getDate() - 1)
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      const targetDate = day + '/' + month + '/' + year

      const r = $http.send({
        url: base + '/Cliente/getByDtAtz?data=' + encodeURIComponent(targetDate),
        method: 'GET',
        headers: { AuthToken: token, Accept: 'application/json' },
        timeout: 60,
      })

      let erpList = []
      if (Array.isArray(r.json)) {
        erpList = r.json
      } else if (r.raw) {
        try {
          const parsed = JSON.parse(r.raw)
          if (Array.isArray(parsed)) erpList = parsed
        } catch (_) {}
      }

      const totalErp = erpList.length

      const existingRecords = $app.findRecordsByFilter(
        'clients',
        'owner = {:owner}',
        '-created',
        100000,
        0,
        { owner: ownerId },
      )

      const clientsByErpCode = new Map()
      const clientsByDoc = new Map()

      for (const rec of existingRecords) {
        const erpCode = rec.getString('erp_code')
        const doc = cleanDigitsSync(rec.getString('document'))
        if (erpCode) clientsByErpCode.set(erpCode, rec)
        if (doc) clientsByDoc.set(doc, rec)
      }

      const clientsCol = $app.findCollectionByNameOrId('clients')
      let createdCount = 0
      let updatedCount = 0
      let errorCount = 0

      for (let i = 0; i < totalErp; i++) {
        const item = erpList[i]
        erpList[i] = null
        if (!item || typeof item !== 'object') {
          errorCount++
          continue
        }

        try {
          const erpCode = pickFirstSync(item, [
            'cdCliente',
            'cd_cliente',
            'codCliente',
            'codigoCliente',
            'codigo',
            'id',
          ])
          const docRaw = pickFirstSync(item, [
            'cnpjCpf',
            'cnpj_cpf',
            'cpfCnpj',
            'cpf_cnpj',
            'cnpj',
            'cpf',
            'documento',
            'doc',
          ])
          const docClean = cleanDigitsSync(docRaw)
          const nameRaw = pickFirstSync(item, [
            'nmCliente',
            'nmFantasia',
            'nomeCliente',
            'razaoSocial',
            'nome',
          ])
          const emailRaw = pickFirstSync(item, ['email', 'emailNfe', 'emailCompras'])
          const phoneRaw = pickFirstSync(item, ['celular', 'fone', 'telefone'])

          const logradouro = pickFirstSync(item, ['enderecoLogradouro', 'logradouro', 'endereco'])
          const numero = pickFirstSync(item, ['enderecoNumero', 'numero'])
          const complemento = pickFirstSync(item, ['enderecoComplemento', 'complemento'])

          let bairro = ''
          if (item.bairro && typeof item.bairro === 'object') {
            bairro = pickFirstSync(item.bairro, ['nmBairro', 'dsBairro', 'nome'])
          }
          if (!bairro) {
            bairro = pickFirstSync(item, ['bairro', 'dsBairro', 'nmBairro'])
          }

          let fullAddressParts = []
          if (logradouro) {
            let addr = logradouro
            if (numero) addr += ', ' + numero
            if (complemento) addr += ' (' + complemento + ')'
            if (bairro) addr += ' - ' + bairro
            fullAddressParts.push(addr)
          }
          const address = fullAddressParts.join(', ')

          let cityRaw = ''
          let stateRaw = ''
          if (item.cidade && typeof item.cidade === 'object') {
            cityRaw = pickFirstSync(item.cidade, ['nmCidade', 'nome'])
            stateRaw = pickFirstSync(item.cidade, ['uf', 'sgUf'])
          }
          if (!cityRaw) cityRaw = pickFirstSync(item, ['nmCidade', 'cidade', 'municipio'])
          if (!stateRaw) stateRaw = pickFirstSync(item, ['uf', 'sgUf', 'estado'])

          let name = nameRaw
          if (!name || name.trim().length < 2) {
            name = 'Cliente ' + (erpCode || docClean || i + 1)
          }

          let targetRecord = null
          if (erpCode && clientsByErpCode.has(erpCode)) {
            targetRecord = clientsByErpCode.get(erpCode)
          } else if (docClean && clientsByDoc.has(docClean)) {
            targetRecord = clientsByDoc.get(docClean)
          }

          const isUpdate = !!targetRecord
          const rec = targetRecord || new Record(clientsCol)

          if (!isUpdate) {
            rec.set('owner', ownerId)
          }

          rec.set('name', name)
          if (erpCode) rec.set('erp_code', erpCode)
          if (docClean) rec.set('document', docClean)
          if (emailRaw && emailRaw.indexOf('@') > 0) rec.set('email', emailRaw)
          if (phoneRaw) rec.set('phone', cleanDigitsSync(phoneRaw))
          if (address) rec.set('address', address)
          if (cityRaw) rec.set('city', cityRaw)
          if (stateRaw) rec.set('state', stateRaw.toUpperCase().slice(0, 2))

          $app.save(rec)

          if (erpCode) clientsByErpCode.set(erpCode, rec)
          if (docClean) clientsByDoc.set(docClean, rec)

          if (isUpdate) updatedCount++
          else createdCount++
        } catch (_) {
          errorCount++
        }
      }

      return e.json(200, {
        success: true,
        totalErp: totalErp,
        created: createdCount,
        updated: updatedCount,
        errors: errorCount,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      return e.json(400, {
        success: false,
        error: msg,
      })
    }
  },
  $apis.requireAuth(),
)
