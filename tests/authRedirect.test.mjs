import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRoleDestination, getStoredAuthRedirect } from '../src/utils/authRedirect.js';

describe('getRoleDestination', () => {
  it('maps supported roles to their dashboard path', () => {
    assert.equal(getRoleDestination('vendor')?.path, '/vendor-dashboard');
    assert.equal(getRoleDestination('petugas')?.path, '/scan-officer-dashboard');
    assert.equal(getRoleDestination('petugas scan')?.path, '/scan-officer-dashboard');
    assert.equal(getRoleDestination('manager')?.path, '/manager-dashboard');
    assert.equal(getRoleDestination('admin')?.path, '/admin-dashboard');
  });

  it('returns null for unknown role', () => {
    assert.equal(getRoleDestination('guest'), null);
    assert.equal(getRoleDestination(''), null);
  });
});

describe('getStoredAuthRedirect', () => {
  it('returns redirect info when token and stored user are valid', () => {
    const storage = {
      getItem(key) {
        if (key === 'token') return 'abc123';
        if (key === 'user') return JSON.stringify({ role: 'vendor' });
        return null;
      },
    };

    assert.deepEqual(getStoredAuthRedirect(storage), {
      path: '/vendor-dashboard',
      message: 'Menyiapkan workspace vendor...',
    });
  });

  it('returns null when auth data is incomplete or invalid', () => {
    assert.equal(getStoredAuthRedirect(null), null);
    assert.equal(getStoredAuthRedirect({ getItem: () => null }), null);
    assert.equal(getStoredAuthRedirect({
      getItem(key) {
        if (key === 'token') return 'abc123';
        if (key === 'user') return '{bad json';
        return null;
      },
    }), null);
  });
});
