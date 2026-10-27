migrate(
  (app) => {
    try {
      // 1. Atualizar valores permitidos do campo status na collection flex_sync para garantir que 'failed' é aceito
      // Valores permitidos: pending, running, cancelling, cancelled, done, error, failed
      const col = app.findCollectionByNameOrId('flex_sync')
      const statusField = col.fields.getByName('status')
      if (statusField && statusField.values) {
        let hasFailed = false
        for (let v = 0; v < statusField.values.length; v++) {
          if (statusField.values[v] === 'failed') {
            hasFailed = true
            break
          }
        }
        if (!hasFailed) {
          statusField.values.push('failed')
          app.save(col)
          console.log(
            '[Migration 0047] Adicionado valor "failed" aos valores válidos de status em flex_sync',
          )
        }
      }
    } catch (colErr) {
      console.log('[Migration 0047] Aviso ao verificar campo status:', String(colErr))
    }

    try {
      // 2. Finalizar registros travados em running, pending ou cancelling parados há mais de 30 minutos
      const activeJobs = app.findRecordsByFilter(
        'flex_sync',
        "status = 'running' || status = 'pending' || status = 'cancelling'",
        '-created',
        100,
        0,
      )

      if (!activeJobs || activeJobs.length === 0) return

      const nowMs = Date.now()
      const thresholdMs = 30 * 60 * 1000 // 30 minutos

      for (let i = 0; i < activeJobs.length; i++) {
        const job = activeJobs[i]
        try {
          const updatedStr = job.getString('updated') || job.getString('created')
          let isStale = true
          if (updatedStr) {
            const updatedTime = new Date(updatedStr).getTime()
            if (!isNaN(updatedTime) && nowMs - updatedTime < thresholdMs) {
              isStale = false
            }
          }

          if (isStale) {
            job.set('status', 'failed')
            job.set('error', 'finalizado automaticamente por inatividade (migração)')
            job.set('finished_at', new Date().toISOString())
            job.set(
              'current_step',
              'Sincronização finalizada automaticamente por inatividade (migração).',
            )
            app.save(job)
            console.log(
              '[Migration 0047] Job de sincronização travado finalizado como failed:',
              job.id,
            )
          }
        } catch (jobErr) {
          console.log('[Migration 0047] Aviso ao processar job ' + job.id + ':', String(jobErr))
        }
      }
    } catch (err) {
      console.log('[Migration 0047] Erro ao limpar jobs travados:', String(err))
    }
  },
  (app) => {
    // Reversão no-op
  },
)
