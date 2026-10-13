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
