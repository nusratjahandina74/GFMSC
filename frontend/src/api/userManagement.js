import api from './client';

// SuperAdmin: unified list of every account on the platform, with optional
// filters — this powers the "everyone in one place" list on the dashboard.
export const listAllUsers = async (params = {}) => {
  const response = await api.get('/manage/users', { params });
  return response.data;
};

// SuperAdmin (or the account's own school admin, per backend rules):
// hold/unhold (suspend/unsuspend) or activate/deactivate a user account.
export const updateUserStatus = async (userId, payload) => {
  const response = await api.patch(`/manage/users/${userId}/status`, payload);
  return response.data;
};

// SuperAdmin: permanently delete a user account (cannot delete a superAdmin).
export const deleteUserAccount = async (userId) => {
  const response = await api.delete(`/manage/users/${userId}`);
  return response.data;
};
