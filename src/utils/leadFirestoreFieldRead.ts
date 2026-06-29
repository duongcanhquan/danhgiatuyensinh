/** Đọc chuỗi đầu tiên khác rỗng từ doc Firestore (hỗ trợ nhiều tên cột legacy). */
export function pickFirstFirestoreString(data: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = data[k]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

/**
 * Gom các trường hồ sơ từ document Firestore thô — dùng chung `mapDoc` và chấm điểm.
 * Nguồn import / CRM cũ có thể lưu tên field khác nhau; ưu tiên cột chuẩn rồi alias.
 */
export function readLeadSemanticFieldsFromFirestore(data: Record<string, unknown>) {
  const province = pickFirstFirestoreString(data, [
    'province',
    'region',
    'tinh',
    'tinhThanhPho',
    'tinhThanh',
  ])
  const hanoiArea = pickFirstFirestoreString(data, [
    'hanoiArea',
    'district',
    'quanHuyen',
    'quan',
    'districtName',
    'quanHuyenHaNoi',
  ])
  const highSchool = pickFirstFirestoreString(data, [
    'highSchool',
    'highSchoolName',
    'schoolName',
    'truongHoc',
    'truongTHPT',
    'tenTruong',
  ])
  const majorInterest = pickFirstFirestoreString(data, ['majorInterest', 'major', 'nganh', 'nganhQuanTam'])
  const academicPerformance = pickFirstFirestoreString(data, [
    'academicPerformance',
    'academicLevel',
    'hocLuc',
    'xepLoai',
    'ranking',
  ])
  const schoolType = pickFirstFirestoreString(data, [
    'schoolType',
    'loaiHinhTruong',
    'loaiTruong',
    'schoolTypeLabel',
  ])
  const source1Raw = pickFirstFirestoreString(data, ['source1', 'source', 'leadSource', 'nguon', 'nguonTiepNhan'])
  const source2Raw = pickFirstFirestoreString(data, ['source2', 'nguon2'])
  const financialStatus = pickFirstFirestoreString(data, ['financialStatus', 'taiChinh', 'financialProfile'])
  const studyIntention = pickFirstFirestoreString(data, ['studyIntention', 'hinhThucHoc'])
  const educationLevelRaw = pickFirstFirestoreString(data, ['educationLevel', 'trinhDo'])
  const permanentAddressRaw = pickFirstFirestoreString(data, [
    'permanentAddress',
    'diaChiThuongTru',
    'hoKhau',
  ])
  const addressRaw = pickFirstFirestoreString(data, ['address', 'diaChi', 'diaChiLienHe'])
  const address = permanentAddressRaw || addressRaw

  return {
    province,
    hanoiArea,
    highSchool,
    majorInterest,
    academicPerformance,
    schoolType,
    source1Raw,
    source2Raw,
    sourcePrimary: source1Raw,
    financialStatus,
    studyIntention,
    educationLevelRaw,
    permanentAddressRaw,
    addressRaw,
    address,
  }
}
