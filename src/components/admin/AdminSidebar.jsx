import React from 'react';
import AppSidebar from '../navigation/AppSidebar';

const AdminSidebar = ({ activeTab, onChangeTab, onLogout }) => {
  const items = [
    { value: 'users', label: 'User', icon: 'fa-solid fa-users-gear' },
    { value: 'vendors', label: 'Vendor', icon: 'fa-solid fa-building' },
    { value: 'activity', label: 'Aktivitas', icon: 'fa-solid fa-list-check' },
  ];

  return (
    <AppSidebar
      activeValue={activeTab}
      brand="Evy"
      brandMeta="Admin"
      items={items}
      onSelect={onChangeTab}
      onSignOut={onLogout}
    />
  );
};

export default AdminSidebar;
