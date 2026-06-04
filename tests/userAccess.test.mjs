import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserRegistrationPayload,
  getAssignedWarehouseId,
  isWarehouseAssignmentOptional,
  requiresWarehouseAssignment,
  requiresVendorAssignment,
} from '../src/utils/userAccess.js';

describe('requiresWarehouseAssignment', () => {
  it('requires warehouse assignment only for petugas', () => {
    assert.equal(requiresWarehouseAssignment('petugas'), true);
    assert.equal(requiresWarehouseAssignment('manager'), false);
    assert.equal(requiresWarehouseAssignment('vendor'), false);
    assert.equal(requiresWarehouseAssignment('admin'), false);
  });
});

describe('isWarehouseAssignmentOptional', () => {
  it('marks manager warehouse as optional and other roles as false', () => {
    assert.equal(isWarehouseAssignmentOptional('manager'), true);
    assert.equal(isWarehouseAssignmentOptional('petugas'), false);
    assert.equal(isWarehouseAssignmentOptional('vendor'), false);
    assert.equal(isWarehouseAssignmentOptional('admin'), false);
  });
});

describe('requiresVendorAssignment', () => {
  it('requires vendor assignment only for vendor role', () => {
    assert.equal(requiresVendorAssignment('vendor'), true);
    assert.equal(requiresVendorAssignment('petugas'), false);
  });
});

describe('buildUserRegistrationPayload', () => {
  it('builds petugas payload with assigned warehouse and no vendor', () => {
    assert.deepEqual(
      buildUserRegistrationPayload({
        nama: 'Petugas A',
        email: 'petugas@example.com',
        password: 'secret123',
        role: 'petugas',
        ID_vendor: '7',
        ID_gudang: '3',
      }),
      {
        nama: 'Petugas A',
        email: 'petugas@example.com',
        password: 'secret123',
        password_confirmation: 'secret123',
        role: 'petugas',
        ID_vendor: null,
        ID_gudang: 3,
      },
    );
  });

  it('builds manager payload with optional warehouse', () => {
    assert.deepEqual(
      buildUserRegistrationPayload({
        nama: 'Manager A',
        email: 'manager@example.com',
        password: 'secret123',
        role: 'manager',
        ID_vendor: '',
        ID_gudang: '2',
      }),
      {
        nama: 'Manager A',
        email: 'manager@example.com',
        password: 'secret123',
        password_confirmation: 'secret123',
        role: 'manager',
        ID_vendor: null,
        ID_gudang: 2,
      },
    );
  });

  it('builds vendor payload with vendor assignment and no warehouse', () => {
    assert.deepEqual(
      buildUserRegistrationPayload({
        nama: 'Vendor A',
        email: 'vendor@example.com',
        password: 'secret123',
        role: 'vendor',
        ID_vendor: '9',
        ID_gudang: '1',
      }),
      {
        nama: 'Vendor A',
        email: 'vendor@example.com',
        password: 'secret123',
        password_confirmation: 'secret123',
        role: 'vendor',
        ID_vendor: 9,
        ID_gudang: null,
      },
    );
  });
});

describe('getAssignedWarehouseId', () => {
  it('reads assigned warehouse from authenticated user when available', () => {
    assert.equal(getAssignedWarehouseId({ ID_gudang: 5 }, 1), 5);
  });

  it('falls back to provided value when user has no assigned warehouse', () => {
    assert.equal(getAssignedWarehouseId({ ID_gudang: null }, 4), 4);
    assert.equal(getAssignedWarehouseId(null, 2), 2);
  });
});
