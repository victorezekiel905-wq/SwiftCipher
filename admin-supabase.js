// ==================== ADMIN (SUPABASE) - USERS MANAGEMENT ====================
// Keeps UI simple: loads users from Supabase and provides role/status/delete actions.

(function () {
  async function loadAdminUsers() {
    if (!window.sbFetchAllUsers) return;
    try {
      const users = await window.sbFetchAllUsers();
      window.__ADMIN_USERS_CACHE = users || [];
    } catch (e) {
      window.__ADMIN_USERS_CACHE = [];
    }
  }

  // Called after navigating to admin route
  window.adminEnsureUsersLoaded = async function () {
    await loadAdminUsers();
    // Re-render admin after data arrives
    try {
      if (window.location.hash === '#/admin') {
        if (typeof render === 'function') render();
      }
    } catch (e) {}
  };

  function canModifyTarget(targetUserRow) {
    const myRole = (window.APP && APP.currentUser) ? APP.currentUser.role : 'user';
    const targetRole = (targetUserRow && targetUserRow.role) ? targetUserRow.role : 'user';

    if (myRole === 'super_admin') return true;

    // sub_admin limitations
    if (myRole === 'sub_admin') {
      if (targetRole === 'super_admin') return false;
      return false; // cannot change roles/suspend/delete
    }

    return false;
  }

  window.adminChangeUserRole = async function (userId, newRole) {
    if (!(typeof isSuperAdmin === 'function' && isSuperAdmin())) {
      showToast('Super Admin permission required', 'error');
      return;
    }

    const row = (window.__ADMIN_USERS_CACHE || []).find(u => u && u.id === userId);
    if (!row) return;

    if (row.role === 'super_admin') {
      showToast('Cannot change Super Admin role', 'error');
      return;
    }

    try {
      await window.sbUpdateUserById(userId, { role: newRole });
      showToast('Role updated', 'success');
      await loadAdminUsers();
      if (typeof render === 'function') render();
    } catch (e) {
      showToast('Failed to update role', 'error');
    }
  };

  window.adminSetUserStatus = async function (userId, status) {
    if (!(typeof isSuperAdmin === 'function' && isSuperAdmin())) {
      showToast('Super Admin permission required', 'error');
      return;
    }

    const row = (window.__ADMIN_USERS_CACHE || []).find(u => u && u.id === userId);
    if (!row) return;

    if (row.role === 'super_admin') {
      showToast('Cannot change Super Admin status', 'error');
      return;
    }

    try {
      await window.sbUpdateUserById(userId, { status });
      showToast('Status updated', 'success');
      await loadAdminUsers();
      if (typeof render === 'function') render();
    } catch (e) {
      showToast('Failed to update status', 'error');
    }
  };

  window.adminDeleteUser = async function (userId) {
    if (!(typeof isSuperAdmin === 'function' && isSuperAdmin())) {
      showToast('Super Admin permission required', 'error');
      return;
    }

    const row = (window.__ADMIN_USERS_CACHE || []).find(u => u && u.id === userId);
    if (!row) return;

    if (row.role === 'super_admin') {
      showToast('Cannot delete Super Admin', 'error');
      return;
    }

    if (!confirm('Delete this user permanently?')) return;

    try {
      await window.sbDeleteUserById(userId);
      showToast('User deleted', 'success');
      await loadAdminUsers();
      if (typeof render === 'function') render();
    } catch (e) {
      showToast('Failed to delete user', 'error');
    }
  };
})();
