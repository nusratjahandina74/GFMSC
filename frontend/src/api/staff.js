import apiClient from './client';

export const getStaff = async (params = {}) => {
  try {
    const response = await apiClient.get('/staff', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching staff:', error);
    throw error;
  }
};

export const getStaffById = async (id) => {
  try {
    const response = await apiClient.get(`/staff/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching staff:', error);
    throw error;
  }
};

export const createStaff = async (staffData) => {
  try {
    const response = await apiClient.post('/staff', staffData);
    return response.data;
  } catch (error) {
    console.error('Error creating staff:', error);
    throw error;
  }
};

export const updateStaff = async (id, staffData) => {
  try {
    const response = await apiClient.put(`/staff/${id}`, staffData);
    return response.data;
  } catch (error) {
    console.error('Error updating staff:', error);
    throw error;
  }
};

export const deleteStaff = async (id) => {
  try {
    const response = await apiClient.delete(`/staff/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting staff:', error);
    throw error;
  }
};
