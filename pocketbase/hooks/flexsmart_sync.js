// flexsmart_sync.js - Integração com ERP FlexSmart
// 1. POST /login com username/password dos segredos -> access_token
// 2. Cache em memória do token ($app.store()) com re-login automático em caso de 401/403
// 3. GET /Cliente/getAll com header AuthToken: <access_token>
// 4. Mapeamento e deduplicação (erp_code e CPF/CNPJ) na coleção clients para o usuário autenticado
// 5. Execução em segundo plano com gravação de progresso em lotes na coleção `flex_sync`
// 6. Rotas:
//    - POST /backend/v1/flexsmart/start-sync -> dispara o job assíncrono e retorna o id do registro em flex_sync
//    - GET  /backend/v1/flexsmart/sync-status/{id} -> retorna o status do job (total, processados, criados, atualizados, erros)
//    - GET  /backend/v1/flexsmart/last-sync -> retorna o último job de sincronização do usuário
//    - POST /backend/v1/flexsmart/sync -> rota síncrona mantida por retrocompatibilidade
//    - POST /backend/v1/flexsmart/test-login -> teste de login
//    - GET  /backend/v1/flexsmart/test-get-all -> teste de diagnóstico para verificar resposta de /Cliente/getAll
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

// Diagnóstico sob trigger de atualização em flex_sync
onRecordUpdate((e) => {
  try {
    const errText = e.record.getString('error')
    if (errText === 'TRIGGER_ALL_DIAGNOSTIC') {
      const username =
        $os.getenv('FLEXSMART_USERNAME') ||
        ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
      const password =
        $os.getenv('FLEXSMART_PASSWORD') ||
        ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

      const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
      const loginRes = $http.send({
        url: loginUrl,
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

      if (!pj || !pj.access_token) {
        e.record.set('error', 'LOGIN_FAILED: ' + String(loginRes.raw).slice(0, 200))
        return
      }

      const token = pj.access_token

      const getAllRes = $http.send({
        url: 'https://api.impave.com.br:8443/Cliente/getAll',
        method: 'GET',
        headers: {
          AuthToken: token,
          Accept: 'application/json',
        },
        timeout: 90,
      })

      let dados = getAllRes.json
      if (!dados && getAllRes.raw) {
        try {
          dados = JSON.parse(getAllRes.raw)
        } catch (_) {}
      }

      const isArr = Array.isArray(dados)
      const count = isArr ? dados.length : dados ? Object.keys(dados).length : 0
      let sampleData = {}
      if (isArr && dados.length > 0) {
        sampleData = dados[0]
      }

      e.record.set('sample', sampleData)
      e.record.set('count', count)
      e.record.set(
        'error',
        'STATUS_' + getAllRes.statusCode + '_ISARR_' + isArr + '_COUNT_' + count,
      )
    }
  } catch (err) {
    e.record.set('error', 'EXC: ' + String(err).slice(0, 200))
  }
}, 'flex_sync')

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

      // Verifica se já existe uma sincronização em andamento para este usuário nos últimos 10 minutos
      const activeSyncs = $app.findRecordsByFilter(
        'flex_sync',
        'owner = {:owner} && status = "running"',
        '-created',
        1,
        0,
        { owner: ownerId },
      )

      if (activeSyncs.length > 0) {
        const active = activeSyncs[0]
        const createdTime = new Date(active.getString('created')).getTime()
        const now = Date.now()
        // Se tem menos de 10 minutos rodando, retorna o job existente
        if (now - createdTime < 600000) {
          return e.json(200, {
            syncId: active.id,
            status: active.getString('status'),
            count: active.getInt('count'),
            imported: active.getInt('imported'),
            created_count: active.getInt('created_count'),
            updated_count: active.getInt('updated_count'),
            message: 'Uma sincronização já está em andamento.',
          })
        }
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
      syncRec.set('current_step', 'Iniciando sincronização...')
      $app.save(syncRec)

      const syncId = syncRec.id
      console.log(
        '[FlexSmart] Novo job de sincronização criado: ' + syncId + ' para owner ' + ownerId,
      )

      // Executa o processamento assíncrono em segundo plano
      setTimeout(() => {
        function getToken(forceRefresh) {
          const username =
            $os.getenv('FLEXSMART_USERNAME') ||
            ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
          const password =
            $os.getenv('FLEXSMART_PASSWORD') ||
            ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

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
          console.log('[FlexSmart-Async] Realizando login estrito em ' + loginUrl)

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
            console.log('[FlexSmart-Async] Erro na requisição HTTP de login: ' + String(errSend))
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

        function fetchERP(forceRelogin) {
          const rawBase =
            $os.getenv('FLEXSMART_BASE_URL') ||
            ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
            'https://api.impave.com.br:8443'
          const base = rawBase.replace(/\/+$/, '')
          const token = getToken(forceRelogin)

          console.log('[FlexSmart-Async] Buscando clientes em ' + base + '/Cliente/getAll')

          let res = null
          let lastErr = null
          try {
            res = $http.send({
              url: base + '/Cliente/getAll',
              method: 'GET',
              headers: {
                AuthToken: token,
                Accept: 'application/json',
              },
              timeout: 180,
            })
          } catch (eGet) {
            lastErr = eGet
          }

          if (!res) {
            throw new Error(
              'Falha ao conectar no endpoint /Cliente/getAll do FlexSmart: ' +
                (lastErr ? String(lastErr) : 'sem resposta'),
            )
          }

          if ((res.statusCode === 401 || res.statusCode === 403) && !forceRelogin) {
            console.log('[FlexSmart-Async] Resposta ' + res.statusCode + ', renovando token...')
            try {
              if ($app.store) {
                $app.store().remove('flexsmart_cached_token')
                $app.store().remove('flexsmart_token_time')
              }
            } catch (_) {}
            return fetchERP(true)
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            let detail = ''
            if (res.raw) {
              detail = ' - ' + String(res.raw).slice(0, 300)
            }
            throw new Error(
              'Falha ao buscar clientes no ERP FlexSmart: HTTP ' + res.statusCode + detail,
            )
          }

          let dados = res.json
          if (!dados && res.raw) {
            try {
              dados = JSON.parse(res.raw)
            } catch (_) {}
          }

          if (Array.isArray(dados)) {
            return dados
          }

          if (dados && typeof dados === 'object') {
            const candidateKeys = [
              'clientes',
              'clients',
              'data',
              'dados',
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
              if (Array.isArray(dados[key])) {
                return dados[key]
              }
            }
            for (const k of Object.keys(dados)) {
              if (Array.isArray(dados[k])) {
                return dados[k]
              }
            }
            if (
              dados.cdCliente ||
              dados.nmCliente ||
              dados.cnpjCpf ||
              dados.id ||
              dados.codigo ||
              dados.nome ||
              dados.razaoSocial
            ) {
              return [dados]
            }
          }

          throw new Error('Resposta de /Cliente/getAll não continha uma lista de clientes válida')
        }

        function pickFirst(obj, keys) {
          for (const k of keys) {
            const val = obj[k]
            if (val !== undefined && val !== null) {
              const s = String(val).trim()
              if (s !== '') return s
            }
          }
          return ''
        }

        function cleanDigits(str) {
          if (!str) return ''
          return String(str).replace(/\D/g, '')
        }

        let jobRec = null
        try {
          jobRec = $app.findRecordById('flex_sync', syncId)
        } catch (_) {
          return
        }

        try {
          jobRec.set('status', 'running')
          jobRec.set('current_step', 'Buscando clientes no ERP...')
          jobRec.set('started_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(jobRec)

          console.log('[FlexSmart-Async ' + syncId + '] Chamando /Cliente/getAll...')
          const erpList = fetchERP(false)
          const totalErp = erpList.length
          console.log('[FlexSmart-Async ' + syncId + '] Total recebido do ERP: ' + totalErp)

          if (totalErp > 0 && typeof erpList[0] === 'object') {
            try {
              jobRec.set('sample', erpList[0])
            } catch (_) {}
          }

          jobRec.set('count', totalErp)
          jobRec.set('imported', 0)
          jobRec.set('created_count', 0)
          jobRec.set('updated_count', 0)
          jobRec.set('current_step', 'Processando ' + totalErp + ' clientes...')
          $app.save(jobRec)

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
            const doc = cleanDigits(rec.getString('document'))
            if (erpCode) clientsByErpCode.set(erpCode, rec)
            if (doc) clientsByDoc.set(doc, rec)
          }

          const clientsCol = $app.findCollectionByNameOrId('clients')
          let createdCount = 0
          let updatedCount = 0
          let errorCount = 0
          const BATCH_SIZE = 25

          for (let i = 0; i < totalErp; i++) {
            const item = erpList[i]
            if (!item || typeof item !== 'object') {
              errorCount++
              continue
            }

            try {
              const erpCode = pickFirst(item, [
                'cdCliente',
                'cd_cliente',
                'codCliente',
                'codigoCliente',
                'codigo',
                'id',
              ])

              const docRaw = pickFirst(item, [
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
              const docClean = cleanDigits(docRaw)

              const nameRaw = pickFirst(item, [
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

              const emailRaw = pickFirst(item, [
                'email',
                'emailNfe',
                'emailCompras',
                'e_mail',
                'dsEmail',
                'mail',
              ])

              const phoneRaw = pickFirst(item, [
                'celular',
                'fone',
                'telefone',
                'nrTelefone',
                'phone',
                'tel',
                'dsTelefone',
              ])

              const logradouro = pickFirst(item, [
                'enderecoLogradouro',
                'logradouro',
                'endereco',
                'rua',
                'dsEndereco',
              ])
              const numero = pickFirst(item, ['enderecoNumero', 'numero', 'nrEndereco'])
              const complemento = pickFirst(item, [
                'enderecoComplemento',
                'complemento',
                'dsComplemento',
              ])
              const bairro = pickFirst(item, ['bairro', 'dsBairro'])

              let fullAddressParts = []
              if (logradouro) {
                let addr = logradouro
                if (numero) addr += ', ' + numero
                if (complemento) addr += ' (' + complemento + ')'
                if (bairro) addr += ' - ' + bairro
                fullAddressParts.push(addr)
              } else if (pickFirst(item, ['address', 'ds_endereco'])) {
                fullAddressParts.push(pickFirst(item, ['address', 'ds_endereco']))
              }
              const address = fullAddressParts.join(', ')

              const cityRaw = pickFirst(item, [
                'nmCidade',
                'cidade',
                'municipio',
                'dsCidade',
                'ds_cidade',
                'nm_municipio',
              ])

              const stateRaw = pickFirst(item, [
                'uf',
                'sgUf',
                'siglaUf',
                'estado',
                'state',
                'dsUf',
                'ds_uf',
              ])

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
                rec.set('phone', cleanDigits(phoneRaw))
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

              if (isUpdate) {
                updatedCount++
              } else {
                createdCount++
              }
            } catch (itemErr) {
              console.log('[FlexSmart-Async] Erro ao gravar cliente #' + i + ': ' + String(itemErr))
              errorCount++
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
                    ' clientes (' +
                    createdCount +
                    ' novos, ' +
                    updatedCount +
                    ' atualizados)...',
                )
                $app.save(jobRec)
              } catch (_) {}
            }
          }

          jobRec.set('status', 'done')
          jobRec.set('imported', totalErp)
          jobRec.set('created_count', createdCount)
          jobRec.set('updated_count', updatedCount)
          jobRec.set('current_step', 'Concluído com sucesso!')
          jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(jobRec)

          console.log(
            '[FlexSmart-Async ' +
              syncId +
              '] Finalizado com sucesso: total=' +
              totalErp +
              ', criados=' +
              createdCount +
              ', atualizados=' +
              updatedCount +
              ', erros=' +
              errorCount,
          )
        } catch (err) {
          const msg = err && err.message ? err.message : String(err)
          console.log('[FlexSmart-Async ' + syncId + '] Falha: ' + msg)
          try {
            jobRec.set('status', 'error')
            jobRec.set('error', msg)
            jobRec.set('current_step', 'Erro: ' + msg)
            jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            $app.save(jobRec)
          } catch (_) {}
        }
      }, 50)

      return e.json(200, {
        success: true,
        syncId: syncId,
        status: 'pending',
        message: 'Importação iniciada com sucesso em segundo plano.',
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.log('[FlexSmart] Erro ao iniciar sincronização: ' + msg)
      return e.json(400, {
        success: false,
        error: msg,
      })
    }
  },
  $apis.requireAuth(),
)

// 2. Rota para CONSULTAR o status do job de sincronização
routerAdd(
  'GET',
  '/backend/v1/flexsmart/sync-status/{id}',
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

      const total = rec.getInt('count')
      const imported = rec.getInt('imported')
      const progressPercent = total > 0 ? Math.min(100, Math.round((imported / total) * 100)) : 0

      return e.json(200, {
        id: rec.id,
        status: rec.getString('status'),
        currentStep: rec.getString('current_step'),
        count: total,
        imported: imported,
        createdCount: rec.getInt('created_count'),
        updatedCount: rec.getInt('updated_count'),
        percent: progressPercent,
        error: rec.getString('error'),
        startedAt: rec.getString('started_at'),
        finishedAt: rec.getString('finished_at'),
        created: rec.getString('created'),
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      return e.json(400, { error: msg })
    }
  },
  $apis.requireAuth(),
)

// 3. Rota para consultar o ÚLTIMO job de sincronização
routerAdd(
  'GET',
  '/backend/v1/flexsmart/last-sync',
  (e) => {
    try {
      const authRecord = e.auth
      const ownerId = authRecord ? authRecord.id : null

      if (!ownerId) {
        return e.json(401, { error: 'Usuário não autenticado' })
      }

      const records = $app.findRecordsByFilter('flex_sync', 'owner = {:owner}', '-created', 1, 0, {
        owner: ownerId,
      })

      if (records.length === 0) {
        return e.json(200, { lastSync: null })
      }

      const rec = records[0]
      const total = rec.getInt('count')
      const imported = rec.getInt('imported')
      const progressPercent = total > 0 ? Math.min(100, Math.round((imported / total) * 100)) : 0

      return e.json(200, {
        lastSync: {
          id: rec.id,
          status: rec.getString('status'),
          currentStep: rec.getString('current_step'),
          count: total,
          imported: imported,
          createdCount: rec.getInt('created_count'),
          updatedCount: rec.getInt('updated_count'),
          percent: progressPercent,
          error: rec.getString('error'),
          startedAt: rec.getString('started_at'),
          finishedAt: rec.getString('finished_at'),
          created: rec.getString('created'),
        },
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      return e.json(400, { error: msg })
    }
  },
  $apis.requireAuth(),
)

// 4. Rota de teste/diagnóstico para verificar o endpoint /Cliente/getAll
routerAdd(
  'GET',
  '/backend/v1/flexsmart/test-get-all',
  (e) => {
    try {
      console.log('[FlexSmart-TestGetAll] Chamando /Cliente/getAll...')
      function getTestToken() {
        const username =
          $os.getenv('FLEXSMART_USERNAME') ||
          ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
        const password =
          $os.getenv('FLEXSMART_PASSWORD') ||
          ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

        const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
        const res = $http.send({
          url: loginUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, password: password }),
          timeout: 30,
        })

        let parsed = res.json
        if (!parsed && res.raw) {
          try {
            parsed = JSON.parse(res.raw)
          } catch (_) {}
        }
        if (parsed && parsed.access_token) {
          return parsed.access_token
        }
        throw new Error('Falha no login: HTTP ' + res.statusCode + ' ' + (res.raw || ''))
      }

      const rawBase =
        $os.getenv('FLEXSMART_BASE_URL') ||
        ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
        'https://api.impave.com.br:8443'
      const base = rawBase.replace(/\/+$/, '')
      const token = getTestToken()

      const targetUrl = base + '/Cliente/getAll'
      console.log(
        '[FlexSmart-TestGetAll] URL: ' + targetUrl + ' com token: ' + token.slice(0, 8) + '...',
      )

      const res = $http.send({
        url: targetUrl,
        method: 'GET',
        headers: {
          AuthToken: token,
          Accept: 'application/json',
        },
        timeout: 180,
      })

      console.log('[FlexSmart-TestGetAll] HTTP Status: ' + res.statusCode)

      let parsed = res.json
      if (!parsed && res.raw) {
        try {
          parsed = JSON.parse(res.raw)
        } catch (_) {}
      }

      const isArray = Array.isArray(parsed)
      const count = isArray
        ? parsed.length
        : parsed && typeof parsed === 'object'
          ? Object.keys(parsed).length
          : 0
      const firstItem = isArray && parsed.length > 0 ? parsed[0] : null
      const firstItemKeys = firstItem ? Object.keys(firstItem) : []

      console.log(
        '[FlexSmart-TestGetAll] Resposta: isArray=' +
          isArray +
          ', count=' +
          count +
          ', keys 1º item=[' +
          firstItemKeys.slice(0, 15).join(', ') +
          ']',
      )

      return e.json(200, {
        success: true,
        statusCode: res.statusCode,
        isArray: isArray,
        count: count,
        firstItemKeys: firstItemKeys,
        firstItemSample: firstItem,
        rawSnippet: String(res.raw || '').slice(0, 500),
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.log('[FlexSmart-TestGetAll] Erro: ' + msg)
      return e.json(500, {
        success: false,
        error: msg,
      })
    }
  },
  $apis.requireAuth(),
)

// 5. Rota de teste/diagnóstico de login (Passo 1)
routerAdd('POST', '/backend/v1/flexsmart/test-login', (e) => {
  try {
    const username =
      $os.getenv('FLEXSMART_USERNAME') ||
      ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
    const password =
      $os.getenv('FLEXSMART_PASSWORD') ||
      ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

    const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
    const res = $http.send({
      url: loginUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
      timeout: 30,
    })

    let parsed = res.json
    if (!parsed && res.raw) {
      try {
        parsed = JSON.parse(res.raw)
      } catch (_) {}
    }

    if (parsed && parsed.access_token) {
      return e.json(200, {
        success: true,
        access_token: parsed.access_token,
      })
    }

    return e.json(400, {
      success: false,
      error: 'Token não retornado: HTTP ' + res.statusCode,
      raw: res.raw,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return e.json(400, {
      success: false,
      error: msg,
    })
  }
})

// 6. Rota síncrona /backend/v1/flexsmart/sync (executa e retorna resultado final)
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

      function getToken(forceRefresh) {
        const username =
          $os.getenv('FLEXSMART_USERNAME') ||
          ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
        const password =
          $os.getenv('FLEXSMART_PASSWORD') ||
          ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

        const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
        const res = $http.send({
          url: loginUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, password: password }),
          timeout: 30,
        })

        let parsed = res.json
        if (!parsed && res.raw) {
          try {
            parsed = JSON.parse(res.raw)
          } catch (_) {}
        }
        if (parsed && parsed.access_token) {
          return parsed.access_token
        }
        throw new Error('Falha no login: HTTP ' + res.statusCode)
      }

      function fetchERP() {
        const rawBase =
          $os.getenv('FLEXSMART_BASE_URL') ||
          ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
          'https://api.impave.com.br:8443'
        const base = rawBase.replace(/\/+$/, '')
        const token = getToken(false)

        let res = $http.send({
          url: base + '/Cliente/getAll',
          method: 'GET',
          headers: {
            AuthToken: token,
            Accept: 'application/json',
          },
          timeout: 180,
        })

        if (res.statusCode === 401 || res.statusCode === 403) {
          const freshToken = getToken(true)
          res = $http.send({
            url: base + '/Cliente/getAll',
            method: 'GET',
            headers: {
              AuthToken: freshToken,
              Accept: 'application/json',
            },
            timeout: 180,
          })
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error('Falha ao buscar clientes: HTTP ' + res.statusCode)
        }

        let dados = res.json
        if (!dados && res.raw) {
          try {
            dados = JSON.parse(res.raw)
          } catch (_) {}
        }

        if (Array.isArray(dados)) return dados
        if (dados && typeof dados === 'object') {
          for (const k of Object.keys(dados)) {
            if (Array.isArray(dados[k])) return dados[k]
          }
        }
        throw new Error('Resposta de /Cliente/getAll não continha lista')
      }

      function pickFirst(obj, keys) {
        for (const k of keys) {
          const val = obj[k]
          if (val !== undefined && val !== null) {
            const s = String(val).trim()
            if (s !== '') return s
          }
        }
        return ''
      }

      function cleanDigits(str) {
        if (!str) return ''
        return String(str).replace(/\D/g, '')
      }

      const erpList = fetchERP()
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
        const doc = cleanDigits(rec.getString('document'))
        if (erpCode) clientsByErpCode.set(erpCode, rec)
        if (doc) clientsByDoc.set(doc, rec)
      }

      const clientsCol = $app.findCollectionByNameOrId('clients')
      let createdCount = 0
      let updatedCount = 0
      let errorCount = 0

      for (let i = 0; i < totalErp; i++) {
        const item = erpList[i]
        if (!item || typeof item !== 'object') {
          errorCount++
          continue
        }

        try {
          const erpCode = pickFirst(item, [
            'cdCliente',
            'cd_cliente',
            'codCliente',
            'codigoCliente',
            'codigo',
            'id',
          ])
          const docRaw = pickFirst(item, [
            'cnpjCpf',
            'cnpj_cpf',
            'cpfCnpj',
            'cpf_cnpj',
            'cnpj',
            'cpf',
            'documento',
            'doc',
          ])
          const docClean = cleanDigits(docRaw)
          const nameRaw = pickFirst(item, [
            'nmCliente',
            'nmFantasia',
            'nomeCliente',
            'razaoSocial',
            'nome',
          ])
          const emailRaw = pickFirst(item, ['email', 'emailNfe', 'emailCompras'])
          const phoneRaw = pickFirst(item, ['celular', 'fone', 'telefone'])

          const logradouro = pickFirst(item, ['enderecoLogradouro', 'logradouro', 'endereco'])
          const numero = pickFirst(item, ['enderecoNumero', 'numero'])
          const complemento = pickFirst(item, ['enderecoComplemento', 'complemento'])
          const bairro = pickFirst(item, ['bairro', 'dsBairro'])

          let fullAddressParts = []
          if (logradouro) {
            let addr = logradouro
            if (numero) addr += ', ' + numero
            if (complemento) addr += ' (' + complemento + ')'
            if (bairro) addr += ' - ' + bairro
            fullAddressParts.push(addr)
          }
          const address = fullAddressParts.join(', ')
          const cityRaw = pickFirst(item, ['nmCidade', 'cidade', 'municipio'])
          const stateRaw = pickFirst(item, ['uf', 'sgUf', 'estado'])

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
          if (phoneRaw) rec.set('phone', cleanDigits(phoneRaw))
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
