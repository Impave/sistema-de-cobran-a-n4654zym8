// flexsmart_sync.js - Integração com ERP FlexSmart
// 1. POST /login com username/password dos segredos -> AuthToken
// 2. Cache em memória do token ($app.store()) com re-login automático em caso de 401/403
// 3. GET /Cliente/getAll com header AuthToken
// 4. Mapeamento e deduplicação (erp_code e CPF/CNPJ) na coleção clients para o usuário daniel@impave.com.br
// 5. Rota POST /backend/v1/flexsmart/sync (requer autenticação PocketBase)
// 6. Job cron diário às 03:00 UTC (0 3 * * *)

// Nota de escopo do JSVM do PocketBase: cada callback (routerAdd, cronAdd) roda isolado em VM pool
// portanto toda a lógica executável deve residir inline dentro de seu respectivo callback.

routerAdd(
  'POST',
  '/backend/v1/flexsmart/sync',
  (e) => {
    try {
      function extractTokenFromResponse(jsonBody, rawBody) {
        if (jsonBody && typeof jsonBody === 'object') {
          if (typeof jsonBody.token === 'string' && jsonBody.token.trim())
            return jsonBody.token.trim()
          if (typeof jsonBody.authToken === 'string' && jsonBody.authToken.trim())
            return jsonBody.authToken.trim()
          if (typeof jsonBody.AuthToken === 'string' && jsonBody.AuthToken.trim())
            return jsonBody.AuthToken.trim()
          if (typeof jsonBody.access_token === 'string' && jsonBody.access_token.trim())
            return jsonBody.access_token.trim()
          if (typeof jsonBody.accessToken === 'string' && jsonBody.accessToken.trim())
            return jsonBody.accessToken.trim()
          if (typeof jsonBody.jwt === 'string' && jsonBody.jwt.trim()) return jsonBody.jwt.trim()
          if (typeof jsonBody.id_token === 'string' && jsonBody.id_token.trim())
            return jsonBody.id_token.trim()
          if (typeof jsonBody.data === 'string' && jsonBody.data.trim()) return jsonBody.data.trim()

          const nested = jsonBody.data || jsonBody.result || jsonBody.response
          if (nested && typeof nested === 'object') {
            const nestedToken = extractTokenFromResponse(nested, null)
            if (nestedToken) return nestedToken
          }
        }

        if (rawBody) {
          let str = ''
          if (typeof rawBody === 'string') {
            str = rawBody.trim()
          } else if (rawBody && rawBody.length) {
            for (let i = 0; i < Math.min(rawBody.length, 1000); i++) {
              str += String.fromCharCode(rawBody[i])
            }
            str = str.trim()
          }
          if (str.startsWith('"') && str.endsWith('"')) {
            str = str.slice(1, -1)
          }
          if (str.length > 10 && !str.startsWith('<') && !str.startsWith('{')) {
            return str
          }
        }

        return null
      }

      function getFlexSmartToken(forceRefresh) {
        const rawBase =
          $os.getenv('FLEXSMART_BASE_URL') ||
          ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
          'https://api.impave.com.br:8443'
        const base = rawBase.replace(/\/+$/, '')
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

        console.log('[FlexSmart] Realizando login em ' + base + '/login')

        const res = $http.send({
          url: base + '/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            username: username,
            password: password,
          }),
          timeout: 30,
        })

        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error('Falha no login FlexSmart: HTTP ' + res.statusCode)
        }

        const token = extractTokenFromResponse(res.json, res.body)
        if (!token) {
          console.log(
            '[FlexSmart] Login retornou status ' +
              res.statusCode +
              ' mas formato do token não foi reconhecido. Chaves: ' +
              (res.json ? Object.keys(res.json).join(',') : 'sem json'),
          )
          throw new Error('Token de autenticação não encontrado na resposta de login do FlexSmart')
        }

        try {
          if ($app.store) {
            $app.store().set('flexsmart_cached_token', token)
            $app.store().set('flexsmart_token_time', String(now))
          }
        } catch (_) {}

        console.log('[FlexSmart] Token obtido com sucesso')
        return token
      }

      function fetchClientesFromERP(forceRelogin) {
        const rawBase =
          $os.getenv('FLEXSMART_BASE_URL') ||
          ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
          'https://api.impave.com.br:8443'
        const base = rawBase.replace(/\/+$/, '')
        const token = getFlexSmartToken(forceRelogin)

        console.log('[FlexSmart] Buscando clientes em ' + base + '/Cliente/getAll')

        const res = $http.send({
          url: base + '/Cliente/getAll',
          method: 'GET',
          headers: {
            AuthToken: token,
            Accept: 'application/json',
          },
          timeout: 300,
        })

        if ((res.statusCode === 401 || res.statusCode === 403) && !forceRelogin) {
          console.log(
            '[FlexSmart] Resposta ' +
              res.statusCode +
              ' recebida. Renovando token e tentando novamente...',
          )
          try {
            if ($app.store) {
              $app.store().remove('flexsmart_cached_token')
              $app.store().remove('flexsmart_token_time')
            }
          } catch (_) {}
          return fetchClientesFromERP(true)
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error('Falha ao buscar clientes no FlexSmart: HTTP ' + res.statusCode)
        }

        const dados = res.json
        if (Array.isArray(dados)) {
          return dados
        }

        if (dados && typeof dados === 'object') {
          const candidateKeys = [
            'clientes',
            'clients',
            'data',
            'content',
            'items',
            'resultado',
            'lista',
            'records',
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

      console.log('[FlexSmart] Iniciando sincronização manual via API...')

      let ownerId = null
      try {
        const user = $app.findAuthRecordByEmail('users', 'daniel@impave.com.br')
        ownerId = user.id
      } catch (e2) {
        throw new Error(
          'Usuário de demonstração daniel@impave.com.br não encontrado no banco de dados.',
        )
      }

      const erpList = fetchClientesFromERP(false)
      console.log('[FlexSmart] Total de clientes retornados pelo ERP: ' + erpList.length)

      const existingRecords = $app.findRecordsByFilter(
        'clients',
        'owner = {:owner}',
        '-created',
        50000,
        0,
        { owner: ownerId },
      )

      const clientsByErpCode = new Map()
      const clientsByDoc = new Map()

      for (const rec of existingRecords) {
        const erpCode = rec.getString('erp_code')
        const doc = cleanDigits(rec.getString('document'))

        if (erpCode) {
          clientsByErpCode.set(erpCode, rec)
        }
        if (doc) {
          clientsByDoc.set(doc, rec)
        }
      }

      const clientsCol = $app.findCollectionByNameOrId('clients')
      let createdCount = 0
      let updatedCount = 0
      let errorCount = 0

      for (let i = 0; i < erpList.length; i++) {
        const item = erpList[i]
        if (!item || typeof item !== 'object') {
          errorCount++
          continue
        }

        try {
          const erpCode = pickFirst(item, [
            'id',
            'codigo',
            'codCliente',
            'idCliente',
            'clienteId',
            'cod_cliente',
            'id_cliente',
            'codigoCliente',
          ])

          const docRaw = pickFirst(item, [
            'cnpj',
            'cpf',
            'cnpjCpf',
            'cnpj_cpf',
            'cpf_cnpj',
            'cgccpf',
            'cgc',
            'documento',
            'doc',
            'nrCnpj',
            'nr_cnpj',
            'nrCpfCnpj',
          ])
          const docClean = cleanDigits(docRaw)

          const nameRaw = pickFirst(item, [
            'nome',
            'razaoSocial',
            'razao_social',
            'name',
            'nomeCliente',
            'nome_fantasia',
            'fantasia',
            'descricao',
            'dsNome',
            'nmCliente',
          ])

          const emailRaw = pickFirst(item, ['email', 'e_mail', 'dsEmail', 'emailCliente'])
          const phoneRaw = pickFirst(item, [
            'telefone',
            'fone',
            'phone',
            'celular',
            'tel',
            'telefone1',
            'nrTelefone',
            'dsTelefone',
          ])
          const addressRaw = pickFirst(item, [
            'endereco',
            'address',
            'logradouro',
            'rua',
            'dsEndereco',
            'nmLogradouro',
          ])
          const cityRaw = pickFirst(item, ['cidade', 'city', 'municipio', 'dsCidade', 'nmCidade'])
          const stateRaw = pickFirst(item, ['uf', 'estado', 'state', 'siglaUf', 'dsUf', 'sgUf'])

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

          if (addressRaw) {
            rec.set('address', addressRaw)
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
          console.log('[FlexSmart] Erro ao importar cliente #' + i + ': ' + String(itemErr))
          errorCount++
        }
      }

      const summary = {
        totalErp: erpList.length,
        created: createdCount,
        updated: updatedCount,
        errors: errorCount,
        success: true,
      }

      console.log(
        '[FlexSmart] Sincronização manual finalizada com sucesso! ' +
          'Total ERP: ' +
          summary.totalErp +
          ' | Criados: ' +
          summary.created +
          ' | Atualizados: ' +
          summary.updated +
          ' | Erros: ' +
          summary.errors,
      )

      return e.json(200, summary)
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.log('[FlexSmart] Falha na sincronização manual: ' + msg)
      return e.json(500, {
        error: msg,
        success: false,
      })
    }
  },
  $apis.requireAuth(),
)

// Cron job diário às 03:00 UTC (0 3 * * *)
cronAdd('flexsmart-sync-daily', '0 3 * * *', () => {
  try {
    function extractTokenFromResponse(jsonBody, rawBody) {
      if (jsonBody && typeof jsonBody === 'object') {
        if (typeof jsonBody.token === 'string' && jsonBody.token.trim())
          return jsonBody.token.trim()
        if (typeof jsonBody.authToken === 'string' && jsonBody.authToken.trim())
          return jsonBody.authToken.trim()
        if (typeof jsonBody.AuthToken === 'string' && jsonBody.AuthToken.trim())
          return jsonBody.AuthToken.trim()
        if (typeof jsonBody.access_token === 'string' && jsonBody.access_token.trim())
          return jsonBody.access_token.trim()
        if (typeof jsonBody.accessToken === 'string' && jsonBody.accessToken.trim())
          return jsonBody.accessToken.trim()
        if (typeof jsonBody.jwt === 'string' && jsonBody.jwt.trim()) return jsonBody.jwt.trim()
        if (typeof jsonBody.id_token === 'string' && jsonBody.id_token.trim())
          return jsonBody.id_token.trim()
        if (typeof jsonBody.data === 'string' && jsonBody.data.trim()) return jsonBody.data.trim()

        const nested = jsonBody.data || jsonBody.result || jsonBody.response
        if (nested && typeof nested === 'object') {
          const nestedToken = extractTokenFromResponse(nested, null)
          if (nestedToken) return nestedToken
        }
      }

      if (rawBody) {
        let str = ''
        if (typeof rawBody === 'string') {
          str = rawBody.trim()
        } else if (rawBody && rawBody.length) {
          for (let i = 0; i < Math.min(rawBody.length, 1000); i++) {
            str += String.fromCharCode(rawBody[i])
          }
          str = str.trim()
        }
        if (str.startsWith('"') && str.endsWith('"')) {
          str = str.slice(1, -1)
        }
        if (str.length > 10 && !str.startsWith('<') && !str.startsWith('{')) {
          return str
        }
      }

      return null
    }

    function getFlexSmartToken(forceRefresh) {
      const rawBase =
        $os.getenv('FLEXSMART_BASE_URL') ||
        ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
        'https://api.impave.com.br:8443'
      const base = rawBase.replace(/\/+$/, '')
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

      console.log('[FlexSmart] Realizando login no cron em ' + base + '/login')

      const res = $http.send({
        url: base + '/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password,
        }),
        timeout: 30,
      })

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error('Falha no login FlexSmart (cron): HTTP ' + res.statusCode)
      }

      const token = extractTokenFromResponse(res.json, res.body)
      if (!token) {
        throw new Error('Token de autenticação não encontrado na resposta de login do FlexSmart')
      }

      try {
        if ($app.store) {
          $app.store().set('flexsmart_cached_token', token)
          $app.store().set('flexsmart_token_time', String(now))
        }
      } catch (_) {}

      return token
    }

    function fetchClientesFromERP(forceRelogin) {
      const rawBase =
        $os.getenv('FLEXSMART_BASE_URL') ||
        ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
        'https://api.impave.com.br:8443'
      const base = rawBase.replace(/\/+$/, '')
      const token = getFlexSmartToken(forceRelogin)

      console.log('[FlexSmart] Cron buscando clientes em ' + base + '/Cliente/getAll')

      const res = $http.send({
        url: base + '/Cliente/getAll',
        method: 'GET',
        headers: {
          AuthToken: token,
          Accept: 'application/json',
        },
        timeout: 300,
      })

      if ((res.statusCode === 401 || res.statusCode === 403) && !forceRelogin) {
        console.log(
          '[FlexSmart] Cron recebeu ' +
            res.statusCode +
            '. Renovando token e tentando novamente...',
        )
        try {
          if ($app.store) {
            $app.store().remove('flexsmart_cached_token')
            $app.store().remove('flexsmart_token_time')
          }
        } catch (_) {}
        return fetchClientesFromERP(true)
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error('Falha ao buscar clientes no FlexSmart (cron): HTTP ' + res.statusCode)
      }

      const dados = res.json
      if (Array.isArray(dados)) {
        return dados
      }

      if (dados && typeof dados === 'object') {
        const candidateKeys = [
          'clientes',
          'clients',
          'data',
          'content',
          'items',
          'resultado',
          'lista',
          'records',
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

    console.log('[FlexSmart] Iniciando execução do cron diário flexsmart-sync-daily...')

    let ownerId = null
    try {
      const user = $app.findAuthRecordByEmail('users', 'daniel@impave.com.br')
      ownerId = user.id
    } catch (e2) {
      console.log('[FlexSmart] Cron abortado: usuário daniel@impave.com.br não encontrado.')
      return
    }

    const erpList = fetchClientesFromERP(false)
    console.log('[FlexSmart] Cron: clientes retornados pelo ERP: ' + erpList.length)

    const existingRecords = $app.findRecordsByFilter(
      'clients',
      'owner = {:owner}',
      '-created',
      50000,
      0,
      { owner: ownerId },
    )

    const clientsByErpCode = new Map()
    const clientsByDoc = new Map()

    for (const rec of existingRecords) {
      const erpCode = rec.getString('erp_code')
      const doc = cleanDigits(rec.getString('document'))

      if (erpCode) {
        clientsByErpCode.set(erpCode, rec)
      }
      if (doc) {
        clientsByDoc.set(doc, rec)
      }
    }

    const clientsCol = $app.findCollectionByNameOrId('clients')
    let createdCount = 0
    let updatedCount = 0
    let errorCount = 0

    for (let i = 0; i < erpList.length; i++) {
      const item = erpList[i]
      if (!item || typeof item !== 'object') {
        errorCount++
        continue
      }

      try {
        const erpCode = pickFirst(item, [
          'id',
          'codigo',
          'codCliente',
          'idCliente',
          'clienteId',
          'cod_cliente',
          'id_cliente',
          'codigoCliente',
        ])

        const docRaw = pickFirst(item, [
          'cnpj',
          'cpf',
          'cnpjCpf',
          'cnpj_cpf',
          'cpf_cnpj',
          'cgccpf',
          'cgc',
          'documento',
          'doc',
          'nrCnpj',
          'nr_cnpj',
          'nrCpfCnpj',
        ])
        const docClean = cleanDigits(docRaw)

        const nameRaw = pickFirst(item, [
          'nome',
          'razaoSocial',
          'razao_social',
          'name',
          'nomeCliente',
          'nome_fantasia',
          'fantasia',
          'descricao',
          'dsNome',
          'nmCliente',
        ])

        const emailRaw = pickFirst(item, ['email', 'e_mail', 'dsEmail', 'emailCliente'])
        const phoneRaw = pickFirst(item, [
          'telefone',
          'fone',
          'phone',
          'celular',
          'tel',
          'telefone1',
          'nrTelefone',
          'dsTelefone',
        ])
        const addressRaw = pickFirst(item, [
          'endereco',
          'address',
          'logradouro',
          'rua',
          'dsEndereco',
          'nmLogradouro',
        ])
        const cityRaw = pickFirst(item, ['cidade', 'city', 'municipio', 'dsCidade', 'nmCidade'])
        const stateRaw = pickFirst(item, ['uf', 'estado', 'state', 'siglaUf', 'dsUf', 'sgUf'])

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

        if (addressRaw) {
          rec.set('address', addressRaw)
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
        console.log('[FlexSmart] Cron: erro ao importar cliente #' + i + ': ' + String(itemErr))
        errorCount++
      }
    }

    console.log(
      '[FlexSmart] Cron diário concluído com sucesso! ' +
        'Total ERP: ' +
        erpList.length +
        ' | Criados: ' +
        createdCount +
        ' | Atualizados: ' +
        updatedCount +
        ' | Erros: ' +
        errorCount,
    )
  } catch (err) {
    console.log('[FlexSmart] Erro na execução do cron diário: ' + String(err))
  }
})
