// Utilidades compartidas para vincular gastos, anticipos y pagos de nómina con la caja abierta.

function getOpenShift(db) {
  return db.prepare("SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();
}

/** Registra un retiro de efectivo en el turno abierto. Devuelve { id, shiftId } o { error }. */
function registerCashWithdrawal(db, amount, reason, cashierName) {
  const shift = getOpenShift(db);
  if (!shift) return { error: 'No hay un turno de caja abierto para descontar el efectivo' };
  const r = db.prepare(`
    INSERT INTO cash_movements (shift_id, type, amount, reason, cashier_name, created_at)
    VALUES (?, 'withdrawal', ?, ?, ?, datetime('now', '-5 hours'))
  `).run(shift.id, Math.round(Number(amount)), String(reason).slice(0, 120), cashierName || 'Sistema');
  return { id: Number(r.lastInsertRowid), shiftId: shift.id };
}

/** Elimina un movimiento de caja solo si su turno sigue abierto (los cerrados son históricos). */
function removeCashMovementIfOpen(db, movementId) {
  if (!movementId) return false;
  const m = db.prepare('SELECT m.id, s.status FROM cash_movements m JOIN cash_shifts s ON s.id = m.shift_id WHERE m.id = ?').get(movementId);
  if (!m || m.status !== 'open') return false;
  db.prepare('DELETE FROM cash_movements WHERE id = ?').run(movementId);
  return true;
}

function today(db) {
  return db.prepare("SELECT date('now', '-5 hours') AS d").get().d;
}

function now(db) {
  return db.prepare("SELECT datetime('now', '-5 hours') AS d").get().d;
}

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

/** Al abrir caja: registra la asistencia del colaborador vinculado al usuario (o con el mismo nombre del cajero). */
function registerAttendanceForShift(db, shift, user) {
  try {
    let emp = null;
    if (user && user.id) emp = db.prepare('SELECT id FROM employees WHERE user_id = ? AND active = 1').get(user.id);
    if (!emp && shift && shift.cashier_name) emp = db.prepare('SELECT id FROM employees WHERE LOWER(name) = LOWER(?) AND active = 1').get(String(shift.cashier_name).trim());
    if (!emp) return null;
    db.prepare(`INSERT INTO attendance (employee_id, date, check_in, shift_id, source)
      VALUES (?, date('now', '-5 hours'), datetime('now', '-5 hours'), ?, 'auto')
      ON CONFLICT(employee_id, date) DO UPDATE SET shift_id = excluded.shift_id, check_in = COALESCE(attendance.check_in, excluded.check_in)`).run(emp.id, shift.id);
    return emp.id;
  } catch (err) {
    console.error('No se pudo registrar la asistencia automática:', err.message);
    return null;
  }
}

/** Al cerrar caja: marca la salida y calcula las horas de las asistencias abiertas de ese turno. */
function closeAttendanceForShift(db, shiftId) {
  try {
    db.prepare(`UPDATE attendance SET check_out = datetime('now', '-5 hours'),
      hours = ROUND(MAX(0, (julianday(datetime('now', '-5 hours')) - julianday(COALESCE(check_in, datetime('now', '-5 hours')))) * 24), 2)
      WHERE shift_id = ? AND check_out IS NULL`).run(shiftId);
  } catch (err) {
    console.error('No se pudo cerrar la asistencia automática:', err.message);
  }
}

module.exports = { getOpenShift, registerCashWithdrawal, removeCashMovementIfOpen, today, now, isDate, registerAttendanceForShift, closeAttendanceForShift };
