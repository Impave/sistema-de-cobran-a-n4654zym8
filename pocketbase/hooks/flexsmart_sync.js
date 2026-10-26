// flexsmart_sync.js - Integração com ERP FlexSmart
// 1. POST /login com username/password dos segredos -> access_token
// 2. Cache em memória do token ($app.store()) com re-login automático em caso de 401/403
// 3. GET /Cliente/getByDtAtz?data=DD/MM/AAAA com header AuthToken: <access_token>
// 4. Sincronização incremental: busca clientes alterados desde a última sincronização bem-sucedida
//    ou desde data base (01/01/2000) quando for importação completa ("do zero").
// 5. Mapeamento e deduplicação (erp_code e CPF/CNPJ) na coleção clients para o usuário autenticado
// 6. Execução em segundo plano com gravação de progresso em lotes na coleção `flex_sync`
// 7. Rotas:
//    - POST /backend/v1/flexsmart/start-sync -> dispara o job assíncrono (aceita { fullSync: boolean, date: string })
//    - POST /backend/v1/flexsmart/cancel-sync/{id} -> solicita interrupção do job assíncrono
//    - GET  /backend/v1/flexsmart/sync-status/{id} -> retorna o status do job (total, processados, criados, atualizados, erros)
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

      function formatCurrentDateBR() {
        const d = new Date()
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        return day + '/' + month + '/' + year
      }

      function formatDateToBR(dateObj) {
        if (!dateObj) return ''
        const d = new Date(dateObj)
        if (isNaN(d.getTime())) return ''
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        return day + '/' + month + '/' + year
      }

      // Lê parâmetros enviados no corpo se houver (fullSync: boolean, date: string)
      let reqBody = {}
      try {
        const rawBody = e.request.body ? e.request.body.readAll() : null
        if (rawBody && rawBody.length > 0) {
          reqBody = JSON.parse(String(rawBody))
        }
      } catch (_) {}

      const isFullSyncRequested = reqBody.fullSync === true

      let targetDate = ''
      if (reqBody.date && typeof reqBody.date === 'string' && reqBody.date.trim()) {
        targetDate = reqBody.date.trim()
      } else if (isFullSyncRequested) {
        targetDate = '01/01/2000'
      } else {
        try {
          const lastSuccessful = $app.findRecordsByFilter(
            'flex_sync',
            'owner = {:owner} && status = "done"',
            '-created',
            1,
            0,
            { owner: ownerId },
          )
          if (lastSuccessful.length > 0) {
            const rec = lastSuccessful[0]
            const savedSyncDate = rec.getString('sync_date')
            if (savedSyncDate && savedSyncDate.length >= 8) {
              targetDate = savedSyncDate
            } else {
              const startedAt = rec.getString('started_at') || rec.getString('created')
              targetDate = formatDateToBR(startedAt)
            }
          }
        } catch (_) {}

        if (!targetDate) {
          targetDate = '01/01/2000'
        }
      }

      // Limpa/finaliza jobs antigos que ficaram travados
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
      syncRec.set('is_full_sync', isFullSyncRequested || targetDate === '01/01/2000')
      syncRec.set('current_step', 'Iniciando sincronização (desde ' + targetDate + ')...')
      $app.save(syncRec)

      const syncId = syncRec.id
      console.log(
        '[FlexSmart] Novo job de sincronização criado: ' +
          syncId +
          ' para owner ' +
          ownerId +
          ' com data=' +
          targetDate,
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
          console.log('[FlexSmart-Async] Realizando login em ' + loginUrl)

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

        function fetchERPByDate(searchDate, forceRelogin, jobProgressUpdate) {
          const rawBase =
            $os.getenv('FLEXSMART_BASE_URL') ||
            ($secrets && $secrets.has('FLEXSMART_BASE_URL')
              ? $secrets.get('FLEXSMART_BASE_URL')
              : '') ||
            'https://api.impave.com.br:8443'
          const base = rawBase.replace(/\/+$/, '')
          const token = getFlexSmartToken(forceRelogin)

          if (jobProgressUpdate) {
            jobProgressUpdate('Buscando clientes alterados desde ' + searchDate + ' no ERP...')
          }
          console.log(
            '[FlexSmart-Async] Buscando clientes em ' +
              base +
              '/Cliente/getByDtAtz?data=' +
              encodeURIComponent(searchDate),
          )

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
          console.log(
            '[FlexSmart-Async] Requisição /Cliente/getByDtAtz concluída em ' + elapsedSec + 's',
          )

          if (!res) {
            throw new Error(
              'Falha ao conectar no endpoint /Cliente/getByDtAtz do FlexSmart após ' +
                elapsedSec +
                's: ' +
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
            return fetchERPByDate(searchDate, true, jobProgressUpdate)
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

          if (jobProgressUpdate) {
            jobProgressUpdate('Processando dados recebidos do ERP...')
          }

          if (Array.isArray(res.json)) {
            console.log(
              '[FlexSmart-Async] Array direto em res.json: ' + res.json.length + ' registros.',
            )
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
                console.log(
                  '[FlexSmart-Async] Encontrado array na chave "' +
                    key +
                    '": ' +
                    res.json[key].length +
                    ' registros.',
                )
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
              console.log('[FlexSmart-Async] JSON.parse(res.raw) falhou: ' + String(pErr))
              throw new Error('Falha ao interpretar dados JSON do ERP: ' + String(pErr))
            }
          }

          return []
        }

        function pickFirst(obj, keys) {
          if (!obj || typeof obj !== 'object') return ''
          for (const k of keys) {
            const val = obj[k]
            if (val !== undefined && val !== null) {
              if (typeof val === 'object') {
                const nestedName = pickFirst(val, [
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
          const st = jobRec.getString('status')
          if (st === 'cancelling' || st === 'cancelled') {
            jobRec.set('status', 'cancelled')
            jobRec.set('current_step', 'Importação cancelada antes de iniciar.')
            jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            $app.save(jobRec)
            console.log('[FlexSmart-Async ' + syncId + '] Cancelado antes do início.')
            return
          }

          jobRec.set('status', 'running')
          jobRec.set(
            'current_step',
            'Buscando clientes alterados desde ' + targetDate + ' no ERP...',
          )
          jobRec.set('started_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
          $app.save(jobRec)

          console.log(
            '[FlexSmart-Async ' +
              syncId +
              '] Chamando /Cliente/getByDtAtz?data=' +
              targetDate +
              '...',
          )

          const erpList = fetchERPByDate(targetDate, false, (stepText) => {
            try {
              jobRec.set('current_step', stepText)
              $app.save(jobRec)
            } catch (_) {}
          })

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

          if (totalErp === 0) {
            jobRec.set('status', 'done')
            jobRec.set('current_step', 'Nenhum cliente alterado desde ' + targetDate + '.')
            jobRec.set('sync_date', formatCurrentDateBR())
            jobRec.set('finished_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            $app.save(jobRec)
            console.log(
              '[FlexSmart-Async ' +
                syncId +
                '] Concluído: 0 clientes alterados na data ' +
                targetDate,
            )
            return
          }

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
          let wasCancelled = false
          const BATCH_SIZE = 20

          for (let i = 0; i < totalErp; i++) {
            if (i % BATCH_SIZE === 0) {
              try {
                const checkRec = $app.findRecordById('flex_sync', syncId)
                const currentStatus = checkRec.getString('status')
                if (currentStatus === 'cancelling' || currentStatus === 'cancelled') {
                  console.log(
                    '[FlexSmart-Async ' +
                      syncId +
                      '] Interrupção solicitada detectada no índice ' +
                      i,
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

              let bairro = ''
              if (item.bairro && typeof item.bairro === 'object') {
                bairro = pickFirst(item.bairro, ['nmBairro', 'dsBairro', 'nome'])
              }
              if (!bairro) {
                bairro = pickFirst(item, ['bairro', 'dsBairro', 'nmBairro'])
              }

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

              let cityRaw = ''
              let stateRaw = ''
              if (item.cidade && typeof item.cidade === 'object') {
                cityRaw = pickFirst(item.cidade, ['nmCidade', 'nome', 'dsCidade'])
                stateRaw = pickFirst(item.cidade, ['uf', 'sgUf', 'siglaUf', 'estado'])
              }
              if (!cityRaw) {
                cityRaw = pickFirst(item, [
                  'nmCidade',
                  'cidade',
                  'municipio',
                  'dsCidade',
                  'ds_cidade',
                  'nm_municipio',
                ])
              }
              if (!stateRaw) {
                stateRaw = pickFirst(item, [
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
              '[FlexSmart-Async ' +
                syncId +
                '] Interrompido pelo usuário com sucesso: criados=' +
                createdCount +
                ', atualizados=' +
                updatedCount,
            )
            return
          }

          const todayBR = formatCurrentDateBR()
          jobRec.set('status', 'done')
          jobRec.set('imported', totalErp)
          jobRec.set('created_count', createdCount)
          jobRec.set('updated_count', updatedCount)
          jobRec.set('sync_date', todayBR)
          jobRec.set(
            'current_step',
            'Concluído! ' + createdCount + ' novos, ' + updatedCount + ' atualizados.',
          )
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
              ', sync_date=' +
              todayBR,
          )
        } catch (err) {
          const msg = err && err.message ? err.message : String(err)
          console.log('[FlexSmart-Async ' + syncId + '] Falha: ' + msg)
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
        isFullSync: isFullSyncRequested || targetDate === '01/01/2000',
        message: 'Importação iniciada com sucesso em segundo plano (desde ' + targetDate + ').',
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
        message: 'Interrupção solicitada com sucesso. O processamento será parado imediatamente.',
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
      } else if (currentStatus === 'running' && timeSinceUpdate > 90000) {
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
      const progressPercent = total > 0 ? Math.min(100, Math.round((imported / total) * 100)) : 0

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

      function formatDateToBR(dateObj) {
        if (!dateObj) return ''
        const d = new Date(dateObj)
        if (isNaN(d.getTime())) return ''
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const year = d.getFullYear()
        return day + '/' + month + '/' + year
      }

      const records = $app.findRecordsByFilter('flex_sync', 'owner = {:owner}', '-created', 1, 0, {
        owner: ownerId,
      })

      if (records.length === 0) {
        return e.json(200, { lastSync: null })
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
      } else if (statusVal === 'running' && timeSinceUpdate > 90000) {
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
      const progressPercent = total > 0 ? Math.min(100, Math.round((imported / total) * 100)) : 0

      let nextIncrementalDate = '01/01/2000'
      try {
        const lastSuccess = $app.findRecordsByFilter(
          'flex_sync',
          'owner = {:owner} && status = "done"',
          '-created',
          1,
          0,
          { owner: ownerId },
        )
        if (lastSuccess.length > 0) {
          const ls = lastSuccess[0]
          nextIncrementalDate =
            ls.getString('sync_date') || formatDateToBR(ls.getString('started_at')) || '01/01/2000'
        }
      } catch (_) {}

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
          syncDate: rec.getString('sync_date'),
          isFullSync: rec.getBool('is_full_sync'),
          nextIncrementalDate: nextIncrementalDate,
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

// 5. Rota de teste/diagnóstico do novo endpoint getByDtAtz
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

// 7. Rota síncrona /backend/v1/flexsmart/sync (mantida por compatibilidade usando o novo endpoint)
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

      function cleanDigits(str) {
        if (!str) return ''
        return String(str).replace(/\D/g, '')
      }

      function pickFirst(obj, keys) {
        if (!obj || typeof obj !== 'object') return ''
        for (const k of keys) {
          const val = obj[k]
          if (val !== undefined && val !== null) {
            if (typeof val === 'object') {
              const nestedName = pickFirst(val, [
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

      const targetDate = '01/01/2000'
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
        erpList[i] = null
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

          let bairro = ''
          if (item.bairro && typeof item.bairro === 'object') {
            bairro = pickFirst(item.bairro, ['nmBairro', 'dsBairro', 'nome'])
          }
          if (!bairro) {
            bairro = pickFirst(item, ['bairro', 'dsBairro', 'nmBairro'])
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
            cityRaw = pickFirst(item.cidade, ['nmCidade', 'nome'])
            stateRaw = pickFirst(item.cidade, ['uf', 'sgUf'])
          }
          if (!cityRaw) cityRaw = pickFirst(item, ['nmCidade', 'cidade', 'municipio'])
          if (!stateRaw) stateRaw = pickFirst(item, ['uf', 'sgUf', 'estado'])

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
