export function requiresWarehouseAssignment(role) {
  return String(role || '').toLowerCase() === 'petugas';
}

export function isWarehouseAssignmentOptional(role) {
  return String(role || '').toLowerCase() === 'manager';
}

export function requiresVendorAssignment(role) {
  return String(role || '').toLowerCase() === 'vendor';
}

export function buildUserRegistrationPayload(form) {
  const role = String(form?.role || '').toLowerCase();
  const rawWarehouseId = form?.ID_gudang;
  const rawVendorId = form?.ID_vendor;

  const parsedWarehouseId = rawWarehouseId === '' || rawWarehouseId === null || rawWarehouseId === undefined
    ? null
    : Number(rawWarehouseId);
  const parsedVendorId = rawVendorId === '' || rawVendorId === null || rawVendorId === undefined
    ? null
    : Number(rawVendorId);

  return {
    nama: form?.nama || '',
    email: form?.email || '',
    password: form?.password || '',
    password_confirmation: form?.password || '',
    role,
    ID_vendor: requiresVendorAssignment(role) ? parsedVendorId : null,
    ID_gudang: requiresWarehouseAssignment(role) || isWarehouseAssignmentOptional(role) ? parsedWarehouseId : null,
  };
}

export function getAssignedWarehouseId(user, fallbackValue = null) {
  if (user?.ID_gudang !== null && user?.ID_gudang !== undefined && user?.ID_gudang !== '') {
    return Number(user.ID_gudang);
  }

  if (fallbackValue === null || fallbackValue === undefined || fallbackValue === '') {
    return fallbackValue;
  }

  return Number(fallbackValue);
}
