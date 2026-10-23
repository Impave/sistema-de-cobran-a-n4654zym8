onRecordCreate((e) => {
  const status = e.record.getString('status')
  const dueDateStr = e.record.getString('due_date')
  if (status === 'pending' && dueDateStr) {
    const dueDate = new Date(dueDateStr)
    const now = new Date()
    if (dueDate.getTime() < now.getTime()) {
      e.record.set('status', 'overdue')
    }
  }
  e.next()
}, 'charges')

onRecordUpdate((e) => {
  const status = e.record.getString('status')
  const dueDateStr = e.record.getString('due_date')
  if (status === 'pending' && dueDateStr) {
    const dueDate = new Date(dueDateStr)
    const now = new Date()
    if (dueDate.getTime() < now.getTime()) {
      e.record.set('status', 'overdue')
    }
  }
  e.next()
}, 'charges')

onRecordUpdate((e) => {
  try {
    const testFlag = e.record.getString('error')
    if (testFlag === 'DUMP_JSON_ALL') {
      const sampleRaw = e.record.getString('sample')
      const parsed = JSON.parse(sampleRaw)
      const keys = Object.keys(parsed)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        console.log('[FIELD_' + (i + 1) + '] ' + k + ' => ' + JSON.stringify(parsed[k]))
      }
      e.record.set('error', 'DUMP_ALL_COMPLETED')
    }
  } catch (err) {
    console.log('[FlexSmart-Dump] Erro: ' + String(err))
  }
  e.next()
}, 'flex_sync')
