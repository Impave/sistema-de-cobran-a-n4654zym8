cronAdd('charge_overdue_sync', '@hourly', () => {
  try {
    const nowIso = new Date().toISOString().replace('T', ' ').replace('Z', '')
    const pendingOverdueCharges = $app.findRecordsByFilter(
      'charges',
      `status = 'pending' && due_date < '${nowIso}'`,
      '-created',
      500,
      0,
    )

    for (let i = 0; i < pendingOverdueCharges.length; i++) {
      const charge = pendingOverdueCharges[i]
      charge.set('status', 'overdue')
      $app.save(charge)
    }
  } catch (err) {
    console.error('Erro no cron charge_overdue_sync:', err)
  }
})
