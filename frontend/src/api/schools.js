import api from './client';

// SuperAdmin: list all schools with their admins
export const listSchools = async () => {
  const response = await api.get('/schools');
  return response.data;
};

// SuperAdmin: create a new school + its first schoolAdmin in one step
export const createSchool = async (payload) => {
  const response = await api.post('/schools', payload);
  return response.data;
};

// Get the logged-in admin's own school. Throws with response.data.needsSchoolSetup
// === true (404) if the account has no school linked yet.
export const getMySchool = async () => {
  const response = await api.get('/schools/me');
  return response.data;
};

// Update the logged-in admin's own school info.
export const updateMySchool = async (schoolData) => {
  const response = await api.put('/schools/me', schoolData);
  return response.data;
};

// SuperAdmin: edit any school (and its schoolAdmin's name/email) by id
export const updateSchool = async (id, payload) => {
  const response = await api.put(`/schools/${id}`, payload);
  return response.data;
};

// SuperAdmin: delete any school + its schoolAdmin account by id
export const deleteSchool = async (id) => {
  const response = await api.delete(`/schools/${id}`);
  return response.data;
};

// First-time setup for an account that has no school yet (e.g. an older
// self-registered admin account created before this feature existed).
// The backend returns a FRESH token (now carrying the new schoolId) — the
// caller must store it, since every other request depends on it.
export const setupMySchool = async (schoolData) => {
  const response = await api.post('/schools/me', schoolData);
  const { token, user } = response.data;
  if (token) {
    localStorage.setItem('token', token);
  }
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  }
  return response.data;
};
