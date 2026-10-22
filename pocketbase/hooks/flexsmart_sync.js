// flexsmart_sync.js - Integração com ERP FlexSmart
// 1. POST /login com username/password dos segredos -> AuthToken
// 2. Cache em memória do token ($app.store()) com re-login automático em caso de 401/403
// 3. GET /Cliente/getAll com header AuthToken
// 4. Mapeamento e deduplicação (erp_code e CPF/CNPJ) na coleção clients para o usuário daniel@impave.com.br
// 5. Rota POST /backend/v1/flexsmart/sync (requer autenticação PocketBase)
//
// NOTA: Sincronização estritamente MANUAL a pedido do usuário (sem cron / sem execução automática).
// Executada somente quando o usuário clica em "Importar do ERP FlexSmart" na interface.

// Nota de escopo do JSVM do PocketBase: cada callback (routerAdd) roda isolado em VM pool
// portanto toda a lógica executável deve residir inline dentro de seu respectivo callback.

routerAdd(
  'POST',
  '/backend/v1/flexsmart/sync',
  (e) => {
    let lastStep = 'init'
    try {
      function extractTokenFromResponse(jsonBody, rawBody) {
        if (jsonBody && typeof jsonBody === 'object') {
          // 1. Prioridade máxima: access_token (validado via Postman)
          if (typeof jsonBody.access_token === 'string' && jsonBody.access_token.trim()) {
            return { token: jsonBody.access_token.trim(), field: 'access_token' }
          }
          // Fallbacks: client_id, token, authToken, AuthToken, accessToken, jwt, id_token, data
          if (typeof jsonBody.client_id === 'string' && jsonBody.client_id.trim()) {
            return { token: jsonBody.client_id.trim(), field: 'client_id' }
          }
          if (typeof jsonBody.token === 'string' && jsonBody.token.trim()) {
            return { token: jsonBody.token.trim(), field: 'token' }
          }
          if (typeof jsonBody.authToken === 'string' && jsonBody.authToken.trim()) {
            return { token: jsonBody.authToken.trim(), field: 'authToken' }
          }
          if (typeof jsonBody.AuthToken === 'string' && jsonBody.AuthToken.trim()) {
            return { token: jsonBody.AuthToken.trim(), field: 'AuthToken' }
          }
          if (typeof jsonBody.accessToken === 'string' && jsonBody.accessToken.trim()) {
            return { token: jsonBody.accessToken.trim(), field: 'accessToken' }
          }
          if (typeof jsonBody.jwt === 'string' && jsonBody.jwt.trim()) {
            return { token: jsonBody.jwt.trim(), field: 'jwt' }
          }
          if (typeof jsonBody.id_token === 'string' && jsonBody.id_token.trim()) {
            return { token: jsonBody.id_token.trim(), field: 'id_token' }
          }
          if (typeof jsonBody.data === 'string' && jsonBody.data.trim()) {
            return { token: jsonBody.data.trim(), field: 'data' }
          }

          const nested = jsonBody.data || jsonBody.result || jsonBody.response
          if (nested && typeof nested === 'object') {
            const nestedRes = extractTokenFromResponse(nested, null)
            if (nestedRes) return { token: nestedRes.token, field: 'nested.' + nestedRes.field }
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
            return { token: str, field: 'rawBody' }
          }
        }

        if (typeof jsonBody === 'string' && jsonBody.trim().length > 10) {
          return { token: jsonBody.trim(), field: 'stringJsonBody' }
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

        let res
        let lastLoginError = null

        // Tentativa 1: POST application/json com body raw JSON (formato validado no Postman)
        try {
          res = $http.send({
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
        } catch (eJson) {
          lastLoginError = eJson
        }

        // Tentativa 2 (fallback): FormData
        if (!res || res.statusCode < 200 || res.statusCode >= 300) {
          try {
            const fd = new FormData()
            fd.append('username', username)
            fd.append('password', password)
            res = $http.send({
              url: base + '/login',
              method: 'POST',
              body: fd,
              headers: {
                Accept: 'application/json',
              },
              timeout: 30,
            })
          } catch (eFd) {
            lastLoginError = eFd
          }
        }

        // Tentativa 3 (fallback): application/x-www-form-urlencoded
        if (!res || res.statusCode < 200 || res.statusCode >= 300) {
          try {
            res = $http.send({
              url: base + '/login',
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
              },
              body:
                'username=' +
                encodeURIComponent(username) +
                '&password=' +
                encodeURIComponent(password),
              timeout: 30,
            })
          } catch (eUrl) {
            lastLoginError = eUrl
          }
        }

        if (!res) {
          throw new Error(
            'Falha de conexão ao tentar login no FlexSmart: ' +
              (lastLoginError ? String(lastLoginError) : 'sem resposta'),
          )
        }

        // Log das chaves presentes na resposta do login
        const keysList =
          res.json && typeof res.json === 'object' ? Object.keys(res.json).join(', ') : 'sem json'
        console.log(
          '[FlexSmart] Resposta do login (HTTP ' + res.statusCode + ') chaves: [' + keysList + ']',
        )

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const detail =
            res.json && (res.json.message || res.json.error)
              ? ': ' + (res.json.message || res.json.error)
              : ''
          throw new Error('Login no ERP FlexSmart falhou com HTTP ' + res.statusCode + detail)
        }

        const extracted = extractTokenFromResponse(res.json, res.body)
        if (!extracted || !extracted.token) {
          console.log(
            '[FlexSmart] Login retornou status ' +
              res.statusCode +
              ' mas formato do token não foi reconhecido. Chaves: [' +
              keysList +
              ']',
          )
          throw new Error('Token de autenticação não encontrado na resposta de login do FlexSmart')
        }

        const token = extracted.token
        const tokenField = extracted.field || 'desconhecido'
        const prefix = token.length >= 8 ? token.slice(0, 8) + '...' : token

        console.log('[FlexSmart] Token obtido (campo: ' + tokenField + ', prefixo: ' + prefix + ')')

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

        console.log('[FlexSmart] Buscando clientes em ' + base + '/Cliente/getAll')

        let res
        let lastErr = null

        // Tenta enviar com AuthToken
        try {
          res = $http.send({
            url: base + '/Cliente/getAll',
            method: 'GET',
            headers: {
              AuthToken: token,
              Authorization: 'Bearer ' + token,
              Accept: 'application/json',
            },
            timeout: 120,
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
          console.log(
            '[FlexSmart] Resposta ' +
              res.statusCode +
              ' recebida em /Cliente/getAll. Renovando token e tentando novamente...',
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
          throw new Error('Falha ao buscar clientes no ERP FlexSmart: HTTP ' + res.statusCode)
        }

        let dados = res.json

        // Se res.json não foi parseado automaticamente mas veio string no body
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
            'elements',
          ]
          for (const key of candidateKeys) {
            if (Array.isArray(dados[key])) {
              return dados[key]
            }
          }
          // Se houver qualquer propriedade que seja array
          for (const k of Object.keys(dados)) {
            if (Array.isArray(dados[k])) {
              return dados[k]
            }
          }
          // Se vier um único objeto cliente em vez de array
          if (
            dados.id ||
            dados.codigo ||
            dados.nome ||
            dados.razaoSocial ||
            dados.cnpj ||
            dados.cpf
          ) {
            return [dados]
          }
        }

        throw new Error(
          'Resposta de /Cliente/getAll não continha uma lista de clientes válida (formato inesperado do ERP)',
        )
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
      lastStep = 'find_user'

      let ownerId = null
      try {
        const user = $app.findAuthRecordByEmail('users', 'daniel@impave.com.br')
        ownerId = user.id
      } catch (e2) {
        throw new Error(
          'Usuário de demonstração daniel@impave.com.br não encontrado no banco de dados: ' +
            String(e2),
        )
      }

      lastStep = 'fetch_erp'
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
          // Suporte a campos aninhados ou variações comuns
          const erpCode = pickFirst(item, [
            'id',
            'codigo',
            'codCliente',
            'idCliente',
            'clienteId',
            'cod_cliente',
            'id_cliente',
            'codigoCliente',
            'cd_cliente',
            'cdCliente',
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
            'nr_documento',
            'nrDocumento',
          ])
          const docClean = cleanDigits(docRaw)

          const nameRaw = pickFirst(item, [
            'nome',
            'razaoSocial',
            'razao_social',
            'razao',
            'name',
            'nomeCliente',
            'nome_fantasia',
            'nomeFantasia',
            'fantasia',
            'descricao',
            'dsNome',
            'nmCliente',
            'nm_cliente',
            'ds_nome',
          ])

          const emailRaw = pickFirst(item, [
            'email',
            'e_mail',
            'dsEmail',
            'emailCliente',
            'ds_email',
            'mail',
          ])
          const phoneRaw = pickFirst(item, [
            'telefone',
            'fone',
            'phone',
            'celular',
            'tel',
            'telefone1',
            'telefone_1',
            'nrTelefone',
            'dsTelefone',
            'nr_telefone',
            'ds_telefone',
          ])
          const addressRaw = pickFirst(item, [
            'endereco',
            'address',
            'logradouro',
            'rua',
            'dsEndereco',
            'nmLogradouro',
            'ds_endereco',
            'logradouro_nome',
          ])
          const cityRaw = pickFirst(item, [
            'cidade',
            'city',
            'municipio',
            'dsCidade',
            'nmCidade',
            'ds_cidade',
            'nm_municipio',
          ])
          const stateRaw = pickFirst(item, [
            'uf',
            'estado',
            'state',
            'siglaUf',
            'dsUf',
            'sgUf',
            'ds_uf',
            'sg_uf',
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
      console.log('[FlexSmart] Falha na sincronização manual (passo ' + lastStep + '): ' + msg)
      return e.json(400, {
        error: msg,
        message: msg,
        step: lastStep,
        success: false,
      })
    }
  },
  $apis.requireAuth(),
)
