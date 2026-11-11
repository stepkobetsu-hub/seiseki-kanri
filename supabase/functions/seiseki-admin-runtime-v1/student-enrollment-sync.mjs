export function enrollmentStatusFromMasterFlag(value) {
  if (value === 1 || String(value ?? '').trim() === '1') return 'active';
  if (value === 0 || String(value ?? '').trim() === '0') return 'withdrawal_scheduled';
  if (value === null || value === undefined || String(value).trim() === '') return 'withdrawn';
  throw new Error('Invalid enrollment flag');
}

export function studentIndexRowFromDirectoryDetail(item, fetchedAt) {
  const student = item?.student || {};
  const studentCode = String(student.id ?? '').trim();
  const status = enrollmentStatusFromMasterFlag(student.flag);
  return {
    student_code: studentCode,
    name: String(student.name ?? '').trim(),
    name_kana: String(student.kana ?? '').trim() || null,
    campus: String(student.campus ?? '').trim() || null,
    grade: String(student.grade ?? '').trim() || null,
    school_name: String(student.school ?? '').trim() || null,
    active: status === 'active',
    enrollment_status: status,
    source_updated_at: fetchedAt,
  };
}

function comparable(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function studentIndexRowChanged(next, current) {
  if (!current) return true;
  return ['name', 'name_kana', 'campus', 'grade', 'school_name', 'enrollment_status']
    .some(key => comparable(next[key]) !== comparable(current[key]))
    || Boolean(next.active) !== Boolean(current.active);
}

export function summarizeStudentIndexSync(nextRows, currentRows) {
  const currentByCode = new Map(currentRows.map(row => [String(row.student_code), row]));
  let added = 0;
  let updated = 0;
  for (const row of nextRows) {
    const current = currentByCode.get(String(row.student_code));
    if (!current) added++;
    else if (studentIndexRowChanged(row, current)) updated++;
  }
  return { added, updated, changed: added + updated, total: nextRows.length };
}
