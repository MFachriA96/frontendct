export const getRoleDestination = (role) => {
  const resolvedRole = String(role || '').toLowerCase();

  if (resolvedRole === 'vendor') {
    return {
      path: '/vendor-dashboard',
      message: 'Menyiapkan workspace vendor...',
    };
  }

  if (resolvedRole === 'staff' || resolvedRole === 'petugas' || resolvedRole === 'petugas scan') {
    return {
      path: '/scan-officer-dashboard',
      message: 'Menyiapkan scanner workspace...',
    };
  }

  if (resolvedRole === 'manager') {
    return {
      path: '/manager-dashboard',
      message: 'Menyiapkan dashboard manager...',
    };
  }

  if (resolvedRole === 'admin') {
    return {
      path: '/admin-dashboard',
      message: 'Menyiapkan workspace admin...',
    };
  }

  return null;
};

export const getStoredAuthRedirect = (storage) => {
  if (!storage) return null;

  const token = storage.getItem('token');
  const rawUser = storage.getItem('user');

  if (!token || !rawUser) return null;

  try {
    const user = JSON.parse(rawUser);
    return getRoleDestination(user?.role);
  } catch {
    return null;
  }
};
